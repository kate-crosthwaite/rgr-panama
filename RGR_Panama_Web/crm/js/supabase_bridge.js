/* Integración para el CRM web, con mismas tablas/RPC que el Flutter recibido.
 * Solo se usa la publishable key; los permisos REALES se aplican mediante RLS.
 */
(function () {
  'use strict';
  const config = window.RGR_SUPABASE_CONFIG || {};
  const TABLES = ['usuarios', 'roles', 'rutas', 'horarios', 'incidentes', 'conductores',
                  'camiones', 'provincia', 'distritos', 'corregimientos', 'coordenadas'];
  const COLUMNS = {
    usuarios: 'id_usuario,auth_user_id,nombre_usuario,apellido_usuario,fecha_inicio,fecha_fin,id_rol,id_corregimiento,correo_usuario,cedula_usuario,telefono_usuario,estado_usuario',
    roles: '*', rutas: '*', horarios: '*',
    incidentes: 'id_incidente,asunto,descripcion,id_usuario,correo_inv,corregimiento_invitado,fecha_incidente,hora_incidente,estado_incidente,id_ruta',
    conductores: '*', camiones: '*', provincia: '*', distritos: '*', corregimientos: '*', coordenadas: '*'
  };
  const PKEY = {usuarios:'id_usuario',roles:'id_rol',rutas:'id_ruta',horarios:'id_horario',
    incidentes:'id_incidente',conductores:'id_conductor',camiones:'id_camion',provincia:'id_provincia',
    distritos:'id_distrito',corregimientos:'id_corregimiento',coordenadas:'id_coordenada'};
  let client;
  function getClient(){
    if(client)return client;
    if(!config.url || !config.publishableKey)throw Error('La configuración de Supabase está incompleta.');
    if(!window.supabase || !window.supabase.createClient)throw Error('No se pudo cargar la biblioteca de Supabase. Revisa tu conexión a Internet y abre el proyecto con Live Server.');
    client=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    return client;
  }
  function raise(error){if(error)throw Error(error.message || String(error));}
  // Todo cambio remoto pasa por Edge; las credenciales nunca se guardan en localStorage.
  async function security(action, payload={}){
    const sdk=getClient();
    const {data:{session},error}=await sdk.auth.getSession();
    raise(error);
    if(!session?.access_token)throw Error('La sesión expiró. Vuelve a iniciar sesión.');
    let res;
    try{
      res=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/crm-security',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
          'apikey':config.publishableKey},
        body:JSON.stringify({action,...payload})
      });
    }catch(_){throw Error('No está disponible el servicio de seguridad de Supabase. No se permite modificar datos.');}
    let body={};try{body=await res.json();}catch(_){}
    if(!res.ok){const err=new Error(body.error||'Operación de seguridad denegada');
      err.state=body.state||null;err.remaining=body.remaining;
      err.blocked_until=body.blocked_until;
      throw err;
    }
    return body;
  }
  async function verifyAdmin(){
    const {data:{user},error}=await getClient().auth.getUser();raise(error);
    if(!user)throw Error('No hay una sesión válida.');
    const gate=await security('status');
    const profile=gate.profile;
    const status=String(profile?.estado_usuario||'').trim().toUpperCase();
    const state=String(gate.state||'');
    const validActive=status==='ACTIVO' && state==='active';
    const validRecovery=['BLOQUEADO','POR VALIDAR'].includes(status) && ['blocked','recovery_ready','recovery_password'].includes(state);
    const validIdle=status==='ACTIVO' && state==='idle_locked';
    if(!profile||profile.auth_user_id!==user.id||Number(profile.id_rol)!==1||!(validActive||validRecovery||validIdle))
      throw Error('El perfil no tiene acceso habilitado.');
    return {user,profile,id_usuario:profile.id_usuario,securityState:gate.state,
      role:'ADMINISTRADOR',name:[profile.nombre_usuario,profile.apellido_usuario].filter(Boolean).join(' ')||'Administrador',
      email:profile.correo_usuario||user.email, remaining:gate.remaining,
      blocked_until:gate.blocked_until};
  }
  async function login(email,password){
    const sdk=getClient();
    const {error}=await sdk.auth.signInWithPassword({email:String(email).trim(),password});raise(error);
    try{return await verifyAdmin();}catch(err){await sdk.auth.signOut();throw err;}
  }
  async function restore(){
    const sdk=getClient(),{data,error}=await sdk.auth.getSession();raise(error);
    if(!data.session)return null;
    try{return await verifyAdmin();}catch(err){await sdk.auth.signOut();throw err;}
  }
  async function logout(){await getClient().auth.signOut();}
  async function fetchOneTable(name){
    const sdk=getClient(),records=[];let start=0;
    while(true){
      // Supabase limita el número de filas por respuesta. La paginación evita
      // truncar catálogos y registros administrativos grandes.
      let query=sdk.from(name).select(COLUMNS[name]).range(start,start+499);
      if(name==='usuarios')query=query.neq('id_rol',1);
      const {data,error}=await query;raise(error);
      const page=Array.isArray(data)?data:[];
      records.push(...page);
      if(page.length<500)break;
      start+=500;
      if(start>=25000)throw Error(`La tabla ${name} supera el límite de 25 000 registros del CRM. Requiere paginación de servidor.`);
    }
    return records;
  }
  async function loadAll(){
    const me=await verifyAdmin();
    if(me.securityState!=='active')throw Error('La sesión está bloqueada; no se permite consultar registros.');
    const results=await Promise.allSettled(TABLES.map(t=>fetchOneTable(t)));
    const data={},issues=[];
    TABLES.forEach((name,i)=>{
      if(results[i].status==='fulfilled')data[name]=results[i].value;
      else {data[name]=[];issues.push({table:name,message:results[i].reason?.message||'Error al leer tabla'});}
    });
    data.actividad=[];
    return {data,issues};
  }
  function omitKeys(row,keys){return Object.fromEntries(Object.entries(row).filter(([k,v])=>!keys.includes(k)&&v!==undefined));}
  function byteaFromDataUrl(url){
    const body=String(url||'').split(',')[1];if(!body)return null;
    const bytes=atob(body);let hex='\\x';
    for(let i=0;i<bytes.length;i++)hex+=bytes.charCodeAt(i).toString(16).padStart(2,'0');
    return hex;
  }
  function payload(table,row){
    const clean=omitKeys(row,[PKEY[table], 'auth_user_id', '__previous']);
    if(table==='usuarios'){
      return Object.fromEntries(Object.entries(clean).filter(([k])=>
        ['nombre_usuario','apellido_usuario','cedula_usuario','telefono_usuario','id_corregimiento',
         'fecha_inicio','fecha_fin','estado_usuario','id_rol'].includes(k)));
    }
    if(table==='incidentes'){
      if(typeof clean.img==='string' && clean.img.startsWith('data:image/'))clean.img=byteaFromDataUrl(clean.img);
      else delete clean.img;
      return clean;
    }
    return clean;
  }
  async function mutation(table,operation,data,id,password){
    if(!password)throw Error('Debes confirmar tu contraseña para realizar este cambio.');
    const row=operation==='delete'?null:payload(table,data||{});
    const result=await security('mutate',{table,operation,id,data:row,password});
    return result.result;
  }
  window.RGR_REMOTE={getClient,login,restore,logout,loadAll,mutation,security,
    status:()=>security('status'),heartbeat:()=>security('heartbeat'),
    unlock:password=>security('unlock',{password}),
    otpSend:()=>security('otp_send'),otpVerify:code=>security('otp_verify',{code}),
    finishRecovery:password=>security('recovery_finish',{password})};
})();
