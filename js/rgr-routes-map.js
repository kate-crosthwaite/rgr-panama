/* RGR Panamá · Mapa de calles compartido CRM / ERP.
   Los trazados proceden exclusivamente de public.coordenadas, agrupados por id_ruta
   y ordenados por secuencia; no se usan datos GPS ni se calculan calles nuevas. */
(()=>{
  'use strict';
  const DEFAULT_STYLE='https://tiles.openfreemap.org/styles/liberty';
  const STREET_STYLE='mapbox://styles/mapbox/streets-v12';
  const instances=new Map();
  const n=x=>Number(x);
  const safeCoord=p=>{
    const lat=n(p.latitud),lng=n(p.longitud);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?[lng,lat]:null;
  };
  function normalize(routes,points){
    const byRoute=new Map();
    (points||[]).forEach(p=>{const id=String(p.id_ruta??'');if(!id)return;
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
  function destroy(target){
    const el=typeof target==='string'?document.querySelector(target):target;
    if(!el)return;
    const map=instances.get(el);if(map){try{map.remove();}catch(_){}instances.delete(el);}
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
        filter:['==',['get','chosen'],false],
        layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#829e95','line-width':3,'line-opacity':0.65}});
      map.addLayer({id:'rgr-selected-halo',type:'line',source:'rgr-routes',
        filter:['==',['get','chosen'],true],
        layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':9,'line-opacity':0.95}});
      map.addLayer({id:'rgr-selected-line',type:'line',source:'rgr-routes',
        filter:['==',['get','chosen'],true],
        layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#20A84A','line-width':5.5,'line-opacity':0.96}});
      map.addLayer({id:'rgr-point-halo',type:'circle',source:'rgr-ends',
        paint:{'circle-color':['match',['get','type'],'fin','#e65858','#20A84A'],
          'circle-radius':10,'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
      map.on('click','rgr-point-halo',e=>{
        const feat=e.features?.[0];if(!feat)return;
        const popup=new lib.Popup({offset:12}).setLngLat(e.lngLat).setText(feat.properties?.name==='Fin'?'Fin del recorrido':'Inicio del recorrido');
        popup.addTo(map);
      });
      map.on('mouseenter','rgr-point-halo',()=>{map.getCanvas().style.cursor='pointer'});
      map.on('mouseleave','rgr-point-halo',()=>{map.getCanvas().style.cursor=''});
      const coords=options.showAll?all.flatMap(x=>x.coords):(picked?.coords||[]);
      if(coords.length>1){
        const bounds=new lib.LngLatBounds(coords[0],coords[0]);coords.forEach(c=>bounds.extend(c));
        map.fitBounds(bounds,{padding:options.compact?30:60,maxZoom:15,duration:0});
      }else if(coords.length===1)map.jumpTo({center:coords[0],zoom:14});
      map.resize();
    });
    map.on('error',e=>{const message=String(e?.error?.message||'');
      if(/401|403|Unauthorized|access token|Forbidden/i.test(message)&&!el.querySelector('.rgr-map-message'))msg(el,'El proveedor de mapas rechazó el acceso. Revisa el token público o utiliza el mapa de calles libre.');
    });
    return map;
  }
  window.RGR_ROUTE_MAP=Object.freeze({normalize,mount,destroy});
})();
