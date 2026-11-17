// Edge Function de RGR Panamá. No incluir claves privadas en la web.
// Despliegue requiere validacion previa de reglas RLS/RPC del Flutter.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOWED_ORIGIN = Deno.env.get('RGR_ALLOWED_ORIGIN') || '';
const admin = createClient(SUPABASE_URL, SERVICE, {auth:{persistSession:false,autoRefreshToken:false}});
const TABLE_KEYS: Record<string,string> = {usuarios:'id_usuario',roles:'id_rol',rutas:'id_ruta',horarios:'id_horario',
  incidentes:'id_incidente',conductores:'id_conductor',camiones:'id_camion',provincia:'id_provincia',
  distritos:'id_distrito',corregimientos:'id_corregimiento',coordenadas:'id_coordenada'};
const WRITABLE: Record<string,string[]> = {
  usuarios:['nombre_usuario','apellido_usuario','cedula_usuario','telefono_usuario','id_corregimiento','fecha_inicio','fecha_fin','estado_usuario','id_rol'],
  roles:['nombre_rol','estado_rol'],rutas:['id_corregimiento','barrio','calle','id_horario','id_conductor','id_camion','estado_ruta'],
  horarios:['dia','mes','anio','hora','minutos','hora_fin','minutos_fin'],
  incidentes:['asunto','descripcion','id_usuario','correo_inv','corregimiento_invitado','id_ruta','fecha_incidente','hora_incidente','estado_incidente','img'],
  conductores:['nombre_conductor','apellido_conductor','cedula_conductor','telefono_conductor','sexo_conductor','id_corregimiento','fecha_nac','fecha_inicio','fecha_fin','estado_conductor'],
  camiones:['modelo','matricula','anio','estado_camion'],
  provincia:['nombre_provincia','estado_provincia'],distritos:['nombre_distrito','id_provincia','estado_distrito'],
  corregimientos:['nombre_corregimiento','id_distrito','estado_corregimiento'],
  coordenadas:['id_ruta','secuencia','latitud','longitud','barrio','calle']
};
function headers(origin: string){return {'Access-Control-Allow-Origin': ALLOWED_ORIGIN&&origin===ALLOWED_ORIGIN?origin:'null',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};}
function response(origin:string, status:number, value:unknown){return new Response(JSON.stringify(value),{status,headers:headers(origin)});}
function assertRpc(data:{error?:{message?:string}}){if(data.error)throw Error(data.error.message||'Error en control de seguridad');return data;}
async function rpc(name:string,args:Record<string,unknown>){const res=await admin.rpc(name,args);assertRpc(res);return res.data;}
// La validación del OTP ocurre exclusivamente contra Supabase Auth.
// Estos marcadores solo señalan a SQL el resultado de la verificación hecha en el servidor.
// Las RPC crm_security_* están revocadas para anon y authenticated.
const AUTH_OTP_CONFIRMED = 'SUPABASE_AUTH_OTP_CONFIRMED_SERVER';
const AUTH_OTP_FAILED = 'SUPABASE_AUTH_OTP_FAILED_SERVER';
async function identify(req:Request){
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)throw Error('Sesión no válida');
  const authClient=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await authClient.auth.getUser(token);
  if(error||!user)throw Error('Tu sesión expiró. Inicia sesión de nuevo.');
  const {data:profile,error:profileError}=await admin.from('usuarios')
    .select('id_usuario,auth_user_id,id_rol,estado_usuario,nombre_usuario,apellido_usuario,correo_usuario')
    .eq('auth_user_id',user.id).maybeSingle();
  // No registrar ni devolver correos, UUID completos, claves o tokens.
  if(profileError){
    console.error('crm-security: profile_query_error',{
      code: profileError.code || 'unknown',
      hint: profileError.hint ? 'database_hint_available' : 'none'
    });
    throw Error('No fue posible consultar el perfil [PERFIL_CONSULTA]');
  }
  if(!profile){
    console.error('crm-security: profile_not_found');
    throw Error('No se encontró el perfil vinculado [PERFIL_NO_ENCONTRADO]');
  }
  if(String(profile.auth_user_id)!==String(user.id)){
    console.error('crm-security: profile_id_mismatch');
    throw Error('Identificador de perfil diferente [PERFIL_ID]');
  }
  const userState=String(profile.estado_usuario||'').trim().toUpperCase();
  if(Number(profile.id_rol)!==1||!['ACTIVO','BLOQUEADO','POR VALIDAR'].includes(userState))
    throw Error('Acceso denegado: rol o estado del usuario no autorizado');
  return {user,profile};
}
async function verifyPassword(userId:string,email:string,password:string){
  if(typeof password!=='string'||password.length<1||password.length>1024)return false;
  const authClient=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await authClient.auth.signInWithPassword({email,password});
  const valid=!error && data?.user?.id===userId;
  // La sesión temporal no se comparte con el navegador ni sustituye su token.
  if(data?.session)await authClient.auth.signOut({scope:'local'}).catch(()=>{});
  return valid;
}
function cleanPayload(table:string,row:unknown){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Registro inválido');
  const supplied=row as Record<string,unknown>, result:Record<string,unknown>={};
  for(const key of WRITABLE[table])if(Object.prototype.hasOwnProperty.call(supplied,key))result[key]=supplied[key];
  if(Object.keys(result).length===0)throw Error('No hay datos para guardar');
  if(table==='incidentes'&&typeof result.img==='string'&&result.img.startsWith('data:image/')){
    const url=result.img as string;if(url.length>1_200_000)throw Error('La imagen excede el tamaño permitido');
    const encoded=url.split(',')[1]||'';const bytes=atob(encoded);
    result.img='\\x'+Array.from(bytes).map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  }
  return result;
}
async function validateRoute(row:Record<string,unknown>, editingId:number|null){
  const {data:routes,error}=await admin.from('rutas').select('id_ruta,id_conductor,id_camion,id_horario,estado_ruta');
  if(error)throw Error(error.message);
  const previous=editingId===null?null:routes?.find(r=>r.id_ruta===editingId);
  const value=(key:string)=>row[key]===undefined?previous?.[key]:row[key];
  if(String(value('estado_ruta'))!=='ACTIVA')return;
  const others=(routes||[]).filter(r=>r.id_ruta!==editingId&&r.estado_ruta==='ACTIVA');
  for(const key of ['id_conductor','id_camion','id_horario']){
    if(!value(key))throw Error('Una ruta activa requiere conductor, camión y horario');
    if(others.some(r=>Number(r[key])===Number(value(key))))throw Error(`El ${key} ya se encuentra asignado a otra ruta activa`);
  }
  for(const [table,key,stat] of [['conductores','id_conductor','estado_conductor'],['camiones','id_camion','estado_camion']]){
    const {data:resource,error:e}=await admin.from(table).select(stat).eq(table==='camiones'?'id_camion':'id_conductor',value(key)).single();
    if(e||String(resource?.[stat])!=='ACTIVO')throw Error(`El recurso ${table} debe estar activo`);
  }
}
async function mutate(body:Record<string,unknown>, uid:string){
  const table=String(body.table||''), operation=String(body.operation||''), key=TABLE_KEYS[table];
  if(!key||!['insert','update','delete'].includes(operation))throw Error('Operación no permitida');
  const id=Number(body.id);
  if(operation!=='insert'&&(!Number.isSafeInteger(id)||id<1))throw Error('Identificador inválido');
  if(table==='usuarios'&&operation!=='update')throw Error('La creación/eliminación de cuentas necesita gestión separada de Auth');
  // Ni un administrador ni otro usuario pueden modificar cuentas administrativas.
  // En esta API solo el DBA puede administrar id_rol=1, fuera del CRM.
  if(table==='usuarios'&&operation==='update'){
    const {data:target,error:targetError}=await admin.from('usuarios')
      .select('id_usuario,id_rol,estado_usuario').eq(key,id).single();
    if(targetError||!target)throw Error('Usuario no encontrado');
    if(Number(target.id_rol)===1)throw Error('Las cuentas administrativas solo pueden ser gestionadas por el DBA');
    if(['BLOQUEADO','POR VALIDAR'].includes(String(target.estado_usuario).toUpperCase()))
      throw Error('La cuenta está pendiente de recuperación por seguridad');
    const proposed=body.data as Record<string,unknown>||{};
    if('id_rol' in proposed&&Number(proposed.id_rol)===1)
      throw Error('No está permitido asignar el rol de administrador desde el CRM');
    if('estado_usuario' in proposed&&!['ACTIVO','INACTIVO'].includes(String(proposed.estado_usuario)))
      throw Error('Solo el sistema de seguridad puede cambiar a estados de bloqueo o recuperación');
  }
  if(table==='roles' && operation!=='insert' && id===1)
    throw Error('El rol ADMINISTRADOR está protegido y no puede modificarse desde el CRM');
  if(operation==='delete'){
    const {data,error}=await admin.from(table).delete().eq(key,id).select(key);
    if(error)throw Error(error.message);
    if(!data?.length)throw Error('No se pudo eliminar el registro');
    await rpc('crm_security_audit',{p_uid:uid,p_event:'ELIMINAR',p_detail:{tabla:table,id}});
    return data[0];
  }
  const data=cleanPayload(table,body.data);
  if(table==='rutas')await validateRoute(data,operation==='insert'?null:id);
  let result;
  if(operation==='insert')result=await admin.from(table).insert(data).select(key).single();
  else result=await admin.from(table).update(data).eq(key,id).select(key).single();
  if(result.error)throw Error(result.error.message);
  await rpc('crm_security_audit',{p_uid:uid,p_event:operation==='insert'?'CREAR':'MODIFICAR',p_detail:{tabla:table,id:id||result.data?.[key]}});
  return result.data;
}
Deno.serve(async(req)=>{
  const origin=req.headers.get('Origin')||'';
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=='POST')return response(origin,405,{error:'Método no permitido'});
  if(!ALLOWED_ORIGIN||origin!==ALLOWED_ORIGIN)return response(origin,403,{error:'Origen no autorizado'});
  if(!SERVICE||!ANON||!SUPABASE_URL)return response(origin,503,{error:'El servidor de seguridad no está configurado'});
  try{
    const declaredLength=Number(req.headers.get('content-length')||0);
    if(declaredLength>1_600_000)return response(origin,413,{error:'Solicitud demasiado grande'});
    const raw=await req.text();
    if(raw.length>1_600_000)return response(origin,413,{error:'Solicitud demasiado grande'});
    const body=JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body))return response(origin,400,{error:'Solicitud inválida'});
    const {user,profile}=await identify(req),uid=user.id;
    const action=String(body.action||'');
    const state=await rpc('crm_security_state',{p_uid:uid,p_heartbeat:action==='heartbeat'});
    const effectiveState=String(profile.estado_usuario||'').toUpperCase();
    // Nunca permitir entrar si public.usuarios impide el acceso.
    if(effectiveState!=='ACTIVO' && state.state==='active')return response(origin,403,{error:'Cuenta pendiente de recuperación',state:'blocked'});
    if(effectiveState==='ACTIVO' && ['recovery_ready','recovery_password'].includes(String(state.state)))
      return response(origin,403,{error:'Estados de seguridad inconsistentes; consulta al DBA',state:'blocked'});
    if(action==='status'||action==='heartbeat')return response(origin,200,{...state,profile:{id_usuario:profile.id_usuario,
      auth_user_id:uid,id_rol:1,estado_usuario:profile.estado_usuario,nombre_usuario:profile.nombre_usuario,
      apellido_usuario:profile.apellido_usuario,correo_usuario:profile.correo_usuario||user.email}});
    const current=String(state.state||'');
    if(action==='otp_send'){
      if(!['BLOQUEADO','POR VALIDAR'].includes(effectiveState))throw Error('La cuenta no requiere recuperación');
      if(!user.email_confirmed_at || !user.email)throw Error('El correo de la cuenta debe estar verificado');
      if(!['recovery_ready','recovery_password'].includes(current))throw Error('Recuperación no autorizada por el DBA o tiempo de bloqueo pendiente');
      // Se cuentan los envíos en SQL antes de solicitar el correo para cerrar
      // carreras de peticiones simultáneas. Auth gestiona el OTP y lo envía
      // mediante el SMTP ya configurado en Authentication de Supabase.
      await rpc('crm_security_otp_start',{p_uid:uid,p_digest:AUTH_OTP_CONFIRMED});
      const authClient=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error:mailError}=await authClient.auth.signInWithOtp({
        email:user.email,
        options:{shouldCreateUser:false}
      });
      if(mailError){
        // No se devuelven datos internos del SMTP al navegador.
        throw Error('No se pudo enviar el código desde Supabase Auth. Comprueba la plantilla OTP y el correo configurado.');
      }
      return response(origin,200,{message:'Se envió un código al correo verificado'});
    }
    if(action==='otp_verify'){
      if(!['BLOQUEADO','POR VALIDAR'].includes(effectiveState))throw Error('La cuenta no requiere recuperación');
      if(!['recovery_ready','recovery_password'].includes(current))throw Error('Recuperación no habilitada');
      const code=String(body.code||'');
      if(!/^\d{6}$/.test(code))throw Error('Introduce un código de seis dígitos');
      if(!user.email)throw Error('La cuenta no tiene correo para recuperar el acceso');
      // Se utiliza un cliente de Auth aislado. No se altera la sesión de
      // navegador y jamás se acepta un token OTP sin validarlo en Supabase Auth.
      const otpClient=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:otpData,error:otpError}=await otpClient.auth.verifyOtp({
        email:user.email,token:code,type:'email'
      });
      const valid=!otpError && otpData?.user?.id===uid && Boolean(otpData?.session);
      if(otpData?.session)await otpClient.auth.signOut({scope:'local'}).catch(()=>{});
      // Únicamente esta Edge Function (service_role) puede llamar a estas RPC.
      // Una verificación fallida también consume intentos, con límite de tres.
      const result=await rpc('crm_security_otp_check',{
        p_uid:uid,p_digest:valid?AUTH_OTP_CONFIRMED:AUTH_OTP_FAILED
      });
      return response(origin,result.ok?200:403,result);
    }
    if(action==='unlock'||action==='recovery_finish'||action==='mutate'){
      if(action==='unlock'&&current!=='idle_locked')throw Error('No hay una sesión pendiente de desbloqueo');
      if(action==='recovery_finish'&&current!=='recovery_password')throw Error('Completa primero la verificación OTP');
      if(action==='mutate'&&(current!=='active'||effectiveState!=='ACTIVO'))throw Error('Sesión bloqueada: vuelve a identificarte');
      if(action==='unlock'&&effectiveState!=='ACTIVO')throw Error('La cuenta requiere recuperación administrativa');
      if(action==='recovery_finish'&&effectiveState!=='POR VALIDAR')throw Error('El DBA aún no habilitó la recuperación');
      const password=String(body.password||'');const valid=await verifyPassword(uid,user.email||profile.correo_usuario,password);
      if(!valid){const failed=await rpc('crm_security_failure',{p_uid:uid,p_context:action});
        return response(origin,401,{error:'Contraseña incorrecta',...failed});}
      await rpc('crm_security_password_ok',{p_uid:uid,p_kind:action==='recovery_finish'?'recovery':action==='unlock'?'unlock':'mutation'});
      if(action==='mutate'){
        // Segunda validacion justo antes del cambio. Evita continuar si
        // la cuenta fue bloqueada entre la contraseña y la escritura.
        const refreshed=await rpc('crm_security_state',{p_uid:uid,p_heartbeat:false});
        const {data:freshProfile,error:freshError}=await admin.from('usuarios')
          .select('id_rol,estado_usuario').eq('auth_user_id',uid).single();
        if(freshError||Number(freshProfile?.id_rol)!==1||freshProfile?.estado_usuario!=='ACTIVO'||refreshed.state!=='active')
          throw Error('La cuenta no tiene autorización vigente para modificar registros');
        const result=await mutate(body,uid);
        return response(origin,200,{ok:true,result});
      }
      return response(origin,200,{ok:true,state:'active'});
    }
    return response(origin,400,{error:'Acción no reconocida'});
  }catch(err){
    const message=err instanceof Error?err.message:'No fue posible verificar la solicitud';
    // No devolver credenciales, detalles internos ni trazas de pila.
    return response(origin,403,{error:message});
  }
});
