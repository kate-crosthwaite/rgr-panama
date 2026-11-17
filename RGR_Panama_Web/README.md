# RGR Panamá Web v18 — CRM + ERP

Proyecto completo: **un solo inicio de sesión** y dos módulos independientes con la misma base de datos Supabase.

## Abrir

1. Descomprime el ZIP. Abre **RGR_Panama_Web_v18_CRM_ERP** en Visual Studio Code.
2. Ejecuta **index.html** de la RAÍZ mediante Live Server (no `crm/index.html` ni `erp/index.html`).
3. Inicia sesión: `ADMINISTRADOR` (`id_rol = 1`, `ACTIVO`) va al CRM; `OPERADOR` (`ACTIVO`) va al ERP.
4. Al cerrar sesión desde cualquiera de los paneles regresas al inicio unificado.

## Organización

- `index.html`, `css/portal.css`, `js/portal.js`: login unificado, identifica el rol desde Supabase Auth + `mi_rol()`.
- `js/config.js`: configuración pública **única** de Supabase, compartida con ambos paneles.
- `supabase/functions/crm-security/`: copia del código del servicio para futuros cambios; no es necesario desplegarlo otra vez por unificar la web.
- `crm/`: CRM v17 íntegro, Apple Glass, 13 vistas, CRUD, seguridad mediante `crm-security` (se conserva su código); solo se ajustaron la salida hacia el portal y la redirección si no hay sesión.
- `erp/`: ERP original íntegro, Apple Glass, rutas, horarios, incidencias, conductores, camiones, ubicaciones, mapa, perfil; solo se ajustaron salida e inicio sin sesión hacia el portal.
- `assets/logo-rgr.png`: logo oficial enviado por el usuario.

Todos usan el proyecto público de Supabase `nvpdayuoeqhbpgvmtibv`, sin incorporar claves privadas.

## Seguridad

- El login unificado NO concede permisos por sí mismo: el CRM vuelve a comprobar el rol, el estado y el servicio `crm-security`; el ERP comprueba `mi_rol()`, `mi_id_usuario()`, identidad de Auth y `estado_usuario = ACTIVO`.
- Los permisos de base de datos deben mantenerse en RLS y en las funciones de servidor. No se alteró ni se desplegó SQL o Edge Functions.
- El ERP no exige OTP ni contraseña para cada CRUD; el CRM conserva sus verificaciones.
- Al abrir directamente `crm/` o `erp/` sin sesión, se regresa a la entrada común.

## Requisitos

Conexión a internet para cargar Supabase JS. El mapa del ERP requiere MapLibre y sus estilos remotos. Para una prueba completa se necesita un administrador y un operador realmente habilitados en la base de datos.


## Ajuste visual v20

Se eliminó el fondo verde detrás de los logos del portal, CRM y ERP. La imagen PNG original transparente y las funcionalidades se mantienen intactas.
