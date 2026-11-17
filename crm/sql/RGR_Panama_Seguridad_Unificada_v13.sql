-- RGR PANAMA | SEGURIDAD CONSOLIDADA - FASE DE BASE DE DATOS
-- Ejecutar UNA sola vez en Supabase SQL Editor, despues de revisar el contenido.
-- Adaptado a las tablas y RPC verificadas en los dos CSV aportados.
-- Transaccion: cualquier error revierte el conjunto.
-- NO sustituye desplegar la Edge Function ni auditar las RLS de otros modulos.

begin;

-- Precondiciones que evitan sobreescribir una estructura no examinada.
do $precheck$
declare
  v_len integer;
  v_check text;
begin
  if to_regclass('public.usuarios') is null or to_regclass('public.roles') is null then
    raise exception 'Faltan public.usuarios o public.roles';
  end if;
  select character_maximum_length into v_len from information_schema.columns
    where table_schema='public' and table_name='usuarios' and column_name='estado_usuario';
  if v_len is not null and v_len < 11 then
    raise exception 'Amplie estado_usuario antes de ejecutar esta migracion';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid='public.usuarios'::regclass and conname='usuarios_estado_usuario_check';
  if v_check is null or v_check not ilike '%BLOQUEADO%' or v_check not ilike '%POR VALIDAR%' then
    raise exception 'Debe existir CHECK con los cuatro estados en public.usuarios';
  end if;
  if not exists (select 1 from public.roles where id_rol=1 and estado_rol='ACTIVO') then
    raise exception 'El rol 1 no existe o esta inactivo';
  end if;
  if to_regprocedure('public.admin_asignar_rol_usuario(bigint,bigint)') is null then
    raise exception 'No se encontro la funcion de asignacion de roles esperada';
  end if;
end $precheck$;

-- 1. AUTORIZACION: administrador = rol 1 + cuenta y rol activos.
-- Preserva la signatura publica existente utilizada por Flutter.
create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1 from public.usuarios u
    join public.roles r on r.id_rol=u.id_rol
    where u.auth_user_id=auth.uid()
      and u.id_rol=1
      and u.estado_usuario='ACTIVO'
      and r.estado_rol='ACTIVO'
  );
$fn$;
revoke all on function public.es_admin() from public,anon;
grant execute on function public.es_admin() to authenticated;

-- 2. PROTECCION DE ASIGNACION DE ROLES.
-- Un administrador solo puede asignar roles NO ADMINISTRATIVOS
-- a cuentas que ya son NO ADMINISTRATIVAS y que no estan en recuperacion.
create or replace function public.admin_asignar_rol_usuario(
  p_id_usuario bigint, p_id_rol bigint)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_target public.usuarios%rowtype;
begin
  if not public.es_admin() then
    raise exception 'Acceso administrativo denegado' using errcode='42501';
  end if;
  if p_id_rol=1 then
    raise exception 'La asignacion de rol administrador solo corresponde al DBA' using errcode='42501';
  end if;
  if not exists (select 1 from public.roles
                 where id_rol=p_id_rol and estado_rol='ACTIVO') then
    raise exception 'Rol inexistente o inactivo';
  end if;
  select * into v_target from public.usuarios
    where id_usuario=p_id_usuario for update;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target.id_rol=1 then
    raise exception 'No se permite administrar otra cuenta administradora' using errcode='42501';
  end if;
  if v_target.estado_usuario not in ('ACTIVO','INACTIVO') then
    raise exception 'La cuenta requiere resolucion de seguridad' using errcode='42501';
  end if;
  update public.usuarios set id_rol=p_id_rol where id_usuario=p_id_usuario;
end;
$fn$;
revoke all on function public.admin_asignar_rol_usuario(bigint,bigint)
  from public,anon;
-- El CRM modifica roles exclusivamente desde la Edge Function, tras
-- verificar la contrasena. Sin permiso EXECUTE directo para authenticated.
-- La asignacion de roles de administradores en Flutter debera migrar al
-- mismo servicio antes de desplegar esta version.
revoke execute on function public.admin_asignar_rol_usuario(bigint,bigint)
  from authenticated;

-- 3. VISIBILIDAD: el administrador ve solo usuarios no administradores.
-- Cada cuenta mantiene el derecho a ver su PROPIO perfil.
alter policy usuarios_select_own_or_admin on public.usuarios
  to authenticated
  using (
    (auth_user_id=auth.uid() and estado_usuario='ACTIVO')
    or (public.es_admin() and id_rol<>1)
  );

-- 4. ACTUALIZACION: solo perfil propio directamente desde JWT.
-- Las operaciones sobre otros usuarios quedan para el servicio seguro.
-- Esto afecta a pantallas antiguas que escribian perfiles ajenos desde Flutter.
alter policy usuarios_update_own_or_admin on public.usuarios
  to authenticated
  using (auth_user_id=auth.uid() and estado_usuario='ACTIVO' and id_rol<>1)
  with check (auth_user_id=auth.uid() and estado_usuario='ACTIVO' and id_rol<>1);


-- Las cuentas inactivas/bloqueadas tampoco consultan el catalogo de roles
-- mediante la politica de lectura general. El usuario activo en Flutter
-- continua pudiendo leer los roles con su sesion ordinaria.
alter policy roles_read_authenticated on public.roles
  to authenticated using (public.mi_id_usuario() is not null);

-- Los CRUD de roles del CRM pasan por Edge tras contraseña.
-- El catalogo de roles sigue disponible para SELECT de cuentas activas.
revoke insert, update, delete on table public.roles from authenticated;

-- 5. TRIGGERS DEFENSIVOS: evitan que RPC elevados salten la proteccion
-- mientras se conserva la gestion de roles no administrativos.
create or replace function public.rgr_guard_usuarios_v12()
returns trigger
language plpgsql security invoker set search_path = ''
as $fn$
declare
  v_role text := coalesce(auth.role(),'');
  v_backend boolean := (v_role='service_role' or
                       (v_role='' and current_user='postgres'));
begin
  if tg_op='INSERT' then
    if not v_backend and (new.id_rol=1 or
       new.estado_usuario in ('BLOQUEADO','POR VALIDAR')) then
      raise exception 'Registro reservado a seguridad/DBA' using errcode='42501';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    if not v_backend then
      raise exception 'Los perfiles deben darse de baja logicamente' using errcode='42501';
    end if;
    return old;
  end if;
  if not v_backend then
    if old.auth_user_id is distinct from new.auth_user_id then
      raise exception 'Identidad protegida' using errcode='42501';
    end if;
    if old.estado_usuario is distinct from new.estado_usuario or
       old.estado_usuario in ('BLOQUEADO','POR VALIDAR') then
      raise exception 'Cambio de estado reservado a seguridad' using errcode='42501';
    end if;
    if old.id_rol=1 or new.id_rol=1 then
      if old.auth_user_id is distinct from auth.uid() or
         old.id_rol is distinct from new.id_rol then
        raise exception 'No se permite modificar otro administrador' using errcode='42501';
      end if;
    elsif old.id_rol is distinct from new.id_rol and not public.es_admin() then
      raise exception 'Cambio de rol no autorizado' using errcode='42501';
    end if;
  end if;
  return new;
end;
$fn$;
drop trigger if exists rgr_guard_usuarios_v11 on public.usuarios;
drop trigger if exists rgr_guard_usuarios_v12 on public.usuarios;
create trigger rgr_guard_usuarios_v12
  before insert or update or delete on public.usuarios
  for each row execute function public.rgr_guard_usuarios_v12();
revoke all on function public.rgr_guard_usuarios_v12() from public,anon,authenticated;

create or replace function public.rgr_guard_rol_admin_v12()
returns trigger
language plpgsql security invoker set search_path = ''
as $fn$
begin
  if coalesce(auth.role(),'') <> '' or current_user <> 'postgres' then
    if (tg_op='INSERT' and new.id_rol=1) or
       (tg_op='UPDATE' and (old.id_rol=1 or new.id_rol=1)) or
       (tg_op='DELETE' and old.id_rol=1) then
      raise exception 'Rol 1 reservado al DBA' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$fn$;
drop trigger if exists rgr_guard_rol_admin_v11 on public.roles;
drop trigger if exists rgr_guard_rol_admin_v12 on public.roles;
create trigger rgr_guard_rol_admin_v12
  before insert or update or delete on public.roles
  for each row execute function public.rgr_guard_rol_admin_v12();
revoke all on function public.rgr_guard_rol_admin_v12() from public,anon,authenticated;

-- 6. ESTADOS AUXILIARES Y AUDITORIA DEL SERVICIO CRM (service_role).
-- No exponer crm_security al navegador. La Edge Function maneja OTP/password.
create schema if not exists crm_security;
revoke all on schema crm_security from public, anon, authenticated;

create table if not exists crm_security.accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0 check (failures >= 0),
  blocked_until timestamptz,
  approval_required boolean not null default false,
  approved_at timestamptz,
  idle_locked boolean not null default false,
  last_activity_at timestamptz not null default now(),
  recovery_verified_at timestamptz,
  otp_digest text,
  otp_expires_at timestamptz,
  otp_sent_at timestamptz,
  otp_failures integer not null default 0,
  updated_at timestamptz not null default now()
);
-- Limite de envios OTP: 5 solicitudes cada 60 minutos, ademas del
-- intervalo minimo de 60 segundos ya contemplado.
alter table crm_security.accounts
  add column if not exists otp_requests integer not null default 0;
alter table crm_security.accounts
  add column if not exists otp_window_started_at timestamptz;
create table if not exists crm_security.audit (
  id bigint generated always as identity primary key,
  auth_user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
revoke all on all tables in schema crm_security from anon, authenticated;
alter table crm_security.accounts enable row level security;
alter table crm_security.audit enable row level security;

-- Los RPC son de uso exclusivo de Edge Functions con service_role.
create or replace function public.crm_security_state(p_uid uuid, p_heartbeat boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype; v_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.accounts(auth_user_id) values(p_uid) on conflict do nothing;
  select * into a from crm_security.accounts where auth_user_id = p_uid for update;
  if a.approval_required then
    v_state := case
       when a.approved_at is not null and a.blocked_until <= now() and a.recovery_verified_at is not null and a.recovery_verified_at >= now() - interval '5 minutes' then 'recovery_password'
       when a.approved_at is not null and a.blocked_until <= now() then 'recovery_ready'
       else 'blocked' end;
  elsif a.idle_locked or a.last_activity_at < now() - interval '5 minutes' then
    v_state := 'idle_locked';
    update crm_security.accounts set idle_locked=true,updated_at=now() where auth_user_id=p_uid;
  else
    v_state := 'active';
    if p_heartbeat then update crm_security.accounts set last_activity_at=now(),updated_at=now() where auth_user_id=p_uid; end if;
  end if;
  return jsonb_build_object('state',v_state,'failures',a.failures,'remaining',greatest(0,3-a.failures),
    'blocked_until',a.blocked_until,'approved_at',a.approved_at);
end $$;

create or replace function public.crm_security_failure(p_uid uuid, p_context text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.accounts(auth_user_id) values(p_uid) on conflict do nothing;
  update crm_security.accounts set failures=failures+1,
    approval_required=case when failures+1 >= 3 then true else approval_required end,
    approved_at=case when failures+1 >= 3 then null else approved_at end,
    blocked_until=case when failures+1 >= 3 then now()+interval '1 hour' else blocked_until end,
    otp_digest=case when failures+1 >= 3 then null else otp_digest end,
    otp_expires_at=case when failures+1 >= 3 then null else otp_expires_at end,
    recovery_verified_at=case when failures+1 >= 3 then null else recovery_verified_at end,
    updated_at=now()
    where auth_user_id=p_uid returning * into a;
  insert into crm_security.audit(auth_user_id,event,detail) values(p_uid,'FALLO_CONTRASENA',jsonb_build_object('contexto',p_context,'intentos',a.failures));
  if a.failures >= 3 then
    insert into crm_security.audit(auth_user_id,event) values(p_uid,'BLOQUEO_1H_APROBACION_REQUERIDA');
  end if;
  return jsonb_build_object('state',case when a.approval_required then 'blocked' else 'active' end,
    'failures',a.failures,'remaining',greatest(0,3-a.failures),'blocked_until',a.blocked_until);
end $$;

create or replace function public.crm_security_password_ok(p_uid uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into a from crm_security.accounts where auth_user_id=p_uid for update;
  if not found then raise exception 'Cuenta no inicializada'; end if;
  if p_kind = 'mutation' and (a.idle_locked or a.last_activity_at < now() - interval '5 minutes') then
    raise exception 'Sesion inactiva: requiere desbloqueo';
  end if;
  if a.approval_required then
    if p_kind <> 'recovery' or a.approved_at is null or a.blocked_until > now()
       or a.recovery_verified_at is null or a.recovery_verified_at < now()-interval '5 minutes' then
       raise exception 'Recuperacion no autorizada';
    end if;
    update crm_security.accounts set failures=0,approval_required=false,approved_at=null,blocked_until=null,
      idle_locked=false,recovery_verified_at=null,otp_digest=null,otp_expires_at=null,otp_failures=0,
      last_activity_at=now(),updated_at=now() where auth_user_id=p_uid;
  else
    update crm_security.accounts set failures=0,idle_locked=false,last_activity_at=now(),updated_at=now()
    where auth_user_id=p_uid;
  end if;
  insert into crm_security.audit(auth_user_id,event) values(p_uid,case when p_kind='recovery' then 'RECUPERACION_COMPLETADA'
    when p_kind='unlock' then 'SESION_DESBLOQUEADA' else 'OPERACION_VERIFICADA' end);
end $$;

create or replace function public.crm_security_otp_start(p_uid uuid, p_digest text)
returns void language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into a from crm_security.accounts where auth_user_id=p_uid for update;
  if not found or not a.approval_required or a.approved_at is null or a.blocked_until>now() then
    raise exception 'Recuperacion no autorizada';
  end if;
  if a.otp_sent_at is not null and a.otp_sent_at>now()-interval '60 seconds' then
    raise exception 'Espera antes de pedir otro codigo';
  end if;
  if a.otp_window_started_at is not null and
     a.otp_window_started_at > now()-interval '1 hour' and a.otp_requests>=5 then
    raise exception 'Limite de codigos alcanzado. Espera para solicitar otro';
  end if;
  update crm_security.accounts set otp_digest=p_digest,otp_expires_at=now()+interval '5 minutes',
    otp_sent_at=now(),otp_failures=0,recovery_verified_at=null,updated_at=now(),
    otp_window_started_at=case when otp_window_started_at is null or
      otp_window_started_at <= now()-interval '1 hour' then now() else otp_window_started_at end,
    otp_requests=case when otp_window_started_at is null or
      otp_window_started_at <= now()-interval '1 hour' then 1 else otp_requests+1 end
    where auth_user_id=p_uid;
  insert into crm_security.audit(auth_user_id,event) values(p_uid,'OTP_SOLICITADO');
end $$;

create or replace function public.crm_security_otp_check(p_uid uuid, p_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into a from crm_security.accounts where auth_user_id=p_uid for update;
  if not found or not a.approval_required or a.approved_at is null or a.blocked_until>now()
    or a.otp_expires_at is null or a.otp_expires_at<now() or a.otp_digest is null then
    return jsonb_build_object('ok',false,'error','Codigo expirado o recuperacion no autorizada');
  end if;
  if a.otp_digest <> p_digest then
    update crm_security.accounts set otp_failures=otp_failures+1,updated_at=now() where auth_user_id=p_uid;
    if a.otp_failures+1>=3 then
      update crm_security.accounts set blocked_until=now()+interval '1 hour',approved_at=null,
        otp_digest=null,otp_expires_at=null,otp_failures=0,updated_at=now() where auth_user_id=p_uid;
      insert into crm_security.audit(auth_user_id,event) values(p_uid,'OTP_BLOQUEADO');
      return jsonb_build_object('ok',false,'state','blocked');
    end if;
    return jsonb_build_object('ok',false,'remaining',2-a.otp_failures);
  end if;
  update crm_security.accounts set recovery_verified_at=now(),otp_digest=null,otp_expires_at=null,
    otp_failures=0,updated_at=now() where auth_user_id=p_uid;
  insert into crm_security.audit(auth_user_id,event) values(p_uid,'OTP_VALIDADO');
  return jsonb_build_object('ok',true,'state','recovery_password');
end $$;

create or replace function public.crm_security_audit(p_uid uuid, p_event text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.audit(auth_user_id,event,detail) values(p_uid,p_event,p_detail);
end $$;

revoke all on function public.crm_security_state(uuid,boolean),
 public.crm_security_failure(uuid,text),public.crm_security_password_ok(uuid,text),
 public.crm_security_otp_start(uuid,text),public.crm_security_otp_check(uuid,text),
 public.crm_security_audit(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_security_state(uuid,boolean),
 public.crm_security_failure(uuid,text),public.crm_security_password_ok(uuid,text),
 public.crm_security_otp_start(uuid,text),public.crm_security_otp_check(uuid,text),
 public.crm_security_audit(uuid,text,jsonb) to service_role;

-- Reemplazar funciones con transiciones de estados v11.
create or replace function public.crm_security_state(p_uid uuid, p_heartbeat boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype; v_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.accounts(auth_user_id) values(p_uid) on conflict do nothing;
  select * into a from crm_security.accounts where auth_user_id = p_uid for update;
  -- Tras autorización del DBA y una hora cumplida, abrir solo recuperación OTP.
  if a.approval_required and a.approved_at is not null and a.blocked_until <= now() then
    update public.usuarios set estado_usuario='POR VALIDAR'
      where auth_user_id=p_uid and id_rol=1 and estado_usuario='BLOQUEADO';
  end if;
  if a.approval_required then
    v_state := case
       when a.approved_at is not null and a.blocked_until <= now() and a.recovery_verified_at is not null and a.recovery_verified_at >= now() - interval '5 minutes' then 'recovery_password'
       when a.approved_at is not null and a.blocked_until <= now() then 'recovery_ready'
       else 'blocked' end;
  elsif a.idle_locked or a.last_activity_at < now() - interval '5 minutes' then
    v_state := 'idle_locked';
    update crm_security.accounts set idle_locked=true,updated_at=now() where auth_user_id=p_uid;
  else
    v_state := 'active';
    if p_heartbeat then update crm_security.accounts set last_activity_at=now(),updated_at=now() where auth_user_id=p_uid; end if;
  end if;
  return jsonb_build_object('state',v_state,'failures',a.failures,'remaining',greatest(0,3-a.failures),
    'blocked_until',a.blocked_until,'approved_at',a.approved_at);
end $$;

create or replace function public.crm_security_failure(p_uid uuid, p_context text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.accounts(auth_user_id) values(p_uid) on conflict do nothing;
  if not exists (select 1 from public.usuarios where auth_user_id=p_uid and estado_usuario in ('ACTIVO','POR VALIDAR')) then
    raise exception 'Cuenta no habilitada para verificar credenciales' using errcode='42501';
  end if;
  if exists (select 1 from crm_security.accounts where auth_user_id=p_uid and approval_required) then
    raise exception 'Cuenta bloqueada; se requiere autorización' using errcode='42501';
  end if;
  update crm_security.accounts set failures=failures+1,
    approval_required=case when failures+1 >= 3 then true else approval_required end,
    approved_at=case when failures+1 >= 3 then null else approved_at end,
    blocked_until=case when failures+1 >= 3 then now()+interval '1 hour' else blocked_until end,
    otp_digest=case when failures+1 >= 3 then null else otp_digest end,
    otp_expires_at=case when failures+1 >= 3 then null else otp_expires_at end,
    recovery_verified_at=case when failures+1 >= 3 then null else recovery_verified_at end,
    updated_at=now()
    where auth_user_id=p_uid returning * into a;
  insert into crm_security.audit(auth_user_id,event,detail) values(p_uid,'FALLO_CONTRASENA',jsonb_build_object('contexto',p_context,'intentos',a.failures));
  if a.failures >= 3 then
    -- Bloqueo persistente, nunca inactivar ni eliminar la cuenta.
    update public.usuarios set estado_usuario='BLOQUEADO'
      where auth_user_id=p_uid and estado_usuario in ('ACTIVO','POR VALIDAR');
    insert into crm_security.audit(auth_user_id,event) values(p_uid,'BLOQUEO_1H_APROBACION_REQUERIDA');
  end if;
  return jsonb_build_object('state',case when a.approval_required then 'blocked' else 'active' end,
    'failures',a.failures,'remaining',greatest(0,3-a.failures),'blocked_until',a.blocked_until);
end $$;

create or replace function public.crm_security_password_ok(p_uid uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into a from crm_security.accounts where auth_user_id=p_uid for update;
  if not found then raise exception 'Cuenta no inicializada'; end if;
  if p_kind = 'mutation' and (a.idle_locked or a.last_activity_at < now() - interval '5 minutes') then
    raise exception 'Sesion inactiva: requiere desbloqueo';
  end if;
  if a.approval_required then
    if p_kind <> 'recovery' or a.approved_at is null or a.blocked_until > now()
       or a.recovery_verified_at is null or a.recovery_verified_at < now()-interval '5 minutes' then
       raise exception 'Recuperacion no autorizada';
    end if;
    -- Ninguna recuperación puede convertir INACTIVO en ACTIVO.
    update public.usuarios set estado_usuario='ACTIVO'
      where auth_user_id=p_uid and
        ((id_rol=1 and estado_usuario='POR VALIDAR') or
         (id_rol<>1 and estado_usuario='BLOQUEADO'));
    if not found then raise exception 'La cuenta no está en un estado de recuperación válido'; end if;
    update crm_security.accounts set failures=0,approval_required=false,approved_at=null,blocked_until=null,
      idle_locked=false,recovery_verified_at=null,otp_digest=null,otp_expires_at=null,otp_failures=0,
      last_activity_at=now(),updated_at=now() where auth_user_id=p_uid;
  else
    update crm_security.accounts set failures=0,idle_locked=false,last_activity_at=now(),updated_at=now()
    where auth_user_id=p_uid;
  end if;
  insert into crm_security.audit(auth_user_id,event) values(p_uid,case when p_kind='recovery' then 'RECUPERACION_COMPLETADA'
    when p_kind='unlock' then 'SESION_DESBLOQUEADA' else 'OPERACION_VERIFICADA' end);
end $$;

create or replace function public.crm_security_otp_check(p_uid uuid, p_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a crm_security.accounts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into a from crm_security.accounts where auth_user_id=p_uid for update;
  if not found or not a.approval_required or a.approved_at is null or a.blocked_until>now()
    or a.otp_expires_at is null or a.otp_expires_at<now() or a.otp_digest is null then
    return jsonb_build_object('ok',false,'error','Codigo expirado o recuperacion no autorizada');
  end if;
  if a.otp_digest <> p_digest then
    update crm_security.accounts set otp_failures=otp_failures+1,updated_at=now() where auth_user_id=p_uid;
    if a.otp_failures+1>=3 then
      update crm_security.accounts set blocked_until=now()+interval '1 hour',approved_at=null,
        otp_digest=null,otp_expires_at=null,otp_failures=0,updated_at=now() where auth_user_id=p_uid;
      update public.usuarios set estado_usuario='BLOQUEADO'
        where auth_user_id=p_uid and id_rol=1 and estado_usuario='POR VALIDAR';
      insert into crm_security.audit(auth_user_id,event) values(p_uid,'OTP_BLOQUEADO');
      return jsonb_build_object('ok',false,'state','blocked');
    end if;
    return jsonb_build_object('ok',false,'remaining',2-a.otp_failures);
  end if;
  update crm_security.accounts set recovery_verified_at=now(),otp_digest=null,otp_expires_at=null,
    otp_failures=0,updated_at=now() where auth_user_id=p_uid;
  insert into crm_security.audit(auth_user_id,event) values(p_uid,'OTP_VALIDADO');
  return jsonb_build_object('ok',true,'state','recovery_password');
end $$;


-- 7. OPERACION DBA: AUTORIZAR RECUPERACION, SIN DESBLOQUEAR AL USUARIO.
create or replace function crm_security.dba_autorizar_recuperacion(p_uid uuid)
returns void
language plpgsql security invoker set search_path = ''
as $fn$
begin
  if current_user <> 'postgres' or auth.role() is not null then
    raise exception 'Accion exclusiva del administrador de base de datos'
      using errcode='42501';
  end if;
  update crm_security.accounts set approved_at=pg_catalog.now(),
    recovery_verified_at=null,otp_digest=null,otp_expires_at=null,
    otp_sent_at=null,updated_at=pg_catalog.now()
  where auth_user_id=p_uid and approval_required=true and blocked_until is not null;
  if not found then
    raise exception 'Cuenta no bloqueada o registro inexistente';
  end if;
  insert into crm_security.audit(auth_user_id,event)
    values(p_uid,'RECUPERACION_AUTORIZADA_DBA');
end;
$fn$;
revoke all on function crm_security.dba_autorizar_recuperacion(uuid)
  from public,anon,authenticated,service_role;

-- Validacion estructural sin datos personales:
do $done$
begin
  if not (select relrowsecurity from pg_class
          where oid='public.usuarios'::regclass) then
    raise exception 'La tabla usuarios no tiene RLS habilitado';
  end if;
end $done$;

commit;

-- RECORDATORIO:
-- A) La reautenticacion y el OTP se verifican en la Edge Function; SQL solo
--    prepara los controles. No se habilitan solos con esta migracion.
-- B) Las politicas de otras tablas y RPC de Flutter/ERP requieren auditoria
--    para evitar escrituras directas que salten el control de password.
--    admin_asignar_rol_usuario deja de estar disponible para authenticated;
--    la pantalla Flutter de roles debe migrarse a Edge antes del despliegue.
-- C) El DBA autoriza la recuperacion ejecutando, desde SQL Editor:
--    select crm_security.dba_autorizar_recuperacion('<UUID>'::uuid);
--    La hora obligatoria y el OTP se verifican DESPUES en el servicio.
