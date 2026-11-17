-- ACTIVACION INICIAL RGR PANAMA CRM v15
-- Solo incorpora la infraestructura del servicio crm-security.
-- No toca politicas RLS existentes, no revoca RPC de Flutter y no cambia
-- datos de los usuarios actuales.
-- Esta fase habilita el login y la verificacion de cambios DESDE EL CRM,
-- pero NO completa la proteccion global contra escrituras directas.
BEGIN;

DO $comprobar$
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'No existe public.usuarios';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='usuarios'
      AND column_name='auth_user_id'
  ) THEN
    RAISE EXCEPTION 'Falta public.usuarios.auth_user_id';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.usuarios'::regclass
      AND conname='usuarios_estado_usuario_check'
      AND pg_get_constraintdef(oid) ILIKE '%BLOQUEADO%'
      AND pg_get_constraintdef(oid) ILIKE '%POR VALIDAR%'
  ) THEN
    RAISE EXCEPTION 'No esta instalado el CHECK de cuatro estados en usuarios';
  END IF;
END
$comprobar$;

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


create or replace function public.crm_security_audit(p_uid uuid, p_event text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  insert into crm_security.audit(auth_user_id,event,detail) values(p_uid,p_event,p_detail);
end $$;

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

revoke all on function public.crm_security_state(uuid,boolean),
 public.crm_security_failure(uuid,text),public.crm_security_password_ok(uuid,text),
 public.crm_security_otp_start(uuid,text),public.crm_security_otp_check(uuid,text),
 public.crm_security_audit(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_security_state(uuid,boolean),
 public.crm_security_failure(uuid,text),public.crm_security_password_ok(uuid,text),
 public.crm_security_otp_start(uuid,text),public.crm_security_otp_check(uuid,text),
 public.crm_security_audit(uuid,text,jsonb) to service_role;

COMMIT;

-- IMPORTANTE
-- Esta fase no cambia RLS ni revoca admin_asignar_rol_usuario.
-- La migracion restrictiva v13 COMPLETA no debe ejecutarse a la vez
-- porque puede romper la administracion de roles de Flutter.
-- La seguridad global requiere luego adaptar Flutter/ERP y cerrar
-- escritura directa en las tablas que operan desde el CRM.
