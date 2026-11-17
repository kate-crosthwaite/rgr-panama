# RGR Panamá — ERP de Operadores · Apple Glass

Portal web **independiente del CRM** y del proyecto Flutter, inspirado en los paneles ERP de referencia. Comparte **la misma base Supabase de la aplicación**, utiliza la clave *publishable* pública y no dispone de claves de administrador ni datos simulados.

## Iniciar

1. Descomprime este ZIP y abre la carpeta `RGR_Panama_ERP_Operadores_Apple_Glass` en VS Code.
2. Abre `index.html` con **Live Server** (`http://127.0.0.1:5500` o el puerto que te asigne).
3. Inicia sesión con una **cuenta real de operador** de Supabase Auth.

**No se necesita ejecutar SQL, vincular CLI ni desplegar otra Edge Function para abrir este ERP.**

## Funciones trasladadas de Flutter

| Vista | Funciones |
| --- | --- |
| Resumen | Indicadores reales de rutas, horarios, flota e incidencias; gráficos |
| Rutas | Consultar rutas internas, crear, editar ubicación y estado, asignar conductor/camión/horario mediante las RPC usadas por Flutter |
| Horarios | Consultar, crear y editar fechas e intervalos de recolección |
| Incidencias | Consultar reportes (ciudadanos/invitados), ver detalles y cambiar estado |
| Mapa | Ver rutas con puntos reales de `coordenadas`; mapa OpenFreeMap/MapLibre, mismo estilo que Flutter |
| Conductores | Crear y modificar datos y estados; ver asignaciones |
| Camiones | Registrar, editar estado y consultar asignaciones |
| Ubicaciones | Consultar, registrar y cambiar estado de provincias, distritos y corregimientos |
| Mi perfil | Visualizar los datos del operador y cerrar sesión |

Se omite expresamente la gestión de **usuarios, roles y cuentas administradoras**. No se agregaron OTP ni confirmación adicional de contraseña por cada cambio. Se utiliza solamente el login normal de Supabase Auth.

## Fuentes de datos

- Consultas: `vw_rutas_operador`, `vw_horarios_operador`, `vw_incidentes_operador`, `conductores`, `camiones`, `provincia`, `distritos`, `corregimientos`, `coordenadas` y el perfil propio en `usuarios`.
- Identidad: funciones existentes `mi_rol()` y `mi_id_usuario()`; solo permite acceso `OPERADOR` con estado `ACTIVO` y vínculo válido a Supabase Auth.
- Escrituras: `rutas`, `horarios`, `incidentes`, `conductores`, `camiones`, `provincia`, `distritos`, `corregimientos`, además de `asignar_conductor_a_ruta`, `asignar_camion_a_ruta` y `cambiar_horario_de_ruta`.

**Los permisos reales dependen de las políticas RLS y de las RPC que ya tienes en Supabase.** Si una operación es denegada, el ERP muestra el mensaje del servidor, sin eludir la restricción. No debe usarse `service_role` en el navegador.

## Si aparece un error

- **Rol no autorizado:** verifica que la cuenta tiene rol `OPERADOR`, estado `ACTIVO` y `auth_user_id` vinculado.
- **Permission denied / RLS:** la vista o la operación requiere un permiso que no concede tu base de datos. No cambies políticas globales a ciegas.
- **Supabase JS no disponible:** comprueba Internet y abre la carpeta con Live Server.
- **Mapa vacío:** solo se muestran coordenadas registradas y accesibles para el operador. No es GPS en vivo.

## Estructura

```
RGR_Panama_ERP_Operadores_Apple_Glass/
├── index.html
├── config/supabase.js
├── css/styles.css
├── js/app.js
├── assets/logo-rgr.png
└── README.md
```

El frontend usa bibliotecas remotas de Supabase y MapLibre por CDN; requiere conexión a Internet para autenticarse y cargar el mapa. No modifica el CRM ni el proyecto Flutter original.

## Estado de pruebas

Comprobados en navegador con **respuestas de prueba**: navegación de todas las vistas, formularios, diseño de escritorio y móvil, sintaxis JavaScript y presencia del logo. No se realizaron operaciones de escritura ni inicio de sesión contra tu Supabase real; el resultado final depende de su RLS.
