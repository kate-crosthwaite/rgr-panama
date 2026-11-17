/* Portal único de RGR Panamá. Solo se presenta el módulo que autorizó Supabase. */
(()=>{
  'use strict';
  const cfg=window.RGR_PORTAL_CONFIG||{};
  const $=s=>document.querySelector(s);
  const form=$('#loginForm'),submit=$('#submitBtn'),message=$('#message');
  const loader=$('#portalLoader'),loginPanel=$('#portalLogin'),workspace=$('#rgrWorkspace');
  let sdk=null,working=false,expectedArea=null,launchCounter=0;
  const getClient=()=>{
    if(sdk)return sdk;
    if(!window.supabase?.createClient)throw Error('No se pudo cargar Supabase. Comprueba la conexión a Internet.');
    if(!cfg.url||!cfg.publishableKey)throw Error('Falta la configuración pública de Supabase.');
    sdk=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return sdk;
  };
  const setMessage=text=>{message.textContent=text;message.hidden=false};
  const clearMessage=()=>{message.textContent='';message.hidden=true};
  const setBusy=(flag,label='Iniciar sesión')=>{working=flag;submit.disabled=flag;submit.querySelector('span').textContent=label};
  function showLogin(errorText=''){
    launchCounter++;expectedArea=null;workspace.hidden=true;workspace.removeAttribute('src');
    loader.hidden=true;loginPanel.hidden=false;setBusy(false);
    window.location.hash='#/login';
    if(errorText)setMessage(errorText);else clearMessage();
  }
  function showLoader(title='Abriendo tu panel…',detail='Verificando permisos y cargando datos'){
    loginPanel.hidden=true;workspace.hidden=true;loader.hidden=false;
    $('#loaderTitle').textContent=title;$('#loaderText').textContent=detail;
  }
  async function securityStatus(client){
    const {data:{session},error}=await client.auth.getSession();
    if(error)throw error;
    if(!session?.access_token)throw Error('Tu sesión ha expirado.');
    const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/crm-security',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','apikey':cfg.publishableKey,'Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({action:'status'})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'No se pudo comprobar el estado administrativo.');
    return data;
  }
  async function destination(client){
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user)throw Error('Tu sesión ha expirado.');
    const {data:role,error:roleErr}=await client.rpc('mi_rol');
    if(roleErr)throw Error('No se pudo comprobar tu rol: '+roleErr.message);
    const roleName=String(role||'').trim().toUpperCase();
    if(roleName==='OPERADOR')return 'erp';
    if(roleName==='ADMINISTRADOR')return 'crm';
    // Mantener únicamente el proceso de recuperación para administradores bloqueados.
    if(!roleName){
      const gate=await securityStatus(client);
      const profile=gate.profile||{};
      const status=String(profile.estado_usuario||'').toUpperCase();
      if(profile.auth_user_id===user.id&&Number(profile.id_rol)===1&&
         ['BLOQUEADO','POR VALIDAR'].includes(status)&&
         ['blocked','recovery_ready','recovery_password'].includes(String(gate.state||'')))return 'crm';
    }
    throw Error('Tu cuenta no tiene acceso autorizado.');
  }
  function launch(area){
    expectedArea=area;const generation=++launchCounter;
    showLoader('Abriendo '+(area==='crm'?'el CRM':'el ERP')+'…','Preparando tu espacio de trabajo');
    // Iframe de mismo origen, invisible hasta recibir confirmación del propio módulo.
    workspace.src=new URL(area+'/index.html?integrated=1',window.location.href).href;
    setTimeout(()=>{
      if(generation===launchCounter&&expectedArea===area&&workspace.hidden){
        showLogin('No se pudo completar la carga del panel. Comprueba la conexión e intenta nuevamente.');
      }
    },30000);
  }
  async function chooseDestination(client){launch(await destination(client));}
  window.addEventListener('message',async(event)=>{
    if(event.origin!==window.location.origin||event.source!==workspace.contentWindow)return;
    const data=event.data;
    if(data?.app!=='rgr-suite'||data.area!==expectedArea)return;
    if(data.type==='ready'){
      const area=expectedArea;
      workspace.hidden=false;loader.hidden=true;loginPanel.hidden=true;
      window.location.hash='#/'+area;
      requestAnimationFrame(()=>workspace.contentWindow?.dispatchEvent(new Event('resize')));
    }else if(data.type==='failed'||data.type==='session-lost'){
      showLogin(data.type==='failed'?(data.message||'No se pudo abrir el panel.'):'Tu sesión ha expirado. Inicia sesión nuevamente.');
    }else if(data.type==='logout'){
      try{await getClient().auth.signOut({scope:'local'});}catch(_){}
      $('#password').value='';showLogin();
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(working)return;
    clearMessage();setBusy(true,'Validando acceso…');showLoader('Verificando acceso…','Consultando tu rol en Supabase');
    try{
      const client=getClient();
      const {error}=await client.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
      if(error)throw error;
      await chooseDestination(client);
      $('#password').value='';
    }catch(error){showLogin(error?.message||'No fue posible iniciar sesión.');}
  });
  $('#togglePass').addEventListener('click',()=>{
    const field=$('#password');field.type=field.type==='password'?'text':'password';
    const showing=field.type==='text';$('#togglePass').setAttribute('aria-pressed',String(showing));
    $('#togglePass').setAttribute('aria-label',showing?'Ocultar contraseña':'Mostrar contraseña');
  });
  $('#changeAccountButton').addEventListener('click',async()=>{
    try{await getClient().auth.signOut({scope:'local'});}catch(_){}
    $('#password').value='';showLogin();$('#email').focus();
  });
  async function restore(){
    showLoader('Cargando RGR Panamá','Comprobando tu sesión');
    try{
      const client=getClient();
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      if(!data.session){showLogin();return;}
      await chooseDestination(client);
    }catch(error){showLogin(error.message||'No fue posible recuperar la sesión.');}
  }
  restore();
})();
