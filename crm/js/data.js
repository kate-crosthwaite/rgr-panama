/* Muestra ficticia y coherente con los campos de lib/models y lib/services del ZIP Flutter. */
window.RGR_SEED = {
  roles: [
    {id_rol:1,nombre_rol:'administrador',estado_rol:'ACTIVO'},
    {id_rol:2,nombre_rol:'operativo',estado_rol:'ACTIVO'},
    {id_rol:3,nombre_rol:'ciudadano',estado_rol:'ACTIVO'}
  ],
  provincia: [
    {id_provincia:1,nombre_provincia:'Panamá',estado_provincia:'ACTIVO'},
    {id_provincia:2,nombre_provincia:'Panamá Oeste',estado_provincia:'ACTIVO'}
  ],
  distritos: [
    {id_distrito:1,id_provincia:1,nombre_distrito:'Panamá',estado_distrito:'ACTIVO'},
    {id_distrito:2,id_provincia:1,nombre_distrito:'San Miguelito',estado_distrito:'ACTIVO'},
    {id_distrito:3,id_provincia:2,nombre_distrito:'Arraiján',estado_distrito:'ACTIVO'}
  ],
  corregimientos: [
    {id_corregimiento:1,id_distrito:1,nombre_corregimiento:'Río Abajo',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:2,id_distrito:1,nombre_corregimiento:'Bella Vista',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:3,id_distrito:1,nombre_corregimiento:'Parque Lefevre',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:4,id_distrito:1,nombre_corregimiento:'Juan Díaz',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:5,id_distrito:1,nombre_corregimiento:'San Francisco',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:6,id_distrito:2,nombre_corregimiento:'Amelia Denis de Icaza',estado_corregimiento:'ACTIVO'},
    {id_corregimiento:7,id_distrito:3,nombre_corregimiento:'Vista Alegre',estado_corregimiento:'INACTIVO'}
  ],
  usuarios: [
    {id_usuario:1,nombre_usuario:'Administradora',apellido_usuario:'RGR',correo_usuario:'admin@ejemplo.rgr',cedula_usuario:'8-000-001',telefono_usuario:'6000-1001',fecha_inicio:'2025-01-03',fecha_fin:'',id_rol:1,id_corregimiento:1,estado_usuario:'ACTIVO'},
    {id_usuario:2,nombre_usuario:'Ana',apellido_usuario:'Martínez',correo_usuario:'ana.oper@ejemplo.rgr',cedula_usuario:'8-000-002',telefono_usuario:'6000-1002',fecha_inicio:'2025-08-01',fecha_fin:'',id_rol:2,id_corregimiento:2,estado_usuario:'ACTIVO'},
    {id_usuario:3,nombre_usuario:'Luis',apellido_usuario:'Mendoza',correo_usuario:'luis.oper@ejemplo.rgr',cedula_usuario:'8-000-003',telefono_usuario:'6000-1003',fecha_inicio:'2025-08-01',fecha_fin:'',id_rol:2,id_corregimiento:3,estado_usuario:'ACTIVO'},
    {id_usuario:4,nombre_usuario:'María',apellido_usuario:'Torres',correo_usuario:'maria@ejemplo.rgr',cedula_usuario:'8-000-004',telefono_usuario:'6000-1004',fecha_inicio:'2026-02-08',fecha_fin:'',id_rol:3,id_corregimiento:4,estado_usuario:'ACTIVO'},
    {id_usuario:5,nombre_usuario:'Carlos',apellido_usuario:'Pérez',correo_usuario:'carlos@ejemplo.rgr',cedula_usuario:'8-000-005',telefono_usuario:'6000-1005',fecha_inicio:'2026-03-14',fecha_fin:'',id_rol:3,id_corregimiento:5,estado_usuario:'ACTIVO'},
    {id_usuario:6,nombre_usuario:'Valeria',apellido_usuario:'Soto',correo_usuario:'valeria@ejemplo.rgr',cedula_usuario:'8-000-006',telefono_usuario:'6000-1006',fecha_inicio:'2026-05-20',fecha_fin:'',id_rol:3,id_corregimiento:2,estado_usuario:'INACTIVO'},
    {id_usuario:7,nombre_usuario:'Daniel',apellido_usuario:'Cruz',correo_usuario:'daniel@ejemplo.rgr',cedula_usuario:'8-000-007',telefono_usuario:'6000-1007',fecha_inicio:'2026-07-07',fecha_fin:'',id_rol:3,id_corregimiento:6,estado_usuario:'ACTIVO'},
    {id_usuario:8,nombre_usuario:'Elena',apellido_usuario:'Ríos',correo_usuario:'elena@ejemplo.rgr',cedula_usuario:'8-000-008',telefono_usuario:'6000-1008',fecha_inicio:'2026-09-21',fecha_fin:'',id_rol:3,id_corregimiento:1,estado_usuario:'BLOQUEADO'}
  ],
  conductores: [
    {id_conductor:1,nombre_conductor:'José',apellido_conductor:'Vega',cedula_conductor:'8-111-011',telefono_conductor:'6600-2001',sexo_conductor:'M',fecha_nac:'1986-05-14',fecha_inicio:'2021-04-02',fecha_fin:'2030-12-31',id_corregimiento:1,estado_conductor:'ACTIVO'},
    {id_conductor:2,nombre_conductor:'Raúl',apellido_conductor:'Ruiz',cedula_conductor:'8-111-012',telefono_conductor:'6600-2002',sexo_conductor:'M',fecha_nac:'1992-09-22',fecha_inicio:'2023-02-01',fecha_fin:'2030-12-31',id_corregimiento:3,estado_conductor:'ACTIVO'},
    {id_conductor:3,nombre_conductor:'Diego',apellido_conductor:'Pérez',cedula_conductor:'8-111-013',telefono_conductor:'6600-2003',sexo_conductor:'M',fecha_nac:'1988-01-10',fecha_inicio:'2022-07-16',fecha_fin:'2030-12-31',id_corregimiento:4,estado_conductor:'ACTIVO'},
    {id_conductor:4,nombre_conductor:'Sofía',apellido_conductor:'Cruz',cedula_conductor:'8-111-014',telefono_conductor:'6600-2004',sexo_conductor:'F',fecha_nac:'1990-07-11',fecha_inicio:'2020-10-12',fecha_fin:'2030-12-31',id_corregimiento:5,estado_conductor:'ACTIVO'},
    {id_conductor:5,nombre_conductor:'Javier',apellido_conductor:'Castillo',cedula_conductor:'8-111-015',telefono_conductor:'6600-2005',sexo_conductor:'M',fecha_nac:'1989-11-02',fecha_inicio:'2024-01-18',fecha_fin:'2030-12-31',id_corregimiento:2,estado_conductor:'AUSENTE'},
    {id_conductor:6,nombre_conductor:'Gabriela',apellido_conductor:'Rojas',cedula_conductor:'8-111-016',telefono_conductor:'6600-2006',sexo_conductor:'F',fecha_nac:'1995-04-03',fecha_inicio:'2025-05-21',fecha_fin:'2030-12-31',id_corregimiento:6,estado_conductor:'ACTIVO'}
  ],
  camiones: [
    {id_camion:1,modelo:'Isuzu NPR',matricula:'RGR-201',anio:2022,estado_camion:'ACTIVO'},
    {id_camion:2,modelo:'Hino 300',matricula:'RGR-202',anio:2021,estado_camion:'ACTIVO'},
    {id_camion:3,modelo:'Freightliner M2',matricula:'RGR-203',anio:2024,estado_camion:'ACTIVO'},
    {id_camion:4,modelo:'Hino 500',matricula:'RGR-204',anio:2023,estado_camion:'ACTIVO'},
    {id_camion:5,modelo:'Isuzu FTR',matricula:'RGR-205',anio:2020,estado_camion:'MANTENIMIENTO'},
    {id_camion:6,modelo:'Mitsubishi Canter',matricula:'RGR-206',anio:2023,estado_camion:'ACTIVO'}
  ],
  horarios: [
    {id_horario:1,dia:17,mes:11,anio:2026,hora:6,minutos:30,hora_fin:11,minutos_fin:30},
    {id_horario:2,dia:17,mes:11,anio:2026,hora:8,minutos:0,hora_fin:12,minutos_fin:0},
    {id_horario:3,dia:18,mes:11,anio:2026,hora:7,minutos:30,hora_fin:12,minutos_fin:0},
    {id_horario:4,dia:18,mes:11,anio:2026,hora:9,minutos:0,hora_fin:13,minutos_fin:0},
    {id_horario:5,dia:19,mes:11,anio:2026,hora:7,minutos:0,hora_fin:11,minutos_fin:30},
    {id_horario:6,dia:20,mes:11,anio:2026,hora:8,minutos:0,hora_fin:13,minutos_fin:0},
    {id_horario:7,dia:21,mes:11,anio:2026,hora:7,minutos:30,hora_fin:12,minutos_fin:0}
  ],
  rutas: [
    {id_ruta:1,id_corregimiento:1,barrio:'Vía España',calle:'Calle Tercera',id_horario:1,id_conductor:1,id_camion:1,estado_ruta:'ACTIVA'},
    {id_ruta:2,id_corregimiento:2,barrio:'El Carmen',calle:'Calle 50',id_horario:2,id_conductor:2,id_camion:2,estado_ruta:'ACTIVA'},
    {id_ruta:3,id_corregimiento:3,barrio:'Parque Lefevre',calle:'Avenida Principal',id_horario:3,id_conductor:3,id_camion:3,estado_ruta:'ACTIVA'},
    {id_ruta:4,id_corregimiento:4,barrio:'Costa del Este',calle:'Avenida de la Rotonda',id_horario:4,id_conductor:4,id_camion:4,estado_ruta:'PAUSADA'},
    {id_ruta:5,id_corregimiento:6,barrio:'Altos de Santa María',calle:'Vía Principal',id_horario:5,id_conductor:6,id_camion:6,estado_ruta:'INACTIVA'}
  ],
  incidentes: [
    {id_incidente:1,asunto:'Acumulación de residuos',descripcion:'Contenedores llenos en la esquina principal.',id_usuario:4,correo_inv:'',corregimiento_invitado:null,fecha_incidente:'2026-11-16',hora_incidente:'08:40',estado_incidente:'POR RESOLVER',id_ruta:1,img:''},
    {id_incidente:2,asunto:'Retraso en recolección',descripcion:'El camión no pasó a la hora establecida.',id_usuario:5,correo_inv:'',corregimiento_invitado:null,fecha_incidente:'2026-11-15',hora_incidente:'17:20',estado_incidente:'EN PROCESO',id_ruta:2,img:''},
    {id_incidente:3,asunto:'Contenedor dañado',descripcion:'El contenedor requiere reparación.',id_usuario:null,correo_inv:'invitado1@ejemplo.rgr',corregimiento_invitado:3,fecha_incidente:'2026-11-14',hora_incidente:'10:30',estado_incidente:'POR RESOLVER',id_ruta:3,img:''},
    {id_incidente:4,asunto:'Basura en la acera',descripcion:'Se solicita retiro de residuos.',id_usuario:7,correo_inv:'',corregimiento_invitado:null,fecha_incidente:'2026-11-13',hora_incidente:'09:00',estado_incidente:'RESUELTO',id_ruta:4,img:''},
    {id_incidente:5,asunto:'Solicitud de revisión',descripcion:'Vecinos solicitan ajustar el horario.',id_usuario:null,correo_inv:'invitado2@ejemplo.rgr',corregimiento_invitado:4,fecha_incidente:'2026-11-10',hora_incidente:'13:15',estado_incidente:'EN PROCESO',id_ruta:null,img:''},
    {id_incidente:6,asunto:'Ruta despejada',descripcion:'Reporte atendido por el personal.',id_usuario:8,correo_inv:'',corregimiento_invitado:null,fecha_incidente:'2026-11-08',hora_incidente:'14:05',estado_incidente:'RESUELTO',id_ruta:1,img:''},
    {id_incidente:7,asunto:'Residuos en vía pública',descripcion:'Acumulación al lado del parque.',id_usuario:4,correo_inv:'',corregimiento_invitado:null,fecha_incidente:'2026-10-23',hora_incidente:'06:55',estado_incidente:'POR RESOLVER',id_ruta:2,img:''}
  ],
  coordenadas: [
    {id_coordenada:1,id_ruta:1,latitud:9.0211,longitud:-79.4925,secuencia:1,barrio:'Río Abajo',calle:'Vía España'},
    {id_coordenada:2,id_ruta:1,latitud:9.0252,longitud:-79.4879,secuencia:2,barrio:'Río Abajo',calle:'Calle Tercera'},
    {id_coordenada:3,id_ruta:2,latitud:8.9847,longitud:-79.5231,secuencia:1,barrio:'Bella Vista',calle:'Calle 50'},
    {id_coordenada:4,id_ruta:2,latitud:8.9901,longitud:-79.5210,secuencia:2,barrio:'El Carmen',calle:'Vía España'},
    {id_coordenada:5,id_ruta:3,latitud:9.0083,longitud:-79.5008,secuencia:1,barrio:'Parque Lefevre',calle:'Avenida Principal'},
    {id_coordenada:6,id_ruta:4,latitud:9.0190,longitud:-79.4555,secuencia:1,barrio:'Costa del Este',calle:'Rotonda'},
    {id_coordenada:7,id_ruta:5,latitud:9.0333,longitud:-79.5093,secuencia:1,barrio:'San Miguelito',calle:'Vía Principal'}
  ],
  actividad: [
    {fecha:'2026-11-16',tipo:'Incidencia',detalle:'Nuevo reporte de acumulación de residuos'},
    {fecha:'2026-11-15',tipo:'Ruta',detalle:'Supervisión de rutas activas'},
    {fecha:'2026-11-14',tipo:'Incidencia',detalle:'Reporte de contenedor dañado'},
    {fecha:'2026-11-13',tipo:'Incidencia',detalle:'Reporte resuelto por operaciones'}
  ]
};
