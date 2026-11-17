/* RGR Panamá · Mapa compartido con simulación visual de GPS.
   Recorridos de public.coordenadas (orden secuencia). Los camiones son simulados,
   no datos de GPS en tiempo real. Cada recorrido completo dura 90 segundos. */
(()=>{
  'use strict';
  const DEFAULT_STYLE='https://tiles.openfreemap.org/styles/liberty';
  const STREET_STYLE='mapbox://styles/mapbox/streets-v12';
  const DURATION=90_000;
  const FRAME_INTERVAL=50;
  const instances=new Map();
  const simulations=new Map();
  const n=x=>Number(x);
  const safeCoord=p=>{
    const lat=n(p.latitud),lng=n(p.longitud);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?[lng,lat]:null;
  };
  function normalize(routes,points){
    const byRoute=new Map();
    (points||[]).forEach(p=>{
      const id=String(p.id_ruta??'');if(!id)return;
      if(!byRoute.has(id))byRoute.set(id,[]);
      byRoute.get(id).push(p);
    });
    return (routes||[]).map(route=>{
      const id=String(route.id_ruta??'');
      const pts=(byRoute.get(id)||[]).slice().sort((a,b)=>n(a.secuencia)-n(b.secuencia));
      const clean=pts.map(p=>({coord:safeCoord(p),p})).filter(x=>x.coord);
      return {id,route,coords:clean.map(x=>x.coord),points:clean.map(x=>x.p)};
    }).filter(r=>r.coords.length);
  }
  const collection=features=>({type:'FeatureCollection',features});
  const feature=(type,coords,properties)=>({type:'Feature',geometry:{type,coordinates:coords},properties});
  const msg=(el,text)=>{const b=document.createElement('div');b.className='rgr-map-message';b.textContent=text;el.appendChild(b);return b;};

  // Distancia aproximada sobre la superficie para repartir los 90 s según longitud
  // y no por cantidad de puntos; no consulta un servicio de enrutamiento.
  function distance(a,b){
    const lat1=a[1]*Math.PI/180,lat2=b[1]*Math.PI/180;
    const dl=(b[0]-a[0])*Math.PI/180,da=lat2-lat1;
    const s=Math.sin(da/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dl/2)**2;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(s)));
  }
  function prepareRoute(route){
    const segments=[];let total=0;
    for(let i=1;i<route.coords.length;i++){
      const from=route.coords[i-1],to=route.coords[i],len=distance(from,to);
      if(len<0.05)continue;
      const lat=(from[1]+to[1])*Math.PI/360;
      const dx=(to[0]-from[0])*Math.cos(lat),dy=to[1]-from[1];
      const heading=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
      segments.push({from,to,begin:total,len,heading});total+=len;
    }
    return {...route,segments,total};
  }
  function positionAt(route,progress){
    if(!route.segments.length)return {coord:route.coords[0],heading:0};
    const goal=Math.max(0,Math.min(1,progress))*route.total;
    const part=route.segments.find(s=>goal<=s.begin+s.len)||route.segments[route.segments.length-1];
    const f=Math.min(1,Math.max(0,(goal-part.begin)/part.len));
    return {coord:[part.from[0]+(part.to[0]-part.from[0])*f,
                   part.from[1]+(part.to[1]-part.from[1])*f],heading:part.heading};
  }
  function truckIcon(){
    const canvas=document.createElement('canvas');canvas.width=88;canvas.height=88;
    const c=canvas.getContext('2d');
    // Fondo circular blanco, sombra suave y silueta de camión vista desde arriba.
    c.shadowColor='rgba(13,56,32,.34)';c.shadowBlur=9;c.shadowOffsetY=4;
    c.fillStyle='#fff';c.beginPath();c.arc(44,44,35,0,Math.PI*2);c.fill();
    c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
    c.strokeStyle='#b7e3c3';c.lineWidth=2;c.stroke();
    c.fillStyle='#165b35';c.beginPath();c.roundRect(26,20,36,49,8);c.fill();
    c.fillStyle='#20a84a';c.beginPath();c.roundRect(29,33,30,31,5);c.fill();
    c.fillStyle='#c7f4d5';c.beginPath();c.roundRect(31,23,26,11,4);c.fill();
    c.fillStyle='#12482a';c.fillRect(21,36,5,10);c.fillRect(62,36,5,10);
    c.fillRect(21,55,5,9);c.fillRect(62,55,5,9);
    c.fillStyle='#fff5b5';c.fillRect(29,20,7,3);c.fillRect(52,20,7,3);
    c.strokeStyle='rgba(255,255,255,.75)';c.lineWidth=2;c.beginPath();c.moveTo(36,42);c.lineTo(52,42);c.stroke();
    return {width:canvas.width,height:canvas.height,data:new Uint8Array(c.getImageData(0,0,88,88).data)};
  }
  const format=ms=>{const seconds=Math.min(90,Math.max(0,Math.floor(ms/1000)));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
  function makeControls(host,compact,routeCount){
    const panel=document.createElement('div');panel.className='rgr-gps-panel'+(compact?' compact':'');
    panel.setAttribute('aria-label','Controles de la simulación GPS');
    const label=document.createElement('div');label.className='rgr-gps-heading';
    const badge=document.createElement('span');badge.className='rgr-gps-badge';badge.textContent='GPS SIMULADO';
    const count=document.createElement('span');count.className='rgr-gps-count';count.textContent=`${routeCount} ${routeCount===1?'camión':'camiones'}`;
    label.append(badge,count);
    const controls=document.createElement('div');controls.className='rgr-gps-controls';
    const clock=document.createElement('span');clock.className='rgr-gps-timer';clock.textContent='00:00 / 01:30';
    const pause=document.createElement('button');pause.type='button';pause.className='rgr-gps-button';pause.textContent='Pausar';pause.title='Pausar simulación';
    const restart=document.createElement('button');restart.type='button';restart.className='rgr-gps-button secondary';restart.textContent='↺';restart.title='Reiniciar simulación';restart.setAttribute('aria-label','Reiniciar simulación');
    controls.append(clock,pause,restart);
    const progress=document.createElement('div');progress.className='rgr-gps-progress';progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Progreso del recorrido');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow','0');
    const bar=document.createElement('div');bar.className='rgr-gps-progress-fill';progress.appendChild(bar);
    panel.append(label,controls,progress);host.appendChild(panel);
    return {panel,clock,pause,restart,progress,bar};
  }
  function startSimulation(el,map,all,picked,compact,lib){
    const routes=all.map(prepareRoute), moving=routes.filter(r=>r.segments.length>0);
    if(!routes.length)return;
    const controls=makeControls(el,compact,routes.length);
    let elapsed=0,playedAt=performance.now(),paused=false,frame=null,lastFrame=-Infinity,hiddenAt=null,disposed=false;
    const getElapsed=now=>paused?elapsed:elapsed+Math.max(0,now-playedAt);
    const showTime=ms=>{
      const t=ms%DURATION;
      controls.clock.textContent=`${format(t)} / 01:30`;
      const percent=Math.round(t/DURATION*100);
      controls.bar.style.width=`${percent}%`;
      controls.progress.setAttribute('aria-valuenow',String(percent));
    };
    function update(ms){
      if(!map.getSource('rgr-vehicles'))return;
      const progress=(ms%DURATION)/DURATION;
      const features=routes.map(r=>{
        const pos=positionAt(r,progress);
        return feature('Point',pos.coord,{
          id:r.id,heading:pos.heading,chosen:!!(picked&&r.id===picked.id),
          title:String(r.route?.barrio||r.route?.nombre_corregimiento||`Ruta #${r.id}`),
          moving:r.segments.length>0
        });
      });
      map.getSource('rgr-vehicles').setData(collection(features));
      showTime(ms);
    }
    function tick(now){
      if(disposed||!el.isConnected||instances.get(el)!==map){stop();return;}
      if(!paused&&document.visibilityState!=='hidden'&&now-lastFrame>=FRAME_INTERVAL){
        lastFrame=now;update(getElapsed(now));
      }
      frame=requestAnimationFrame(tick);
    }
    function onVisibility(){
      if(document.visibilityState==='hidden')hiddenAt=performance.now();
      else if(hiddenAt!==null){if(!paused)playedAt+=performance.now()-hiddenAt;hiddenAt=null;}
    }
    function stop(){if(disposed)return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',onVisibility);controls.panel.remove();}
    controls.pause.addEventListener('click',()=>{
      const now=performance.now();
      if(!paused){elapsed=getElapsed(now);paused=true;controls.pause.textContent='Reanudar';controls.pause.title='Reanudar simulación';}
      else{playedAt=now;paused=false;controls.pause.textContent='Pausar';controls.pause.title='Pausar simulación';}
      update(getElapsed(now));
    });
    controls.restart.addEventListener('click',()=>{elapsed=0;playedAt=performance.now();paused=false;controls.pause.textContent='Pausar';controls.pause.title='Pausar simulación';update(0);});
    document.addEventListener('visibilitychange',onVisibility);
    // Se empieza en el primer punto al abrir cada mapa y no se consulta GPS real.
    update(0);
    frame=requestAnimationFrame(tick);
    simulations.set(el,{stop});
    // Clic sobre un vehículo: identificador de la ruta, sin afirmar posición real.
    map.on('click','rgr-gps-trucks',e=>{
      const f=e.features?.[0];if(!f)return;
      const id=String(f.properties?.id||'');
      const name=routes.find(r=>r.id===id)?.route?.barrio||`Ruta #${id}`;
      new lib.Popup({offset:20}).setLngLat(e.lngLat)
        .setText(`Camión simulado · ${name} · Recorrido de 1:30`).addTo(map);
    });
    map.on('mouseenter','rgr-gps-trucks',()=>{map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave','rgr-gps-trucks',()=>{map.getCanvas().style.cursor='';});
  }
  function cleanup(el){
    const sim=simulations.get(el);if(sim){sim.stop();simulations.delete(el);}
    const map=instances.get(el);if(map){try{map.remove();}catch(_){}instances.delete(el);}
  }
  function destroy(target){
    const el=typeof target==='string'?document.querySelector(target):target;
    if(el)cleanup(el);
    for(const oldEl of Array.from(instances.keys()))if(!oldEl.isConnected)cleanup(oldEl);
  }
  function mount(options){
    const el=typeof options.container==='string'?document.querySelector(options.container):options.container;
    if(!el)return null;
    destroy(el);el.textContent='';
    const all=normalize(options.routes,options.points);
    const desired=String(options.selectedId??'');
    const picked=all.find(x=>x.id===desired)||all[0]||null;
    if(!all.length){
      msg(el,options.permissionError?'No se pudieron consultar las coordenadas. Revisa los permisos RLS de Supabase.':'Todavía no hay coordenadas para estas rutas.');
      return null;
    }
    const token=String(window.RGR_MAP_CONFIG?.mapboxPublicToken||'').trim();
    const withMapbox=token.startsWith('pk.');
    const lib=withMapbox?window.mapboxgl:window.maplibregl;
    if(!lib){msg(el,'No se pudo cargar el mapa de calles. Revisa tu conexión.');return null;}
    if(withMapbox)lib.accessToken=token;
    let map;
    try{
      map=new lib.Map({container:el,style:withMapbox?STREET_STYLE:DEFAULT_STYLE,
        center:picked.coords[0],zoom:12,attributionControl:true});
      instances.set(el,map);
      map.addControl(new lib.NavigationControl({showCompass:true}),'top-right');
    }catch(err){msg(el,'No fue posible iniciar el mapa.');return null;}
    map.on('load',()=>{
      if(instances.get(el)!==map||!el.isConnected)return;
      const lines=all.filter(r=>r.coords.length>=2).map(r=>feature('LineString',r.coords,{id:r.id,chosen:!!(picked&&r.id===picked.id)}));
      const endpoints=picked?[
        feature('Point',picked.coords[0],{type:'inicio',name:'Inicio',route:picked.id}),
        ...(picked.coords.length>1?[feature('Point',picked.coords[picked.coords.length-1],{type:'fin',name:'Fin',route:picked.id})]:[])
      ]:[];
      map.addSource('rgr-routes',{type:'geojson',data:collection(lines)});
      map.addSource('rgr-ends',{type:'geojson',data:collection(endpoints)});
      map.addLayer({id:'rgr-other',type:'line',source:'rgr-routes',
        filter:['==',['get','chosen'],false],layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#829e95','line-width':3,'line-opacity':0.65}});
      map.addLayer({id:'rgr-selected-halo',type:'line',source:'rgr-routes',
        filter:['==',['get','chosen'],true],layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#fff','line-width':9,'line-opacity':0.95}});
      map.addLayer({id:'rgr-selected-line',type:'line',source:'rgr-routes',
        filter:['==',['get','chosen'],true],layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#20A84A','line-width':5.5,'line-opacity':0.96}});
      map.addLayer({id:'rgr-point-halo',type:'circle',source:'rgr-ends',
        paint:{'circle-color':['match',['get','type'],'fin','#e65858','#20A84A'],
          'circle-radius':10,'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
      map.addSource('rgr-vehicles',{type:'geojson',data:collection([])});
      map.addImage('rgr-gps-truck',truckIcon(),{pixelRatio:2});
      map.addLayer({id:'rgr-gps-ring',type:'circle',source:'rgr-vehicles',
        paint:{'circle-color':['case',['get','chosen'],'#b2f3c7','#e4f6e9'],
          'circle-opacity':0.65,'circle-radius':25,'circle-blur':0.4}});
      map.addLayer({id:'rgr-gps-trucks',type:'symbol',source:'rgr-vehicles',
        layout:{'icon-image':'rgr-gps-truck','icon-size':1.0,
          'icon-rotate':['get','heading'],'icon-rotation-alignment':'map',
          'icon-pitch-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true}});
      map.on('click','rgr-point-halo',e=>{
        const feat=e.features?.[0];if(!feat)return;
        const popup=new lib.Popup({offset:12}).setLngLat(e.lngLat)
          .setText(feat.properties?.name==='Fin'?'Fin del recorrido':'Inicio del recorrido');popup.addTo(map);
      });
      map.on('mouseenter','rgr-point-halo',()=>{map.getCanvas().style.cursor='pointer';});
      map.on('mouseleave','rgr-point-halo',()=>{map.getCanvas().style.cursor='';});
      const coords=options.showAll?all.flatMap(x=>x.coords):(picked?.coords||[]);
      if(coords.length>1){
        const bounds=new lib.LngLatBounds(coords[0],coords[0]);coords.forEach(c=>bounds.extend(c));
        map.fitBounds(bounds,{padding:options.compact?30:60,maxZoom:15,duration:0});
      }else if(coords.length===1)map.jumpTo({center:coords[0],zoom:14});
      map.resize();
      startSimulation(el,map,all,picked,!!options.compact,lib);
    });
    map.on('error',e=>{const message=String(e?.error?.message||'');
      if(/401|403|Unauthorized|access token|Forbidden/i.test(message)&&!el.querySelector('.rgr-map-message'))
        msg(el,'El proveedor de mapas rechazó el acceso. Revisa el token público o utiliza el mapa de calles libre.');
    });
    return map;
  }
  window.RGR_ROUTE_MAP=Object.freeze({normalize,mount,destroy,simulationDurationMs:DURATION,positionAt,prepareRoute});
})();
