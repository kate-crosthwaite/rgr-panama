/* RGR Panamá | CRM completo: Supabase Auth/RLS + CRUD remoto y demo local aislada. */
(() => {
  'use strict';
  const KEY = 'rgr_crm_frontend_v2';
  const SESSION_KEY = 'rgr_crm_frontend_session';
  const REMOTE = window.RGR_REMOTE;
  const integrated = window.parent!==window;
  const notifyPortal=(type,message='')=>{
    if(integrated)window.parent.postMessage({app:'rgr-suite',area:'crm',type,message},window.location.origin);
  };
  const DEMO_LOGIN = {email:'demo@rgr.local', name:'Administrador de prueba', role:'Demostración'};
  const seed = window.RGR_SEED;
  const pk = {usuarios:'id_usuario',roles:'id_rol',rutas:'id_ruta',horarios:'id_horario',incidentes:'id_incidente',conductores:'id_conductor',camiones:'id_camion',provincia:'id_provincia',distritos:'id_distrito',corregimientos:'id_corregimiento',coordenadas:'id_coordenada'};
  const names = {usuarios:'Usuarios',roles:'Roles',rutas:'Rutas',mapa:'Mapa de recorridos',horarios:'Horarios',incidentes:'Incidencias',conductores:'Conductores',camiones:'Camiones',provincia:'Provincias',distritos:'Distritos',corregimientos:'Corregimientos',coordenadas:'Puntos de recorrido'};
  const statusField = {usuarios:'estado_usuario',roles:'estado_rol',rutas:'estado_ruta',incidentes:'estado_incidente',conductores:'estado_conductor',camiones:'estado_camion',provincia:'estado_provincia',distritos:'estado_distrito',corregimientos:'estado_corregimiento'};
  const statuses = {usuarios:['ACTIVO','INACTIVO','BLOQUEADO','POR VALIDAR'],roles:['ACTIVO','INACTIVO'],rutas:['ACTIVA','PAUSADA','INACTIVA'],incidentes:['POR RESOLVER','EN PROCESO','RESUELTO','CANCELADO'],conductores:['ACTIVO','AUSENTE','INACTIVO'],camiones:['ACTIVO','MANTENIMIENTO','INACTIVO'],provincia:['ACTIVO','INACTIVO'],distritos:['ACTIVO','INACTIVO'],corregimientos:['ACTIVO','INACTIVO']};
  const pageLabels = {resumen:'Dashboard',rutas:'Rutas',horarios:'Horarios',incidencias:'Incidencias',coordenadas:'Puntos de recorrido',usuarios:'Usuarios',operadores:'Operadores',roles:'Roles y permisos',conductores:'Conductores',camiones:'Flota de camiones',ubicaciones:'Ubicaciones',reportes:'Reportes',perfil:'Perfil y datos'};
  const pageEntity = {rutas:'rutas',horarios:'horarios',incidencias:'incidentes',coordenadas:'coordenadas',usuarios:'usuarios',operadores:'usuarios',roles:'roles',conductores:'conductores',camiones:'camiones'};
  const $ = sel => document.querySelector(sel);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => escapeHtml(value || '—');
  const clone = data => JSON.parse(JSON.stringify(data));
  const validDB = obj => obj && typeof obj === 'object' && Object.keys(pk).every(k=>Array.isArray(obj[k]));
  let db;
  try { const stored=JSON.parse(localStorage.getItem(KEY)); db=validDB(stored)?stored:clone(seed); }catch(_){ db=clone(seed); }
  let page = 'resumen', geoTab = 'provincia', filters = {}, searching = '', modalContext = null, currentSession = null;
  let currentMode = null, loadIssues = [], busy = false, authRevision = 0;
  let selectedMapRoute = null;
  const INACTIVITY_MS=5*60*1000, DEMO_PASSWORD='DemoRGR2026!', DEMO_SECURITY_KEY='rgr_crm_v10_demo_security';
  let lastActivity=Date.now(), lastHeartbeat=0, securityState=null, waitingForPassword=false, otpSent=false;
  let unlockTransitionTimer=null;
  function cancelUnlockTransition(){
    if(unlockTransitionTimer!==null){clearTimeout(unlockTransitionTimer);unlockTransitionTimer=null;}
  }
  const isLive = () => currentMode==='live';
  const rows = entity => db[entity] || [];
  const record = (entity,id) => rows(entity).find(r=>Number(r[pk[entity]])===Number(id));
  const pad = n => String(n).padStart(2,'0');
  const today = () => new Date().toLocaleDateString('en-CA');
  const dateFrom = h => h ? `${h.anio}-${pad(h.mes)}-${pad(h.dia)}` : '';
  const startTime = h => h ? `${pad(h.hora)}:${pad(h.minutos)}` : '';
  const endTime = h => h ? `${pad(h.hora_fin)}:${pad(h.minutos_fin)}` : '';
  const friendlyDate = str => {if(!str)return '—';const [y,m,d]=String(str).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:str;};
  const roleName = id => record('roles',id)?.nombre_rol || 'Sin rol';
  const districtName = id => record('distritos',id)?.nombre_distrito || 'Sin distrito';
  const provinceName = id => record('provincia',id)?.nombre_provincia || 'Sin provincia';
  const locationName = id => record('corregimientos',id)?.nombre_corregimiento || 'Sin corregimiento';
  const driverName = id => {const r=record('conductores',id);return r?`${r.nombre_conductor} ${r.apellido_conductor}`:'Sin conductor';};
  const userName = id => {const r=record('usuarios',id);return r?`${r.nombre_usuario} ${r.apellido_usuario}`:'Invitado';};
  const truckName = id => {const r=record('camiones',id);return r?`${r.matricula} · ${r.modelo}`:'Sin camión';};
  const routeName = id => {const r=record('rutas',id);return r?`Ruta #${r.id_ruta} · ${r.barrio||locationName(r.id_corregimiento)}`:'Sin ruta';};
  const scheduleName = id => {const h=record('horarios',id);return h?`${friendlyDate(dateFrom(h))} · ${startTime(h)}–${endTime(h)}`:'Sin horario';};
  const isOperator = u => /operativ|operador/i.test(roleName(u.id_rol));
  const isAdminAccount = u => Number(u?.id_rol)===1;
  const manageableUser = u => u && !isAdminAccount(u) && !['BLOQUEADO','POR VALIDAR'].includes(String(u.estado_usuario||'').toUpperCase());
  const restrictedRecord = (entity,r) => (entity==='usuarios' && isAdminAccount(r)) || (entity==='roles' && Number(r?.id_rol)===1);
  const ensureManageable = (entity,r) => { if(restrictedRecord(entity,r)){toast('Las cuentas administrativas solo pueden ser gestionadas por el DBA.','bad');return false;}if(entity==='usuarios'&&!manageableUser(r)){toast('La cuenta está bloqueada o pendiente de validación; consulta al DBA.','bad');return false;}return true; };
  const active = (r, entity) => !statusField[entity] || ['ACTIVO','ACTIVA'].includes(r[statusField[entity]]);
  const alphabetical = (a,b) => String(a).localeCompare(String(b),'es',{sensitivity:'base'});
  const label = (entity,r) => {
    if(!r)return '—';
    switch(entity){
      case 'usuarios':return `${r.nombre_usuario} ${r.apellido_usuario}`;
      case 'roles':return r.nombre_rol;
      case 'rutas':return `Ruta #${r.id_ruta} · ${r.barrio||locationName(r.id_corregimiento)}`;
      case 'horarios':return `Horario #${r.id_horario} · ${friendlyDate(dateFrom(r))}`;
      case 'incidentes':return r.asunto;
      case 'conductores':return `${r.nombre_conductor} ${r.apellido_conductor}`;
      case 'camiones':return `${r.matricula} · ${r.modelo}`;
      case 'provincia':return r.nombre_provincia;
      case 'distritos':return r.nombre_distrito;
      case 'corregimientos':return r.nombre_corregimiento;
      case 'coordenadas':return `Punto ${r.secuencia} · ${routeName(r.id_ruta)}`;
    }
    return '';
  };
  function save(){if(isLive())return true;try{localStorage.setItem(KEY,JSON.stringify(db));return true;}catch(err){toast('El navegador no pudo guardar: almacenamiento lleno o bloqueado.','bad');return false;}}
  function avatarLetters(name='Administrador'){return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AD';}
  // No confiamos en sesiones de demostración almacenadas de versiones anteriores.
  sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(SESSION_KEY);
  function clearSession(){cancelUnlockTransition();currentSession=null;currentMode=null;securityState=null;}
  function updateProfileUI(){
    const session=currentSession||{name:'Administrador',role:'RGR Panamá'};
    $('#profileAvatar').textContent=avatarLetters(session.name);
    $('#profileName').textContent=session.name||'Administrador';
    $('#profileRole').textContent=session.role||'RGR Panamá';
    const badge=$('#connectionBadge');
    badge.hidden=isLive();
    if(!isLive())badge.textContent='Demo';
  }
  function showApp(){
    cancelUnlockTransition();
    securityState=null;lastActivity=Date.now();lastHeartbeat=Date.now();
    $('#securityScreen').hidden=true;
    window.location.hash='#/crm/dashboard';
    $('#loginScreen').hidden=true;$('#app').hidden=false;
    document.body.classList.remove('login-open');updateProfileUI();render();
    notifyPortal('ready');
  }
  function showLogin(){
    cancelUnlockTransition();securityState=null;$('#securityScreen').hidden=true;$('#securityPrompt').hidden=true;
    window.location.hash='#/login';
    $('#app').hidden=true;$('#loginScreen').hidden=false;
    document.body.classList.add('login-open');$('#loginError').hidden=true;
    $('#loginPassword').value='';
    setTimeout(()=>$('#loginEmail')?.focus(),20);
  }
  function demoSecurityRead(){try{return JSON.parse(localStorage.getItem(DEMO_SECURITY_KEY))||{};}catch(_){return {};}}
  function demoSecurityWrite(obj){localStorage.setItem(DEMO_SECURITY_KEY,JSON.stringify(obj));}
  function demoFailure(){const s=demoSecurityRead();s.failures=(Number(s.failures)||0)+1;
    if(s.failures>=3){s.blocked_until=Date.now()+60*60*1000;s.approval_required=true;}
    demoSecurityWrite(s);return {remaining:Math.max(0,3-s.failures),state:s.approval_required?'blocked':'active'};}
  function demoState(){const s=demoSecurityRead();return s.approval_required?'blocked':'active';}
  function enterSecurity(state,message=''){
    if(!currentMode)return;
    cancelUnlockTransition();securityState=state;otpSent=false;
    $('#app').hidden=true;$('#loginScreen').hidden=true;$('#securityScreen').hidden=false;
    $('#toastRoot').replaceChildren();
    $('#securityPrompt').hidden=true;waitingForPassword=false;
    $('#modalRoot').hidden=true;$('#modalRoot').innerHTML='';document.body.style.overflow='';modalContext=null;
    window.location.hash='#/seguridad';renderSecurity(message);
    notifyPortal('ready');
  }
  // Pantalla de confirmación, presentada solo después de validar la contraseña
  // y verificar que el servidor ha restaurado la sesión activa.
  function showUnlockConfirmation(){
    if(!currentMode)return;
    cancelUnlockTransition();
    securityState='unlock_success';
    lastActivity=Date.now();lastHeartbeat=Date.now();
    $('#app').hidden=true;$('#loginScreen').hidden=true;$('#securityScreen').hidden=false;
    window.location.hash='#/seguridad/validada';
    renderSecurity();
    // La confirmación se puede omitir con el botón y se cierra automáticamente.
    unlockTransitionTimer=setTimeout(()=>{
      unlockTransitionTimer=null;
      if(currentMode&&securityState==='unlock_success')showApp();
    },2300);
  }
  function renderSecurity(message=''){
    const card=$('#securityCard');
    const err=message?`<p class="security-error" role="alert">${escapeHtml(message)}</p>`:'';
    let title='',text='',controls='';
    if(securityState==='unlock_success'){
      title='Identidad verificada';
      text='Tu sesión se desbloqueó correctamente. Ya puedes continuar en el CRM.';
      controls='<div class="security-verified-progress" aria-hidden="true"><span></span></div><button type="button" class="btn btn-primary" id="securityContinue">Continuar al panel</button>';
    }else if(securityState==='unlock_checking'){
      title='Validando acceso';
      text='Estamos verificando tu identidad y restaurando tu sesión de forma segura.';
      controls='<div class="security-loading-spinner" aria-hidden="true"></div><p class="security-muted" role="status">Comprobando sesión…</p>';
    }else if(securityState==='idle_locked'){
      title='Sesión bloqueada';text='Pasaron 5 minutos sin actividad. Confirma tu contraseña para continuar.';
      controls=`<form id="securityUnlockForm"><label for="securityUnlockPassword">Contraseña</label><input id="securityUnlockPassword" type="password" autocomplete="current-password" required autofocus/><button class="btn btn-primary" type="submit">Desbloquear sesión</button></form>`;
    }else if(securityState==='blocked'){
      title='Acceso temporalmente bloqueado';
      text='Se agotaron los 3 intentos. El bloqueo dura al menos 1 hora y requiere autorización del administrador de la base de datos.';
      controls='<p class="security-warning">Una vez autorizada la recuperación, podrás validar un código OTP y tu contraseña.</p><button type="button" class="btn btn-primary" id="checkSecurityStatus">Comprobar autorización</button>';
      if(currentMode==='demo')controls+='<button type="button" class="security-secondary" id="demoResetSecurity">Reiniciar simulación (solo demo)</button>';
    }else if(securityState==='recovery_ready'){
      title='Verifica tu identidad';text='El administrador autorizó la recuperación. Te enviaremos un código de seis dígitos al correo verificado.';
      controls=`<form id="securityOTPForm"><label for="securityOTPCode">Código de verificación</label><input id="securityOTPCode" class="security-digits" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" required/><button type="submit" class="btn btn-primary">Verificar código</button></form><button type="button" class="security-secondary" id="sendSecurityOTP">${otpSent?'Reenviar código':'Enviar código OTP'}</button>`;
    }else if(securityState==='recovery_password'){
      title='Confirma tu contraseña';text='El código fue validado. Introduce tu contraseña para reactivar el acceso.';
      controls=`<form id="securityRecoveryForm"><label for="securityRecoveryPassword">Contraseña actual</label><input id="securityRecoveryPassword" type="password" autocomplete="current-password" required /><button type="submit" class="btn btn-primary">Recuperar acceso</button></form>`;
    }else{
      title='Acceso restringido';text='No se pudo verificar tu sesión de forma segura.';
      controls='<button class="btn btn-primary" type="button" id="checkSecurityStatus">Reintentar verificación</button>';
    }
    const isVerifying=securityState==='unlock_checking';
    const isSuccess=securityState==='unlock_success';
    card.classList.toggle('security-card-verified',isSuccess);
    card.innerHTML=`<div class="security-mark ${isSuccess?'security-mark-verified':''}">${icon('shield')}</div><h1 id="securityTitle">${title}</h1><p>${text}</p>${err}${controls}${isSuccess||isVerifying?'':'<button class="security-secondary" type="button" id="securityExit">Cerrar sesión</button>'}`;
    const first=card.querySelector('input');if(first)setTimeout(()=>first.focus(),20);
  }
  async function refreshSecurity(){if(!isLive())return;
    try{const state=await REMOTE.status();
      if(state.state==='active'){securityState='unlock_checking';renderSecurity();await fetchLive();showUnlockConfirmation();}
      else{securityState=state.state;renderSecurity();}
    }catch(err){renderSecurity(err.message);}}
  async function unlockSecurity(password){
    if(securityState!=='idle_locked')return;
    securityState='unlock_checking';renderSecurity();
    if(currentMode==='demo'){
      const s=demoSecurityRead();if(s.approval_required){enterSecurity('blocked');return;}
      if(password!==DEMO_PASSWORD){
        const result=demoFailure();
        if(result.state==='blocked')enterSecurity('blocked');
        else{securityState='idle_locked';renderSecurity(`Contraseña incorrecta. Te quedan ${result.remaining} intentos.`);}
        return;
      }
      demoSecurityWrite({failures:0});showUnlockConfirmation();return;
    }
    let accepted=false;
    try{
      await REMOTE.unlock(password);
      accepted=true;
      const status=await REMOTE.status();
      if(status.state!=='active'){enterSecurity(status.state||'unavailable');return;}
      await fetchLive();
      showUnlockConfirmation();
    }catch(err){
      if(err.state==='blocked'){enterSecurity('blocked');return;}
      securityState=accepted?'unavailable':'idle_locked';
      renderSecurity(accepted?'No se pudo recuperar el panel. Reintenta la comprobación de sesión.':(err.remaining!==undefined?`Contraseña incorrecta. Intentos disponibles: ${err.remaining}.`:err.message));
    }
  }
  function passwordPrompt(){
    return new Promise(resolve=>{
      const overlay=$('#securityPrompt'),form=$('#securityPromptForm'),pwd=$('#securityPromptPassword'),cancel=$('#securityPromptCancel');
      overlay.hidden=false;waitingForPassword=true;pwd.value='';$('#securityPromptError').hidden=true;
      const finish=value=>{form.removeEventListener('submit',onSubmit);cancel.removeEventListener('click',onCancel);
        overlay.hidden=true;pwd.value='';waitingForPassword=false;resolve(value);};
      const onSubmit=e=>{e.preventDefault();finish(pwd.value);};
      const onCancel=()=>finish(null);
      form.addEventListener('submit',onSubmit);cancel.addEventListener('click',onCancel);
      setTimeout(()=>pwd.focus(),20);
    });
  }
  async function protectedMutation(table,operation,data,id,applyDemo){
    for(let i=0;i<3;i++){
      if(!currentMode||securityState)return false;
      const password=await passwordPrompt();if(password===null)return false;
      if(currentMode==='demo'){
        if(password!==DEMO_PASSWORD){const result=demoFailure();
          if(result.state==='blocked'){enterSecurity('blocked');return false;}
          toast(`Contraseña incorrecta. Intentos disponibles: ${result.remaining}`,'bad');continue;}
        demoSecurityWrite({failures:0});if(applyDemo)await applyDemo();return true;
      }
      try{await REMOTE.mutation(table,operation,data,id,password);return true;}
      catch(err){if(err.state==='blocked'||err.state==='idle_locked'){enterSecurity(err.state);return false;}
        if(err.remaining!==undefined){toast(`Contraseña incorrecta. Intentos disponibles: ${err.remaining}`,'bad');continue;}
        toast('No se realizó el cambio: '+err.message,'bad');return false;}
    }
    return false;
  }
  async function activityHeartbeat(){
    if(!isLive()||securityState||Date.now()-lastHeartbeat<30000)return;
    lastHeartbeat=Date.now();
    try{const result=await REMOTE.heartbeat();if(result.state!=='active')enterSecurity(result.state);}
    catch(err){enterSecurity(err.state||'unavailable','No se pudo comprobar el estado de la sesión.');}
  }
  function markUserActivity(){if(!currentMode||securityState||$('#app').hidden)return;
    const now=Date.now();if(now-lastActivity>=INACTIVITY_MS){enterSecurity('idle_locked');return;}
    lastActivity=now;if(isLive())void activityHeartbeat();}
  function loginError(message){const el=$('#loginError');el.hidden=false;el.textContent=message||'No fue posible iniciar sesión.';}
  async function fetchLive(){
    const {data,issues}=await REMOTE.loadAll();
    db=data;loadIssues=issues;
    updateProfileUI();render();
    if(issues.length)toast(`No se pudieron cargar: ${issues.map(x=>x.table).join(', ')}. Verifica tus permisos.`, 'bad');
  }
  async function attemptLogin(email,password){
    if(busy)return;authRevision++;
    busy=true;const submit=$('#loginForm button[type="submit"]');submit.disabled=true;submit.textContent='Comprobando acceso…';
    try{
      const profile=await REMOTE.login(email,password);
      currentMode='live';currentSession=profile;
      if(profile.securityState!=='active'){enterSecurity(profile.securityState);return;}
      await fetchLive();showApp();
    }catch(err){
      clearSession();loginError(err?.message||'Error de conexión con Supabase.');
      try{await REMOTE.logout();}catch(_){}
    }finally{busy=false;submit.disabled=false;submit.textContent='Iniciar sesión';}
  }
  async function restoreRemote(){
    const revision=authRevision;
    if(!window.supabase){showLogin();loginError('No se pudo cargar Supabase JS.');notifyPortal('failed','No se pudo cargar Supabase.');return;}
    try{
      const session=await REMOTE.restore();
      if(revision!==authRevision||currentMode==='demo')return;
      if(!session){if(integrated)notifyPortal('session-lost');else window.location.replace('../index.html');return;}
      currentMode='live';currentSession=session;
      if(session.securityState!=='active'){enterSecurity(session.securityState);return;}
      await fetchLive();showApp();
    }catch(err){
      if(revision!==authRevision||currentMode==='demo')return;
      clearSession();showLogin();loginError('No se pudo recuperar la sesión: '+(err?.message||'error'));
      notifyPortal('failed',err?.message||'Error al comprobar el perfil de administrador.');}
  }
  function openDemo(){
    authRevision++;currentMode='demo';currentSession={id_usuario:1,email:DEMO_LOGIN.email,name:DEMO_LOGIN.name,role:'Administrador • Demo'};
    try {const stored=JSON.parse(localStorage.getItem(KEY));db=validDB(stored)?stored:clone(seed);}catch(_){db=clone(seed);}
    loadIssues=[];page='resumen';
    if(demoState()==='blocked')enterSecurity('blocked');else showApp();
  }
  async function exitCRM(){
    authRevision++;const wasLive=isLive();clearSession();$('#securityScreen').hidden=true;$('#securityPrompt').hidden=true;
    if(wasLive){try{await REMOTE.logout();}catch(err){toast('No se pudo cerrar la sesión remota. Revisa tu conexión.','bad');}}
    if(integrated)notifyPortal('logout');else window.location.replace('../index.html');
  }
  function logActivity(tipo, detalle){db.actividad ||= [];db.actividad.unshift({fecha:new Date().toISOString().slice(0,10),tipo,detalle});db.actividad=db.actividad.slice(0,70);}
  function toast(message, kind='ok'){const el=document.createElement('div');el.className=`toast ${kind==='bad'?'bad':''}`;el.textContent=message;$('#toastRoot').append(el);setTimeout(()=>el.remove(),4500);}
  function statusClass(s){if(['ACTIVO','ACTIVA','RESUELTO'].includes(s))return '';if(['POR RESOLVER','PAUSADA','MANTENIMIENTO','AUSENTE','POR VALIDAR'].includes(s))return 'warning';if(['INACTIVO','INACTIVA','BLOQUEADO'].includes(s))return 'danger';if(s==='EN PROCESO')return 'info';return 'neutral';}
  const pill = s => `<span class="status-pill ${statusClass(s)}">${escapeHtml(s||'Sin estado')}</span>`;
  const nameCell=(main,sub,avatar='RG')=>`<div class="name-cell"><span class="table-avatar">${escapeHtml(avatar).slice(0,3)}</span><span><span class="name-main">${clean(main)}</span><span class="name-secondary">${clean(sub)}</span></span></div>`;
  const field = (key,name,type='text',extra={}) => ({key,name,type,...extra});
  const opts = (entity, fmt, filterFn) => rows(entity).filter(filterFn||(()=>true)).slice().sort((a,b)=>alphabetical(fmt(a),fmt(b))).map(r=>({value:r[pk[entity]],label:fmt(r)}));
  function schema(entity, current={}){
    const isSame = (type,row)=>Number(row[pk[type]])===Number(current[pk[type]]);
    const available = (what,r) => rows('rutas').every(route=>Number(route[what])!==Number(r[pk[what==='id_conductor'?'conductores':what==='id_camion'?'camiones':'horarios']]) || route.estado_ruta!=='ACTIVA' || Number(route.id_ruta)===Number(current.id_ruta));
    const locOpts=opts('corregimientos',r=>`${r.nombre_corregimiento} · ${districtName(r.id_distrito)}`,r=>active(r,'corregimientos')||Number(r.id_corregimiento)===Number(current.id_corregimiento));
    const commonStatus=(type,key)=>field(key,'Estado','select',{options:statuses[type].map(v=>({value:v,label:v})),required:true});
    switch(entity){
      case 'usuarios':return [field('nombre_usuario','Nombre','text',{required:true}),field('apellido_usuario','Apellido','text',{required:true}),field('correo_usuario','Correo electrónico','email',{required:true}),field('cedula_usuario','Cédula','text',{required:true}),field('telefono_usuario','Teléfono','tel',{required:true}),field('id_rol','Rol','select',{required:true,options:opts('roles',r=>r.nombre_rol,r=>Number(r.id_rol)!==1&&(active(r,'roles')||Number(r.id_rol)===Number(current.id_rol)))}),field('id_corregimiento','Corregimiento','select',{required:true,options:locOpts}),field('fecha_inicio','Fecha de inicio','date',{required:true}),field('fecha_fin','Fecha de finalización','date'),field('estado_usuario','Estado','select',{required:true,options:['ACTIVO','INACTIVO'].map(x=>({value:x,label:x}))})];
      case 'roles':return [field('nombre_rol','Nombre del rol','text',{required:true}),commonStatus('roles','estado_rol')];
      case 'rutas':return [field('id_corregimiento','Corregimiento','select',{required:true,options:locOpts}),field('barrio','Barrio / sector','text'),field('calle','Calle','text'),field('id_horario','Horario','select',{required:true,options:opts('horarios',r=>scheduleName(r.id_horario),r=>available('id_horario',r))}),field('id_conductor','Conductor','select',{required:true,options:opts('conductores',r=>`${r.nombre_conductor} ${r.apellido_conductor}`,r=>(active(r,'conductores')||r.id_conductor===current.id_conductor)&&available('id_conductor',r))}),field('id_camion','Camión','select',{required:true,options:opts('camiones',r=>`${r.matricula} · ${r.modelo}`,r=>(active(r,'camiones')||r.id_camion===current.id_camion)&&available('id_camion',r))}),commonStatus('rutas','estado_ruta')];
      case 'horarios':return [field('__fecha','Fecha de recolección','date',{required:true}),field('__inicio','Hora de inicio','time',{required:true}),field('__fin','Hora de fin','time',{required:true})];
      case 'incidentes':return [field('asunto','Asunto','text',{required:true,wide:true}),field('descripcion','Descripción','textarea',{required:true,wide:true}),field('id_usuario','Ciudadano que reporta','select',{options:opts('usuarios',r=>`${r.nombre_usuario} ${r.apellido_usuario}`),empty:'Sin cuenta (invitado)'}),field('correo_inv','Correo del invitado','email'),field('corregimiento_invitado','Corregimiento invitado','select',{options:locOpts,empty:'No aplica'}),field('id_ruta','Ruta asociada','select',{options:opts('rutas',r=>`#${r.id_ruta} · ${r.barrio}`),empty:'Sin ruta'}),field('fecha_incidente','Fecha de reporte','date',{required:true}),field('hora_incidente','Hora de reporte','time',{required:true}),commonStatus('incidentes','estado_incidente'),field('img','Imagen (opcional)','file',{wide:true,hint:'Imagen PNG, JPG o WEBP; máximo 800 KB. Se enviará a Supabase únicamente si tienes permisos.'})];
      case 'conductores':return [field('nombre_conductor','Nombre','text',{required:true}),field('apellido_conductor','Apellido','text',{required:true}),field('cedula_conductor','Cédula','text',{required:true}),field('telefono_conductor','Teléfono','tel',{required:true}),field('sexo_conductor','Sexo','select',{options:['M','F','Otro'].map(v=>({value:v,label:v}))}),field('id_corregimiento','Corregimiento','select',{required:true,options:locOpts}),field('fecha_nac','Fecha de nacimiento','date',{required:true}),field('fecha_inicio','Fecha de inicio','date',{required:true}),field('fecha_fin','Fecha de finalización','date',{required:true}),commonStatus('conductores','estado_conductor')];
      case 'camiones':return [field('modelo','Modelo','text',{required:true}),field('matricula','Matrícula','text',{required:true}),field('anio','Año','number',{required:true,min:1900,max:2200}),commonStatus('camiones','estado_camion')];
      case 'provincia':return [field('nombre_provincia','Nombre de la provincia','text',{required:true}),commonStatus('provincia','estado_provincia')];
      case 'distritos':return [field('nombre_distrito','Nombre del distrito','text',{required:true}),field('id_provincia','Provincia','select',{required:true,options:opts('provincia',r=>r.nombre_provincia,r=>active(r,'provincia')||r.id_provincia===current.id_provincia)}),commonStatus('distritos','estado_distrito')];
      case 'corregimientos':return [field('nombre_corregimiento','Nombre del corregimiento','text',{required:true}),field('id_distrito','Distrito','select',{required:true,options:opts('distritos',r=>`${r.nombre_distrito} · ${provinceName(r.id_provincia)}`,r=>active(r,'distritos')||r.id_distrito===current.id_distrito)}),commonStatus('corregimientos','estado_corregimiento')];
      case 'coordenadas':return [field('id_ruta','Ruta','select',{required:true,options:opts('rutas',r=>`#${r.id_ruta} · ${r.barrio}`)}),field('secuencia','Orden del punto','number',{required:true,min:1}),field('latitud','Latitud','number',{required:true,min:-90,max:90,step:'any'}),field('longitud','Longitud','number',{required:true,min:-180,max:180,step:'any'}),field('barrio','Barrio','text'),field('calle','Calle','text')];
      default:return [];
    }
  }
  function columns(entity){
    switch(entity){
      case 'usuarios':return [{h:'Usuario',f:r=>nameCell(userName(r.id_usuario),r.correo_usuario,`${r.nombre_usuario?.[0]||''}${r.apellido_usuario?.[0]||''}`)},{h:'Rol',f:r=>clean(roleName(r.id_rol))},{h:'Ubicación',f:r=>clean(locationName(r.id_corregimiento))},{h:'Teléfono',f:r=>clean(r.telefono_usuario)},{h:'Estado',f:r=>pill(r.estado_usuario)}];
      case 'roles':return [{h:'Rol',f:r=>nameCell(r.nombre_rol,`Identificador #${r.id_rol}`,'R')},{h:'Usuarios asociados',f:r=>String(rows('usuarios').filter(u=>u.id_rol===r.id_rol).length)},{h:'Estado',f:r=>pill(r.estado_rol)}];
      case 'rutas':return [{h:'Ruta / sector',f:r=>nameCell(`#${r.id_ruta} · ${r.barrio||locationName(r.id_corregimiento)}`,r.calle,'↗')},{h:'Corregimiento',f:r=>clean(locationName(r.id_corregimiento))},{h:'Horario',f:r=>clean(scheduleName(r.id_horario))},{h:'Conductor / camión',f:r=>`<b>${clean(driverName(r.id_conductor))}</b><span class="name-secondary">${clean(truckName(r.id_camion))}</span>`},{h:'Estado',f:r=>pill(r.estado_ruta)}];
      case 'horarios':return [{h:'Horario',f:r=>nameCell(`#${r.id_horario} · ${startTime(r)} a ${endTime(r)}`,friendlyDate(dateFrom(r)),'H')},{h:'Fecha de recolección',f:r=>clean(friendlyDate(dateFrom(r)))},{h:'Rutas vinculadas',f:r=>String(rows('rutas').filter(t=>t.id_horario===r.id_horario).length)},{h:'Disponibilidad',f:r=>rows('rutas').some(t=>t.id_horario===r.id_horario)?pill('ASIGNADO'):pill('DISPONIBLE')}];
      case 'incidentes':return [{h:'Asunto',f:r=>nameCell(r.asunto,String(r.descripcion||'').slice(0,45)+'…','!')},{h:'Reportado por',f:r=>clean(r.id_usuario?userName(r.id_usuario):r.correo_inv||'Invitado')},{h:'Ruta',f:r=>clean(routeName(r.id_ruta))},{h:'Fecha',f:r=>clean(friendlyDate(r.fecha_incidente))},{h:'Estado',f:r=>pill(r.estado_incidente)}];
      case 'conductores':return [{h:'Conductor',f:r=>nameCell(label('conductores',r),r.cedula_conductor,`${r.nombre_conductor?.[0]||''}${r.apellido_conductor?.[0]||''}`)},{h:'Teléfono',f:r=>clean(r.telefono_conductor)},{h:'Corregimiento',f:r=>clean(locationName(r.id_corregimiento))},{h:'Ruta asignada',f:r=>clean(rows('rutas').find(x=>x.id_conductor===r.id_conductor)?.barrio||'Sin ruta')},{h:'Estado',f:r=>pill(r.estado_conductor)}];
      case 'camiones':return [{h:'Camión',f:r=>nameCell(r.matricula,r.modelo,'T')},{h:'Año',f:r=>clean(r.anio)},{h:'Conductor asignado',f:r=>clean(driverName(rows('rutas').find(x=>x.id_camion===r.id_camion)?.id_conductor))},{h:'Estado',f:r=>pill(r.estado_camion)}];
      case 'provincia':return [{h:'Provincia',f:r=>nameCell(r.nombre_provincia,`Código ${r.id_provincia}`,'P')},{h:'Distritos',f:r=>String(rows('distritos').filter(d=>d.id_provincia===r.id_provincia).length)},{h:'Estado',f:r=>pill(r.estado_provincia)}];
      case 'distritos':return [{h:'Distrito',f:r=>nameCell(r.nombre_distrito,`Código ${r.id_distrito}`,'D')},{h:'Provincia',f:r=>clean(provinceName(r.id_provincia))},{h:'Corregimientos',f:r=>String(rows('corregimientos').filter(c=>c.id_distrito===r.id_distrito).length)},{h:'Estado',f:r=>pill(r.estado_distrito)}];
      case 'corregimientos':return [{h:'Corregimiento',f:r=>nameCell(r.nombre_corregimiento,`Código ${r.id_corregimiento}`,'C')},{h:'Distrito',f:r=>clean(districtName(r.id_distrito))},{h:'Provincia',f:r=>clean(provinceName(record('distritos',r.id_distrito)?.id_provincia))},{h:'Estado',f:r=>pill(r.estado_corregimiento)}];
      case 'coordenadas':return [{h:'Punto',f:r=>nameCell(`Punto ${r.secuencia}`,r.barrio||'Sin barrio','•')},{h:'Ruta',f:r=>clean(routeName(r.id_ruta))},{h:'Latitud',f:r=>Number(r.latitud).toFixed(5)},{h:'Longitud',f:r=>Number(r.longitud).toFixed(5)},{h:'Calle',f:r=>clean(r.calle)}];
      default:return [];
    }
  }
  function pageHeader(title,sub,action='') {return `<div class="page-top"><div><div class="eyebrow">RGR Panamá / Administración</div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-sub">${escapeHtml(sub)}</p></div><div class="page-actions">${action}</div></div>`;}
  const button = (text,action,entity='',id='',cls='btn-primary',ic='plus')=>`<button type="button" class="btn ${cls}" data-action="${action}" data-entity="${entity}" data-id="${escapeHtml(id)}">${icon(ic)}${escapeHtml(text)}</button>`;
  function stats(entity){const total=rows(entity).length;const sf=statusField[entity];return `<div class="stat-mini-grid"><div class="mini-stat"><b>${total}</b><p>Registros totales</p></div><div class="mini-stat"><b>${sf?rows(entity).filter(r=>active(r,entity)).length:total}</b><p>${sf?'Activos / completados':'Disponibles'}</p></div><div class="mini-stat"><b>${sf?rows(entity).filter(r=>!active(r,entity)).length:0}</b><p>${sf?'Otros estados':'Sin asignaciones'}</p></div></div>`;}
  function listPage(entity,title,subtitle,viewKey=entity,overrideRows=null){
    const isOperators=viewKey==='operadores';
    const all=(overrideRows||rows(entity)).filter(r=>entity!=='usuarios'||!isAdminAccount(r));
    const sf=statusField[entity];const f=filters[viewKey]||'TODOS';
    const match=r=> (!sf||f==='TODOS'||r[sf]===f) && (!searching || Object.values(r).join(' ').concat(' ',label(entity,r),' ',entity==='rutas'?locationName(r.id_corregimiento):'').toLowerCase().includes(searching));
    const filtered=all.filter(match);
    const sortLoc=['provincia','distritos','corregimientos'].includes(entity);
    if(sortLoc) filtered.sort((a,b)=>(active(b,entity)?1:0)-(active(a,entity)?1:0)||alphabetical(label(entity,a),label(entity,b)));
    if(entity==='coordenadas')filtered.sort((a,b)=>a.id_ruta-b.id_ruta||a.secuencia-b.secuencia);
    const buttons=`${button('Exportar CSV','exportCSV',entity,'','btn-light','download')}${(isLive()&&entity==='usuarios')?'':button(isOperators?'Nuevo operador':`Nuevo ${entity==='rutas'?'ruta':entity==='incidentes'?'reporte':entity==='coordenadas'?'punto':entity==='roles'?'rol':entity==='provincia'?'provincia':entity==='distritos'?'distrito':entity==='corregimientos'?'corregimiento':entity==='horarios'?'horario':entity==='usuarios'?'usuario':entity==='conductores'?'conductor':'camión'}`,'new',entity)}`;
    const toolbar=`<div class="table-toolbar"><label class="search-field">${icon('search')}<input id="tableSearch" value="${escapeHtml(searching)}" placeholder="Buscar registros..." aria-label="Buscar registros" /></label>${sf?`<select id="statusFilter" class="select-filter" aria-label="Filtrar por estado"><option value="TODOS">Todos los estados</option>${statuses[entity].map(s=>`<option value="${s}" ${f===s?'selected':''}>${s}</option>`).join('')}</select>`:''}<span class="record-count">${filtered.length} de ${all.length} registros</span></div>`;
    const heads=columns(entity);
    const body=filtered.length?`<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(c=>`<th>${escapeHtml(c.h)}</th>`).join('')}<th style="text-align:right">Acciones</th></tr></thead><tbody>${filtered.map(r=>`<tr>${heads.map(c=>`<td>${c.f(r)}</td>`).join('')}<td><div class="action-cell"><button class="action-icon" data-action="view" data-entity="${entity}" data-id="${r[pk[entity]]}" title="Ver detalle" aria-label="Ver detalle">${icon('eye')}</button><button class="action-icon" ${restrictedRecord(entity,r)||(entity==='usuarios'&&!manageableUser(r))?'disabled title="Cuenta protegida"':''} data-action="edit" data-entity="${entity}" data-id="${r[pk[entity]]}" title="Editar" aria-label="Editar">${icon('edit')}</button>${sf?`<button class="action-icon" ${restrictedRecord(entity,r)||(entity==='usuarios'&&!manageableUser(r))?'disabled title="Cuenta protegida"':''} data-action="status" data-entity="${entity}" data-id="${r[pk[entity]]}" title="Cambiar estado" aria-label="Cambiar estado">${icon('refresh')}</button>`:''}${`<button class="action-icon danger" ${restrictedRecord(entity,r)||(entity==='usuarios'&&!manageableUser(r))?'disabled':''} data-action="delete" data-entity="${entity}" data-id="${r[pk[entity]]}" title="${entity==='usuarios'?'Dar de baja':'Eliminar'}" aria-label="${entity==='usuarios'?'Dar de baja':'Eliminar'}">${icon('trash')}</button>`}</div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${icon('search')}<b>No hay resultados</b><p>Prueba otra búsqueda o crea un registro nuevo.</p></div>`;
    return pageHeader(title,subtitle,buttons)+ (entity==='usuarios'||entity==='rutas'?stats(entity):'')+`<section class="surface">${toolbar}${body}</section>`;
  }
  function kpi(label,num,type,ic,tag){return `<div class="kpi"><div class="kpi-head"><span class="kpi-icon ${type}">${icon(ic)}</span><span class="kpi-tag">${tag}</span></div><strong>${num}</strong><p>${label}</p></div>`;}
  function trendChart(){
    const months=Array.from({length:6},(_,i)=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-5+i);return {y:d.getFullYear(),m:d.getMonth()+1,txt:d.toLocaleString('es-PA',{month:'short'})};});
    const counts=months.map(t=>rows('incidentes').filter(i=>{const d=String(i.fecha_incidente||'').split('-');return Number(d[0])===t.y&&Number(d[1])===t.m}).length);
    const max=Math.max(4,...counts), w=590,h=225, left=39,right=15,top=15,bottom=32,plotw=w-left-right,ploth=h-top-bottom;
    const yVal=n=>top+ploth-n/max*ploth;
    const pts=counts.map((n,i)=>[left+i*(plotw/5),yVal(n)]);
    const line=pts.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
    const area=`${line} L ${pts[pts.length-1][0]} ${top+ploth} L ${left} ${top+ploth} Z`;
    return `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Gráfico de incidencias por mes" role="img"><defs><linearGradient id="rgrGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#20a84a" stop-opacity=".19"/><stop offset="1" stop-color="#20a84a" stop-opacity=".005"/></linearGradient></defs>${Array.from({length:5},(_,j)=>{const n=max*j/4;const y=yVal(n);return `<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#eaf0eb"/><text x="10" y="${y+4}" fill="#9bac9f" font-size="11">${Math.round(n)}</text>`}).join('')}<path d="${area}" fill="url(#rgrGrad)"/><path d="${line}" fill="none" stroke="#1d9c4c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#159348" stroke="#fff" stroke-width="2"/>`).join('')}${months.map((m,i)=>`<text x="${left+i*(plotw/5)}" y="${h-9}" fill="#9cab9f" text-anchor="middle" font-size="11">${m.txt}</text>`).join('')}</svg>`;
  }
  function donut(){const counts=['RESUELTO','EN PROCESO','POR RESOLVER'].map(s=>rows('incidentes').filter(i=>i.estado_incidente===s).length);const all=counts.reduce((a,b)=>a+b,0)||1;const stops=[];let cur=0;counts.forEach((n,i)=>{const next=cur+n/all*100;stops.push(`${['#20a84a','#f2a74f','#e7676b'][i]} ${cur}% ${next}%`);cur=next;});return `<div class="donut-layout"><div class="donut" style="background:conic-gradient(${stops.join(',')})"><div class="donut-inner"><b>${rows('incidentes').length}</b><small>reportes</small></div></div><div class="donut-legend">${['Resueltos','En proceso','Pendientes'].map((t,i)=>`<div class="donut-line"><i style="background:${['#20a84a','#f2a74f','#e7676b'][i]}"></i>${t}<b>${counts[i]}</b></div>`).join('')}</div></div>`;}
  function overview(){const pending=rows('incidentes').filter(i=>i.estado_incidente==='POR RESOLVER').length;const activeRoutes=rows('rutas').filter(r=>r.estado_ruta==='ACTIVA').length;const availableTrucks=rows('camiones').filter(t=>t.estado_camion==='ACTIVO'&&!rows('rutas').some(r=>r.estado_ruta==='ACTIVA'&&r.id_camion===t.id_camion)).length;
    return pageHeader('Resumen general','Bienvenido al centro de control de recolección de RGR Panamá.',`<button class="btn btn-light" type="button" data-action="exportJSON">${icon('download')} Respaldar datos</button>`)+
    `<div class="kpis">${kpi('Rutas activas',activeRoutes,'','route','Operativas')}${kpi('Usuarios registrados',rows('usuarios').length,'blue','users','Sistema')}${kpi('Incidencias pendientes',pending,'orange','alert','Atención')}${kpi('Camiones disponibles',availableTrucks,'purple','truck','Flota libre')}</div>`+
    `<div class="dashboard-grid"><section class="surface"><div class="surface-head"><div><h3>Actividad de incidencias</h3><p class="surface-caption">Reportes recibidos en los últimos 6 meses</p></div></div><div class="chart-wrap">${trendChart()}</div><div class="legend"><span><i style="background:#20a84a"></i>Incidencias registradas</span></div></section><section class="surface"><div class="surface-head"><div><h3>Estado de incidencias</h3><p class="surface-caption">Distribución de reportes actuales</p></div><button class="btn-link" data-page="incidencias">Ver detalles →</button></div>${donut()}</section></div>`+
    `<div class="dashboard-grid lower"><section class="surface"><div class="surface-head"><div><h3>Incidencias recientes</h3><p class="surface-caption">Últimos movimientos del sistema</p></div><button class="btn-link" data-page="incidencias">Ver todas →</button></div><div class="activity-list">${rows('incidentes').slice().sort((a,b)=>String(b.fecha_incidente).localeCompare(String(a.fecha_incidente))).slice(0,5).map(r=>`<div class="activity-row"><span class="activity-icon">${icon('alert')}</span><div><b>${clean(r.asunto)}</b><small>${clean(routeName(r.id_ruta))} · ${friendlyDate(r.fecha_incidente)}</small></div><div class="activity-end">${pill(r.estado_incidente)}</div></div>`).join('')}</div></section><section class="surface"><div class="surface-head"><div><h3>Rutas en el territorio</h3></div><button class="btn-link" data-page="rutas">Ver rutas →</button></div><div class="rgr-dashboard-map"><div class="rgr-street-map" id="rgrCRMMapDashboard" aria-label="Mapa de rutas registradas"></div></div><div class="rgr-map-legend"><span><i class="start"></i> Inicio</span><span><i class="end"></i> Final</span><button type="button" class="btn-link" data-page="mapa">Ampliar mapa →</button></div></section></div>`+
    `<div class="surface"><div class="surface-head"><div><h3>Acciones rápidas</h3></div></div><div class="page-actions" style="justify-content:flex-start">${button('Nueva ruta','new','rutas')}${button('Nuevo horario','new','horarios','','btn-light','calendar')}${button('Registrar conductor','new','conductores','','btn-light','user')}${button('Crear reporte','new','incidentes','','btn-light','alert')}</div></div>`;
  }
  function geography(){return pageHeader('Ubicaciones','Catálogo territorial: provincias, distritos y corregimientos.',`${button('Exportar CSV','exportCSV',geoTab,'','btn-light','download')}${button('Agregar ubicación','new',geoTab)}`)+`<div class="tabs">${[['provincia','Provincias'],['distritos','Distritos'],['corregimientos','Corregimientos']].map(([val,text])=>`<button class="tab ${geoTab===val?'active':''}" data-geo="${val}">${text} <span>(${rows(val).length})</span></button>`).join('')}</div>`+listSection(geoTab,'ubicaciones');}
  function listSection(entity,view){const sf=statusField[entity],f=filters[view]||'TODOS';const list=rows(entity).filter(r=>(f==='TODOS'||r[sf]===f)&&(!searching||Object.values(r).join(' ').toLowerCase().includes(searching)||label(entity,r).toLowerCase().includes(searching))).sort((a,b)=>Number(active(b,entity))-Number(active(a,entity))||alphabetical(label(entity,a),label(entity,b)));
    const headings=columns(entity);
    return `<section class="surface"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="tableSearch" placeholder="Buscar ubicación..." value="${escapeHtml(searching)}" /></label><select class="select-filter" id="statusFilter"><option value="TODOS">Todos los estados</option>${statuses[entity].map(v=>`<option ${v===f?'selected':''}>${v}</option>`).join('')}</select><span class="record-count">${list.length} de ${rows(entity).length} registros</span></div>${list.length?`<div class="table-wrap"><table class="data-table"><thead><tr>${headings.map(h=>`<th>${h.h}</th>`).join('')}<th style="text-align:right">Acciones</th></tr></thead><tbody>${list.map(r=>`<tr>${headings.map(h=>`<td>${h.f(r)}</td>`).join('')}<td><div class="action-cell">${['view','edit','status','delete'].map(a=>`<button class="action-icon ${a==='delete'?'danger':''}" data-action="${a}" data-entity="${entity}" data-id="${r[pk[entity]]}" title="${a}">${icon({view:'eye',edit:'edit',status:'refresh',delete:'trash'}[a])}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${icon('pin')}<b>No se encontraron ubicaciones</b><p>Crea una nueva ubicación o cambia el filtro.</p></div>`}</section>`;
  }
  function validMapRoutes(){return window.RGR_ROUTE_MAP?.normalize(rows('rutas'),rows('coordenadas'))||[];}
  function mapPage(){
    const mapped=validMapRoutes();
    const chosen=mapped.find(r=>String(r.id)===String(selectedMapRoute))||mapped[0];
    if(chosen)selectedMapRoute=chosen.id;
    const choices=mapped.map(r=>`<button type="button" class="${String(selectedMapRoute)===r.id?'selected':''}" data-map-id="${escapeHtml(r.id)}"><strong>${escapeHtml(label('rutas',r.route))}</strong><small>${r.coords.length} puntos · ${escapeHtml(r.route.estado_ruta||'Sin estado')}</small></button>`).join('');
    return pageHeader('Mapa de recorridos','Recorridos guardados en Supabase y ordenados por secuencia.',button('Actualizar','refreshMap','','','btn-light','refresh'))+
      `<div class="rgr-map-layout"><section class="surface"><div class="rgr-map-toolbar"><h3>Rutas en el territorio</h3><span class="record-count">${mapped.length} con coordenadas</span></div><div class="rgr-map-main"><div id="rgrCRMMapFull" class="rgr-street-map" aria-label="Mapa completo de rutas"></div></div><div class="rgr-map-legend"><span><i class="start"></i> Inicio</span><span><i class="end"></i> Final</span><span>Otros recorridos en gris</span></div><p class="rgr-map-caption">Las líneas unen los puntos registrados; no representan ubicación GPS en tiempo real.</p></section><section class="surface"><h3 style="margin-bottom:12px">Seleccionar ruta</h3><div class="rgr-map-route-list">${choices||'<p>No hay rutas con coordenadas disponibles.</p>'}</div></section></div>`;
  }
  function redrawGeoMaps(){
    if(!window.RGR_ROUTE_MAP)return;
    if(page==='resumen')window.RGR_ROUTE_MAP.mount({container:'#rgrCRMMapDashboard',routes:rows('rutas'),points:rows('coordenadas'),selectedId:selectedMapRoute,compact:true,showAll:true});
    if(page==='mapa')window.RGR_ROUTE_MAP.mount({container:'#rgrCRMMapFull',routes:rows('rutas'),points:rows('coordenadas'),selectedId:selectedMapRoute});
  }
  function reportPage(){const incidents=rows('incidentes'),n=incidents.length||1;const states=['POR RESOLVER','EN PROCESO','RESUELTO'];const routeStatuses=['ACTIVA','PAUSADA','INACTIVA'];const operators=rows('usuarios').filter(isOperator).length;return pageHeader('Reportes y análisis','Indicadores dinámicos calculados desde los registros del CRM.',`${button('Descargar incidencias','exportCSV','incidentes','','btn-light','download')}${button('Exportar JSON','exportJSON','','','btn-primary','download')}`)+`<div class="kpis">${kpi('Rutas totales',rows('rutas').length,'','route','Total')}${kpi('Operadores',operators,'blue','users','Personal')}${kpi('Incidencias resueltas',incidents.filter(i=>i.estado_incidente==='RESUELTO').length,'orange','check','Atendidos')}${kpi('Flota registrada',rows('camiones').length,'purple','truck','Recursos')}</div><div class="two-column"><section class="surface"><div class="surface-head"><h3>Estados de las incidencias</h3></div><div class="report-bars">${states.map((s,i)=>{const x=incidents.filter(t=>t.estado_incidente===s).length;return `<div class="report-line"><span>${s}</span><div class="bar-bg"><div class="bar-fill" style="width:${x/n*100}%;background:${['#ed7173','#f2a74f','#20a84a'][i]}"></div></div><strong>${x}</strong></div>`}).join('')}</div></section><section class="surface"><div class="surface-head"><h3>Estados de las rutas</h3></div><div class="report-bars">${routeStatuses.map((s,i)=>{const x=rows('rutas').filter(t=>t.estado_ruta===s).length;return `<div class="report-line"><span>${s}</span><div class="bar-bg"><div class="bar-fill" style="width:${rows('rutas').length?x/rows('rutas').length*100:0}%;background:${['#20a84a','#f2a74f','#e7676b'][i]}"></div></div><strong>${x}</strong></div>`}).join('')}</div></section></div><div class="surface" style="margin-top:18px"><div class="surface-head"><h3>Actividad administrativa reciente</h3></div><div class="activity-list">${(db.actividad||[]).slice(0,12).map(a=>`<div class="activity-row"><span class="activity-icon">${icon('activity')}</span><div><b>${clean(a.detalle)}</b><small>${clean(a.tipo)} · ${friendlyDate(a.fecha)}</small></div></div>`).join('')||'<div class="empty">Todavía no hay actividad.</div>'}</div></div>`;}
  function profilePage(){const admin=record('usuarios',currentSession?.id_usuario); const session=currentSession||{}; return pageHeader('Perfil y configuración','Información de la cuenta y preferencias.')+`<div class="profile-hero"><span class="big-avatar">${escapeHtml(avatarLetters(session.name||'Administrador'))}</span><div><h3>${clean(session.name|| (admin?userName(admin.id_usuario):'Administrador'))}</h3><p>${clean(session.email||admin?.correo_usuario||'Sin correo')}</p>${pill('ACTIVO')}</div><div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">${button('Cerrar sesión','logout','','','btn-danger','close')}</div></div><div class="surface"><div class="surface-head"><div><h3>Datos del CRM</h3></div></div><div class="utility-row"><div><b>Exportar JSON</b><p>Guarda una copia de los registros en un archivo JSON.</p></div>${button('Exportar JSON','exportJSON','','','btn-light','download')}</div>${isLive()?'':`<div class="utility-row"><div><b>Importar una demostración</b><p>Carga un archivo JSON previamente exportado.</p></div>${button('Importar JSON','importJSON','','','btn-light','upload')}</div><div class="utility-row"><div><b>Restablecer datos de ejemplo</b><p>Recupera los datos iniciales de la demostración.</p></div>${button('Restablecer','reset','','','btn-danger','refresh')}</div>`}</div>`;}
  function render(){
    $('#currentCrumb').textContent=pageLabels[page]||'Dashboard';
    document.querySelectorAll('.nav-btn').forEach(btn=>{const active=btn.dataset.page===page;btn.classList.toggle('active',active);btn.setAttribute('aria-current',active?'page':'false')});
    $('#incidenceCount').textContent=rows('incidentes').filter(i=>i.estado_incidente==='POR RESOLVER').length;
    $('#globalSearch').value=searching;
    let content='';
    switch(page){
      case 'resumen':content=overview();break;
      case 'mapa':content=mapPage();break;
      case 'rutas':content=listPage('rutas','Gestión de rutas','Configura las rutas, asignaciones, horarios y estados.','rutas');break;
      case 'horarios':content=listPage('horarios','Horarios de recolección','Gestiona fechas y franjas horarias vinculadas a las rutas.','horarios');break;
      case 'incidencias':content=listPage('incidentes','Gestión de incidencias','Recibe, consulta y actualiza los reportes de ciudadanos e invitados.','incidencias');break;
      case 'coordenadas':content=listPage('coordenadas','Puntos del recorrido','Administra los puntos y su secuencia en cada ruta.','coordenadas');break;
      case 'usuarios':content=listPage('usuarios','Usuarios del sistema','Administra datos, roles, estado y ubicaciones de las cuentas.','usuarios');break;
      case 'operadores':content=listPage('usuarios','Gestión de operadores','Personal con rol operativo; administra y habilita sus cuentas.','operadores',rows('usuarios').filter(isOperator));break;
      case 'roles':content=listPage('roles','Roles y permisos','Organiza los roles del sistema y su disponibilidad.','roles');break;
      case 'conductores':content=listPage('conductores','Conductores','Gestiona el personal, su estado y sus datos laborales.','conductores');break;
      case 'camiones':content=listPage('camiones','Flota de camiones','Vehículos, matrículas, disponibilidad y mantenimiento.','camiones');break;
      case 'ubicaciones':content=geography();break;
      case 'reportes':content=reportPage();break;
      case 'perfil':content=profilePage();break;
      default:content=overview();
    }
    window.RGR_ROUTE_MAP?.destroy('#rgrCRMMapDashboard');
    window.RGR_ROUTE_MAP?.destroy('#rgrCRMMapFull');
    $('#pageContent').innerHTML=content;
    if(['resumen','mapa'].includes(page))requestAnimationFrame(redrawGeoMaps);
  }
  function navigate(next){page=next;window.location.hash='#/crm/'+(next==='resumen'?'dashboard':next);searching='';filters={};$('#sidebar').classList.remove('open','is-expanded');$('#mobileShade').hidden=true;render();window.scrollTo(0,0);}
  function fieldMarkup(f,row,entity){
    let v=row[f.key];
    if(entity==='horarios'){if(f.key==='__fecha')v=row.__fecha||dateFrom(row);if(f.key==='__inicio')v=row.__inicio||startTime(row);if(f.key==='__fin')v=row.__fin||endTime(row);}
    if(v===null||v===undefined){if(f.key.startsWith('estado_'))v=statuses[entity]?.[0]||'';else if(f.key==='fecha_inicio'||f.key==='fecha_incidente')v=today();else if(f.key==='hora_incidente')v='08:00';else if(f.key==='__fecha')v=today();else if(f.key==='__inicio')v='08:00';else if(f.key==='__fin')v='12:00';else if(f.key==='anio')v=new Date().getFullYear();else v='';}
    const attrs=`name="${f.key}" id="field_${f.key}" ${isLive()&&entity==='usuarios'&&f.key==='correo_usuario'?'readonly title="El correo de Auth se cambia desde el servidor"':''} ${f.required?'required':''} ${f.min!==undefined?`min="${f.min}"`:''} ${f.max!==undefined?`max="${f.max}"`:''} ${f.step?`step="${f.step}"`:''}`;
    let control='';
    if(f.type==='select')control=`<select ${attrs}><option value="" ${!v?'selected':''}>${escapeHtml(f.empty||'Seleccionar...')}</option>${(f.options||[]).map(o=>`<option value="${escapeHtml(o.value)}" ${String(v)===String(o.value)?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
    else if(f.type==='textarea')control=`<textarea ${attrs} rows="3">${escapeHtml(v)}</textarea>`;
    else if(f.type==='file')control=`<input type="file" ${attrs} accept="image/png,image/jpeg,image/webp" />${row.img?`<small>Imagen actual guardada en la demostración. Solo reemplázala si deseas cambiarla.</small>`:''}`;
    else control=`<input type="${f.type}" ${attrs} value="${escapeHtml(v)}" ${f.type==='email'?'autocomplete="off"':''} />`;
    return `<div class="field ${f.wide?'full':''}"><label for="field_${f.key}">${escapeHtml(f.name)}${f.required?' <span class="required">*</span>':''}</label>${control}${f.hint?`<small>${escapeHtml(f.hint)}</small>`:''}</div>`;
  }
  function modalHtml(title,body,footer='',small=false){return `<div class="modal ${small?'small':''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><div><span class="modal-eyebrow">RGR Panamá · CRM</span><h2 id="modalTitle">${escapeHtml(title)}</h2></div><button class="modal-close" data-action="closeModal" aria-label="Cerrar">${icon('close')}</button></div><div class="modal-body">${body}</div><div class="modal-foot">${footer||'<button class="btn btn-light" data-action="closeModal">Cerrar</button>'}</div></div>`;}
  function showModal(html){const root=$('#modalRoot');root.innerHTML=html;root.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>root.querySelector('input:not([type="hidden"]),select,textarea,button')?.focus(),20);}
  function closeModal(){const root=$('#modalRoot');root.hidden=true;root.innerHTML='';document.body.style.overflow='';modalContext=null;}
  function editModal(entity,id){if(id!==null&&id!==undefined&&id!==''&&!ensureManageable(entity,record(entity,id)))return;
    if(entity==='usuarios'&&(id===null||id===undefined||id==='')&&page==='operadores'){}
    if(isLive()&&entity==='usuarios'&&(id===null||id===undefined||id==='')){toast('La creación de cuentas todavía no está disponible en el CRM.','bad');return;}const editing=id!==null&&id!==undefined&&id!=='';const original=editing?record(entity,id):null;if(editing&&!original){toast('Registro no encontrado.','bad');return;}
    const row=original?clone(original):{};
    if(!editing&&entity==='usuarios'&&page==='operadores')row.id_rol=rows('roles').find(r=>/operativ|operador/i.test(r.nombre_rol))?.id_rol||2;
    if(!editing&&entity==='rutas')row.estado_ruta='ACTIVA';
    if(entity==='horarios'&&!editing){row.__fecha=today();row.__inicio='08:00';row.__fin='12:00';}
    const fs=schema(entity,row);
    const title=`${editing?'Editar':'Nuevo registro ·'} ${editing?label(entity,row):names[entity]}`;
    const form=`<form id="recordForm" data-entity="${entity}" data-id="${editing?id:''}"><div class="form-grid">${fs.map(f=>fieldMarkup(f,row,entity)).join('')}</div><button type="submit" id="hiddenSubmit" hidden></button></form>`;
    const foot=`<button class="btn btn-light" data-action="closeModal">Cancelar</button><button type="button" class="btn btn-primary" data-action="submitForm">${icon('check')} Guardar cambios</button>`;
    modalContext={type:'edit',entity,id:editing?Number(id):null};
    showModal(modalHtml(title,form,foot));
  }
  function recordDetails(entity,r){return schema(entity,r).filter(f=>f.type!=='file').map(f=>{const v=r[f.key];let display=v;
      if(entity==='horarios'){display=f.key==='__fecha'?friendlyDate(dateFrom(r)):f.key==='__inicio'?startTime(r):endTime(r);}
      else if(f.key==='id_rol')display=roleName(v);
      else if(f.key==='id_corregimiento'||f.key==='corregimiento_invitado')display=locationName(v);
      else if(f.key==='id_distrito')display=districtName(v);
      else if(f.key==='id_provincia')display=provinceName(v);
      else if(f.key==='id_horario')display=scheduleName(v);
      else if(f.key==='id_ruta')display=routeName(v);
      else if(f.key==='id_conductor')display=driverName(v);
      else if(f.key==='id_camion')display=truckName(v);
      else if(f.key==='id_usuario')display=v?userName(v):'Invitado';
      else if(f.type==='date')display=friendlyDate(v);
      return `<div class="detail"><b>${escapeHtml(f.name)}</b><div>${clean(display)}</div></div>`;
    }).join('');}
  function viewModal(entity,id){const r=record(entity,id);if(!r)return;
    let extra='';if(entity==='rutas'){const points=rows('coordenadas').filter(p=>p.id_ruta===r.id_ruta).sort((a,b)=>a.secuencia-b.secuencia);extra=`<div style="grid-column:1/-1"><h3 style="font-size:13px;color:var(--deep)">Puntos del recorrido (${points.length})</h3><p class="hint">${points.map(p=>`#${p.secuencia}: ${Number(p.latitud).toFixed(5)}, ${Number(p.longitud).toFixed(5)}`).join(' · ')||'Todavía no hay puntos para esta ruta.'}</p><button type="button" class="btn btn-soft btn-sm" data-action="managePoints" data-id="${r.id_ruta}">${icon('map')} Gestionar puntos</button></div>`;}
    if(entity==='incidentes'&&r.img&&String(r.img).startsWith('data:image/'))extra=`<div style="grid-column:1/-1"><h3 style="font-size:12px">Imagen del reporte</h3><img src="${r.img}" alt="Imagen adjunta a la incidencia" style="max-width:100%;max-height:220px;border-radius:10px" /></div>`;
    modalContext={type:'view',entity,id};showModal(modalHtml(`Detalle · ${label(entity,r)}`,`<div class="details-grid">${recordDetails(entity,r)}${extra}</div>`,`<button class="btn btn-light" data-action="closeModal">Cerrar</button><button class="btn btn-primary" data-action="editFromView" data-entity="${entity}" data-id="${id}">${icon('edit')} Editar</button>`));
  }
  function confirmModal(title,message,callback,destructive=false){modalContext={type:'confirm',callback};showModal(modalHtml(title,`<p>${escapeHtml(message)}</p>`,`<button class="btn btn-light" data-action="closeModal">Cancelar</button><button class="btn ${destructive?'btn-danger':'btn-primary'}" data-action="confirm">${icon(destructive?'trash':'check')} Confirmar</button>`,true));}
  function references(entity,r){const id=r[pk[entity]], out=[];const used=(target,key,word)=>{const n=rows(target).filter(x=>Number(x[key])===Number(id)).length;if(n)out.push(`${n} ${word}`);};
    if(entity==='roles')used('usuarios','id_rol','usuarios');
    if(entity==='provincia')used('distritos','id_provincia','distritos');
    if(entity==='distritos')used('corregimientos','id_distrito','corregimientos');
    if(entity==='corregimientos'){used('usuarios','id_corregimiento','usuarios');used('conductores','id_corregimiento','conductores');used('rutas','id_corregimiento','rutas');used('incidentes','corregimiento_invitado','incidencias');}
    if(entity==='usuarios')used('incidentes','id_usuario','incidencias');
    if(entity==='conductores')used('rutas','id_conductor','rutas');
    if(entity==='camiones')used('rutas','id_camion','rutas');
    if(entity==='horarios')used('rutas','id_horario','rutas');
    if(entity==='rutas')used('incidentes','id_ruta','incidencias');
    return out;
  }
  function del(entity,id){const r=record(entity,id);if(!r)return;if(!ensureManageable(entity,r))return;
    if(entity==='usuarios'){
      if(r.estado_usuario==='INACTIVO'){toast('Esta cuenta ya está inactiva.','bad');return;}
      confirmModal('Dar de baja a un usuario',`Se marcará INACTIVO a ${label(entity,r)}. Conservará su historial, pero no podrá acceder al sistema.`,async()=>{
        const ok=await protectedMutation('usuarios','update',{estado_usuario:'INACTIVO'},Number(id),async()=>{
          r.estado_usuario='INACTIVO';logActivity('Baja lógica',`Se desactivó ${label(entity,r)}`);save();render();
        });
        if(ok){if(isLive())await fetchLive();toast('Usuario marcado como INACTIVO.');}
      },true);return;
    }if(isLive()&&entity==='usuarios'){toast('La eliminación de cuentas todavía no está disponible en el CRM.','bad');return;}if(entity==='usuarios'&&Number(id)===Number(currentSession?.id_usuario)){toast('No puedes eliminar la cuenta administradora actual.','bad');return;}const refs=references(entity,r);if(refs.length){toast(`No se puede eliminar: el registro está vinculado a ${refs.join(', ')}.`, 'bad');return;}
    confirmModal(`Eliminar ${label(entity,r)}`,isLive()?'Este registro se eliminará definitivamente. ¿Deseas continuar?':'¿Deseas eliminar este registro?',async()=>{const success=await protectedMutation(entity,'delete',null,Number(id),async()=>{db[entity]=rows(entity).filter(x=>Number(x[pk[entity]])!==Number(id));if(entity==='rutas')db.coordenadas=db.coordenadas.filter(p=>Number(p.id_ruta)!==Number(id));logActivity('Eliminación',`Se eliminó ${label(entity,r)}`);save();render();});if(success){if(isLive())await fetchLive();toast('Registro eliminado.');}},true);
  }
  function quickStatus(entity,id){const r=record(entity,id),key=statusField[entity];if(!r||!key)return;if(!ensureManageable(entity,r))return;const options=(entity==='usuarios'?['ACTIVO','INACTIVO']:statuses[entity])||[];
    if(entity==='usuarios'&&Number(id)===Number(currentSession?.id_usuario)){toast('No puedes modificar el estado de tu propia cuenta.','bad');return;}
    const html=`<div class="field"><label for="newStatus">Nuevo estado</label><select id="newStatus">${options.map(v=>`<option value="${v}" ${r[key]===v?'selected':''}>${v}</option>`).join('')}</select></div>`;
    modalContext={type:'status',entity,id};showModal(modalHtml(`Actualizar estado · ${label(entity,r)}`,html,`<button class="btn btn-light" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="confirmStatus">${icon('check')} Guardar estado</button>`,true));
  }
  function validate(entity,data,editingId){const id=Number(editingId);const existing=rows(entity).filter(r=>Number(r[pk[entity]])!==id);
    const valueDup=(col, val)=> val&&existing.some(r=>String(r[col]||'').trim().toLocaleLowerCase()===String(val).trim().toLocaleLowerCase());
    if(entity==='usuarios'){
      if(Number(data.id_rol)===1)return 'No se pueden asignar permisos de administrador desde el CRM.';
      if(['BLOQUEADO','POR VALIDAR'].includes(data.estado_usuario))return 'Los estados de seguridad solo los actualiza el servidor.';
      if(editingId && !manageableUser(record(entity,editingId)))return 'Esta cuenta requiere recuperación gestionada por el DBA.';
      if(valueDup('correo_usuario',data.correo_usuario))return 'Ya existe un usuario con ese correo.';
      if(valueDup('cedula_usuario',data.cedula_usuario))return 'Ya existe un usuario con esa cédula.';
      if(editingId===Number(currentSession?.id_usuario)){const old=record(entity,editingId);if(old && (Number(data.id_rol)!==Number(old.id_rol)||data.estado_usuario!==old.estado_usuario))return 'No puedes cambiar tu propio rol ni desactivar tu cuenta.';}
      if(data.fecha_fin&&data.fecha_fin<data.fecha_inicio)return 'La fecha de finalización no puede ser anterior a la de inicio.';
    }
    if(entity==='conductores'){
      if(valueDup('cedula_conductor',data.cedula_conductor))return 'La cédula del conductor ya está registrada.';
      if(data.fecha_nac>today())return 'La fecha de nacimiento no puede estar en el futuro.';
      if(data.fecha_fin<data.fecha_inicio)return 'La fecha de finalización debe ser posterior al inicio.';
    }
    if(entity==='roles'&&valueDup('nombre_rol',data.nombre_rol))return 'Ya existe un rol con ese nombre.';
    if(entity==='camiones'&&valueDup('matricula',data.matricula))return 'La matrícula del camión ya está registrada.';
    if(entity==='rutas'){
      if(existing.some(r=>Number(r.id_horario)===data.id_horario))return 'Ese horario ya está vinculado a otra ruta.';
      if(data.estado_ruta==='ACTIVA'){
        if(existing.some(r=>r.estado_ruta==='ACTIVA'&&r.id_conductor===data.id_conductor))return 'Este conductor ya está asignado a una ruta activa.';
        if(existing.some(r=>r.estado_ruta==='ACTIVA'&&r.id_camion===data.id_camion))return 'Este camión ya está asignado a una ruta activa.';
        if(record('conductores',data.id_conductor)?.estado_conductor!=='ACTIVO')return 'El conductor seleccionado debe estar activo.';
        if(record('camiones',data.id_camion)?.estado_camion!=='ACTIVO')return 'El camión seleccionado debe estar activo.';
      }
    }
    if(entity==='conductores'&&data.estado_conductor!=='ACTIVO'&&rows('rutas').some(r=>r.estado_ruta==='ACTIVA'&&r.id_conductor===id))return 'Primero pausa o reasigna la ruta activa de este conductor.';
    if(entity==='camiones'&&data.estado_camion!=='ACTIVO'&&rows('rutas').some(r=>r.estado_ruta==='ACTIVA'&&r.id_camion===id))return 'Primero pausa o reasigna la ruta activa que utiliza este camión.';
    if(entity==='horarios'){
      if(!Number.isFinite(data.dia)||!Number.isFinite(data.mes)||!Number.isFinite(data.anio))return 'La fecha no es válida.';
      if((data.hora*60+data.minutos)>=(data.hora_fin*60+data.minutos_fin))return 'La hora de finalización debe ser posterior a la de inicio.';
    }
    if(entity==='coordenadas'){
      if(existing.some(r=>r.id_ruta===data.id_ruta&&r.secuencia===data.secuencia))return 'Ya existe ese número de secuencia en la ruta.';
      if(Math.abs(data.latitud)>90||Math.abs(data.longitud)>180)return 'Coordenadas fuera del rango permitido.';
    }
    if(['provincia','distritos','corregimientos'].includes(entity)){
      const unique={provincia:['nombre_provincia'],distritos:['nombre_distrito','id_provincia'],corregimientos:['nombre_corregimiento','id_distrito']}[entity];
      if(existing.some(r=>unique.every(k=>String(r[k]||'').toLowerCase()===String(data[k]||'').toLowerCase())))return 'Ya existe esta ubicación en el catálogo.';
    }
    if(entity==='incidentes'&&!data.id_usuario&&!data.correo_inv)return 'Selecciona un ciudadano o escribe el correo del invitado.';
    if(entity==='roles'&&data.estado_rol==='INACTIVO'&&rows('usuarios').some(u=>u.id_rol===id&&u.estado_usuario==='ACTIVO'))return 'No puedes desactivar un rol que tiene usuarios activos.';
    if(['provincia','distritos','corregimientos'].includes(entity)){
      const status=statusField[entity];const current=record(entity,id);
      if(current&&data[status]==='INACTIVO'&&references(entity,current).length)return 'Primero revisa los registros vinculados a esta ubicación.';
    }
    return '';
  }
  const convert = (val,f) => {if(f.type==='number')return Number(val);if(f.type==='select'&&f.key.startsWith('id_')&&val!=='')return Number(val);if(f.key==='corregimiento_invitado'&&val!=='')return Number(val);if(val==='')return ['id_rol','id_corregimiento','id_ruta','id_horario','id_usuario','id_conductor','id_camion','id_distrito','id_provincia','corregimiento_invitado'].includes(f.key)?null:'';return typeof val==='string'?val.trim():val;};
  async function saveForm(e){e.preventDefault();if(e.target.dataset.saving==='yes')return;const form=e.target;const entity=form.dataset.entity;const editing=form.dataset.id!=='';const id=editing?Number(form.dataset.id):null;const old=editing?record(entity,id):{};if(editing&&!old)return;if(editing&&!ensureManageable(entity,old))return;
    const fs=schema(entity,old||{});const data={...(old||{})};
    for(const f of fs){if(f.type==='file')continue;const control=form.elements.namedItem(f.key);if(!control)continue;data[f.key]=convert(control.value,f);if(f.required&&(data[f.key]===null||data[f.key]===undefined||data[f.key]==='')){toast(`Completa el campo ${f.name}.`,'bad');control.focus();return;}}
    if(entity==='horarios'){
      const date=data.__fecha||today();const [y,m,d]=date.split('-').map(Number);const [h,mi]=(data.__inicio||'').split(':').map(Number);const [hf,mf]=(data.__fin||'').split(':').map(Number);
      Object.assign(data,{dia:d,mes:m,anio:y,hora:h,minutos:mi,hora_fin:hf,minutos_fin:mf});delete data.__fecha;delete data.__inicio;delete data.__fin;
    }
    if(entity==='incidentes'&&data.id_usuario){data.correo_inv='';data.corregimiento_invitado=null;}
    if(entity==='camiones')data.matricula=String(data.matricula||'').toUpperCase();
    const error=validate(entity,data,id);if(error){toast(error,'bad');return;}
    if(entity==='incidentes'){
      const file=form.elements.namedItem('img')?.files?.[0];
      if(file){if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>800*1024){toast('La imagen debe ser PNG, JPEG o WEBP y pesar menos de 800 KB.','bad');return;}
        data.img=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}).catch(()=>{toast('No se pudo leer la imagen.','bad');return data.img||'';});
      }
    }
    if(isLive()){
      form.dataset.saving='yes';const submitButton=document.querySelector('[data-action="submitForm"]');if(submitButton)submitButton.disabled=true;
      try{
        const toSave={...data,__previous:editing?old:{}};
        const ok=await protectedMutation(entity,editing?'update':'insert',toSave,id);
        if(ok){closeModal();await fetchLive();toast(editing?'Cambios guardados.':'Registro creado.');}
      }catch(err){toast('Error de Supabase: '+err.message,'bad');}
      finally{form.dataset.saving='no';if(submitButton)submitButton.disabled=false;}
      return;
    }
    const accepted=await protectedMutation(entity,editing?'update':'insert',data,id,async()=>{
      if(!editing)data[pk[entity]]=Math.max(0,...rows(entity).map(r=>Number(r[pk[entity]])||0))+1;
      if(editing)db[entity]=rows(entity).map(r=>Number(r[pk[entity]])===id?data:r);else db[entity].push(data);
      logActivity(names[entity],`${editing?'Actualización':'Nuevo registro'}: ${label(entity,data)}`);
      save();
    });
    if(accepted){closeModal();render();toast(editing?'Cambios guardados.':'Registro creado.');}
  }
  async function setStatus(){if(modalContext?.type!=='status')return;const {entity,id}=modalContext;const old=record(entity,id),key=statusField[entity],next=$('#newStatus').value;if(!ensureManageable(entity,old))return;const changed={...old,[key]:next};const err=validate(entity,changed,id);if(err){toast(err,'bad');return;}
    const success=await protectedMutation(entity,'update',{...changed,__previous:old},Number(id),async()=>{
      Object.assign(old,changed);logActivity(names[entity],`Cambio de estado: ${label(entity,old)} → ${next}`);save();});
    if(success){closeModal();if(isLive())await fetchLive();else render();toast('Estado actualizado.');}}
  function download(text,type,filename){const blob=new Blob([text],{type});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),5000);}
  function exportCSV(entity){const safeRows=(entity==='usuarios'?rows(entity).filter(u=>!isAdminAccount(u)):rows(entity));const headers=Object.keys(safeRows[0]||{[pk[entity]]:''});const csv=[headers, ...safeRows.map(r=>headers.map(h=>r[h]??''))].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');download('\uFEFF'+csv,'text/csv;charset=utf-8',`rgr_${entity}_demo.csv`);toast('CSV descargado.');}
  const exportJSON=()=>{const snapshot=clone(db);snapshot.usuarios=(snapshot.usuarios||[]).filter(u=>!isAdminAccount(u));download(JSON.stringify(snapshot,null,2),'application/json','rgr_crm_respaldo_demo.json');toast('Respaldo JSON descargado.');};
  function reset(){if(isLive()){toast('Esta acción solo existe en la demo.','bad');return;}confirmModal('Restablecer datos de ejemplo','Se restablecerán todos los datos de la demostración. ¿Continuar?',async()=>{const ok=await protectedMutation('demo','reset',null,null,async()=>{db=clone(seed);save();});if(ok){closeModal();navigate('resumen');toast('Datos de ejemplo restaurados.');}},true);}
  function importJSON(){if(isLive()){toast('No puedes importar un JSON en modo Supabase.','bad');return;}const input=$('#importFile');input.value='';input.click();}
  document.addEventListener('click',e=>{
    if(securityState && !e.target.closest('#securityScreen')){e.preventDefault();e.stopPropagation();return;}
    if(currentMode&&!securityState&&Date.now()-lastActivity>=INACTIVITY_MS){e.preventDefault();e.stopPropagation();enterSecurity('idle_locked');return;}
    const mapPick=e.target.closest('[data-map-id]');if(mapPick){selectedMapRoute=String(mapPick.dataset.mapId);render();return;}
    const nav=e.target.closest('[data-page]');if(nav){const fromSidebar=Boolean(nav.closest('#sidebar'));navigate(nav.dataset.page);if(fromSidebar && window.matchMedia('(min-width:981px)').matches)$('#sidebar').classList.add('hover-suspended');return;}
    const tab=e.target.closest('[data-geo]');if(tab){geoTab=tab.dataset.geo;searching='';filters={};render();return;}
    const action=e.target.closest('[data-action]');if(!action)return;
    const {action:act,entity,id}=action.dataset;
    switch(act){
      case 'refreshMap':if(isLive())fetchLive();else render();break;
      case 'new':editModal(entity,null);break;
      case 'edit':editModal(entity,id);break;
      case 'view':viewModal(entity,id);break;
      case 'delete':del(entity,id);break;
      case 'status':quickStatus(entity,id);break;
      case 'closeModal':closeModal();break;
      case 'submitForm':$('#recordForm')?.requestSubmit();break;
      case 'editFromView':closeModal();editModal(entity,id);break;
      case 'confirm':{const callback=modalContext?.callback;if(typeof callback==='function'){closeModal();callback();}break;}
      case 'confirmStatus':setStatus();break;
      case 'exportCSV':exportCSV(entity);break;
      case 'exportJSON':exportJSON();break;
      case 'importJSON':importJSON();break;
      case 'reset':reset();break;
      case 'logout':exitCRM();break;
      case 'managePoints':closeModal();navigate('coordenadas');searching=String(id);$('#globalSearch').value=searching;render();break;
    }
  });
  document.addEventListener('submit',e=>{if(e.target.id==='recordForm')saveForm(e);});
  document.addEventListener('input',e=>{
    if(['globalSearch','tableSearch'].includes(e.target.id)){
      searching=e.target.value.toLowerCase().trim();const fromTable=e.target.id==='tableSearch';const position=e.target.selectionStart;render();if(fromTable){const input=$('#tableSearch');if(input){input.focus();try{input.setSelectionRange(position,position);}catch(_){}}}
    }
  });
  document.addEventListener('change',e=>{if(e.target.id==='statusFilter'){filters[page]=e.target.value;render();}});
  $('#importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){toast('El JSON supera 5 MB.','bad');return;}try{const incoming=JSON.parse(await file.text());if(!validDB(incoming))throw Error('Formato incompatible.');confirmModal('Importar datos','Se reemplazarán los datos locales actuales. ¿Continuar?',async()=>{const ok=await protectedMutation('demo','import',null,null,async()=>{db=clone(incoming);db.actividad ||= [];save();});if(ok){navigate('resumen');toast('Demostración importada.');}});}catch(err){toast('No se pudo importar el JSON: '+err.message,'bad');}});
  // El menú se abre al pasar el mouse y se cierra al elegir una vista.
  // hover-suspended evita que vuelva a abrirse inmediatamente si el cursor aún
  // permanece sobre la columna de iconos después del clic.
  const sidebar = $('#sidebar');
  const desktopSidebar = window.matchMedia('(min-width:981px)');
  sidebar.querySelectorAll('.nav-btn').forEach(btn => {
    const label=btn.querySelector('span')?.textContent?.trim();
    if(label){btn.setAttribute('aria-label',label);btn.title=label;}
  });
  sidebar.addEventListener('mouseenter',()=>{
    if(desktopSidebar.matches && !sidebar.classList.contains('hover-suspended'))
      sidebar.classList.add('is-expanded');
  });
  sidebar.addEventListener('mouseleave',()=>{
    sidebar.classList.remove('is-expanded','hover-suspended');
  });
  sidebar.addEventListener('focusin',()=>{
    if(desktopSidebar.matches && !sidebar.classList.contains('hover-suspended'))
      sidebar.classList.add('is-expanded');
  });
  sidebar.addEventListener('focusout',e=>{
    if(desktopSidebar.matches && !sidebar.contains(e.relatedTarget) && !sidebar.matches(':hover'))
      sidebar.classList.remove('is-expanded');
  });
  desktopSidebar.addEventListener('change',()=>{
    sidebar.classList.remove('is-expanded','hover-suspended','open');
    $('#mobileShade').hidden=true;
  });
  $('#profileBtn').addEventListener('click',()=>navigate('perfil'));
  $('#logoutBtn').addEventListener('click',exitCRM);
  // Bloqueo por inactividad: recarga, cambio de pestaña y periodos sin interacción.
  ['pointerdown','keydown','wheel','touchstart'].forEach(event=>document.addEventListener(event,markUserActivity,{passive:true}));
  let lastPointerUpdate=0;
  document.addEventListener('pointermove',()=>{if(Date.now()-lastPointerUpdate>5000){lastPointerUpdate=Date.now();markUserActivity();}},{passive:true});
  window.addEventListener('focus',()=>{if(currentMode&&!securityState&&Date.now()-lastActivity>=INACTIVITY_MS)enterSecurity('idle_locked');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentMode&&!securityState&&Date.now()-lastActivity>=INACTIVITY_MS)enterSecurity('idle_locked');});
  setInterval(()=>{if(currentMode&&!securityState&&!$('#app').hidden&&Date.now()-lastActivity>=INACTIVITY_MS)enterSecurity('idle_locked');},1000);
  $('#securityPromptForm').addEventListener('invalid',()=>{},true);
  $('#securityScreen').addEventListener('click',async e=>{
    if(e.target.closest('#securityContinue')&&securityState==='unlock_success'){showApp();return;}
    if(e.target.closest('#securityExit')){await exitCRM();return;}
    if(e.target.closest('#checkSecurityStatus')){await refreshSecurity();return;}
    if(e.target.closest('#demoResetSecurity')&&currentMode==='demo'){demoSecurityWrite({failures:0});securityState='idle_locked';renderSecurity();return;}
    if(e.target.closest('#sendSecurityOTP')&&isLive()){
      try{await REMOTE.otpSend();otpSent=true;renderSecurity('Código enviado al correo verificado.');}
      catch(err){renderSecurity(err.message);}return;
    }
  });
  $('#securityScreen').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.target;
    if(form.id==='securityUnlockForm'){const value=$('#securityUnlockPassword').value;$('#securityUnlockPassword').value='';await unlockSecurity(value);}
    if(form.id==='securityOTPForm'){
      const code=$('#securityOTPCode').value.trim();$('#securityOTPCode').value='';
      try{const result=await REMOTE.otpVerify(code);if(result.ok){securityState='recovery_password';renderSecurity();}else renderSecurity('Código no válido.');}
      catch(err){if(err.state==='blocked')enterSecurity('blocked');else renderSecurity(err.message);}
    }
    if(form.id==='securityRecoveryForm'){
      const password=$('#securityRecoveryPassword').value;$('#securityRecoveryPassword').value='';
      try{securityState='unlock_checking';renderSecurity();await REMOTE.finishRecovery(password);await fetchLive();showUnlockConfirmation();}
      catch(err){if(err.state==='blocked')enterSecurity('blocked');else{securityState='recovery_password';renderSecurity(err.message);}}
    }
  });
  $('#fillDemoLogin').addEventListener('click',openDemo);
  $('#loginForm').addEventListener('submit',e=>{e.preventDefault();attemptLogin($('#loginEmail').value,$('#loginPassword').value);});
  $('#mobileMenu').addEventListener('click',()=>{$('#sidebar').classList.toggle('open');$('#mobileShade').hidden=!$('#sidebar').classList.contains('open');});
  $('#mobileShade').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#mobileShade').hidden=true;});
  $('#modalRoot').addEventListener('click',e=>{if(e.target.id==='modalRoot')closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modalRoot').hidden)closeModal();});
  showLogin();restoreRemote();
})();
