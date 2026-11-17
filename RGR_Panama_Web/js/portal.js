/* Acceso único RGR Panamá. La autorización final de cada panel se comprueba también dentro de CRM/ERP. */
(()=>{
  'use strict';
  const cfg=window.RGR_PORTAL_CONFIG||{};
  const $=(s)=>document.querySelector(s);
  const form=$('#loginForm'),submit=$('#submitBtn'),msg=$('#message');
  let sdk=null,working=false;
  const getClient=()=>{
    if(sdk)return sdk;
    if(!window.supabase?.createClient)throw Error('No fue posible cargar Supabase. Comprueba tu conexión a Internet.');
    if(!cfg.url||!cfg.publishableKey)throw Error('Falta la configuración de Supabase.');
    sdk=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return sdk;
  };
  const error=text=>{msg.textContent=text;msg.hidden=false;};
  const clearError=()=>{msg.hidden=true;msg.textContent='';};
  const setBusy=(value,message='Iniciar sesión')=>{working=value;submit.disabled=value;submit.querySelector('span').textContent=message;};
  const go=(area)=>window.location.replace(new URL(area+'/index.html',window.location.href).href);
  async function securityStatus(client){
    const {data:{session},error:e}=await client.auth.getSession();
    if(e)throw e;
    if(!session?.access_token)throw Error('Tu sesión ha expirado.');
    const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/crm-security',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','apikey':cfg.publishableKey,'Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({action:'status'})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||'No fue posible comprobar la seguridad administrativa.');
    return body;
  }
  async function destination(client){
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user)throw Error('Tu sesión de Supabase ha expirado.');
    const {data:role,error:roleErr}=await client.rpc('mi_rol');
    if(roleErr)throw Error('No fue posible comprobar tu rol: '+roleErr.message);
    const roleName=String(role??'').trim().toUpperCase();
    if(roleName==='OPERADOR')return 'erp';
    if(roleName==='ADMINISTRADOR')return 'crm';
    // Para administradores BLOQUEADOS/POR VALIDAR, mi_rol() puede devolver NULL.
    // CRM mantiene el flujo seguro de recuperación mediante OTP/contraseña.
    if(!roleName){
      try{
        const gate=await securityStatus(client),profile=gate.profile;
        const state=String(gate.state||'');
        const status=String(profile?.estado_usuario||'').toUpperCase();
        if(profile?.auth_user_id===user.id && Number(profile.id_rol)===1 &&
           (status==='BLOQUEADO'||status==='POR VALIDAR') &&
           ['blocked','recovery_ready','recovery_password'].includes(state))return 'crm';
      }catch(_){ /* A session without an active role does not gain access. */ }
    }
    throw Error('Tu cuenta no tiene acceso autorizado al CRM ni al ERP.');
  }
  async function chooseDestination(client){const area=await destination(client);go(area);}
  form.addEventListener('submit',async(e)=>{
    e.preventDefault();if(working)return;clearError();setBusy(true,'Verificando acceso…');
    try{
      const client=getClient();
      const {error:authError}=await client.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
      if(authError)throw authError;
      await chooseDestination(client);
    }catch(err){error(err?.message||'No fue posible iniciar sesión.');setBusy(false)}
  });
  $('#togglePass').addEventListener('click',()=>{const field=$('#password');field.type=field.type==='password'?'text':'password';const show=field.type==='text';$('#togglePass').setAttribute('aria-pressed',String(show));$('#togglePass').setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña')});
  $('#changeAccountButton').addEventListener('click',async()=>{try{await getClient().auth.signOut({scope:'local'});}catch(_){}$('#changeAccount').hidden=true;clearError();$('#password').value='';$('#email').focus();});
  async function restore(){setBusy(true,'Comprobando sesión…');try{
    const client=getClient();const {data,error:sessionError}=await client.auth.getSession();
    if(sessionError)throw sessionError;
    if(data.session){try{await chooseDestination(client);}catch(err){error(err.message);$('#changeAccount').hidden=false;}}
  }catch(err){error(err.message);}finally{setBusy(false)}}
  restore();
})();
