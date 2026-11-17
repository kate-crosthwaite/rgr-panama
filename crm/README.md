# RGR Panamá · CRM v17 — Logo integrado

Proyecto completo. Esta versión corrige el logo ausente del ZIP ligero v16 y conserva el diseño Apple Glass, la integración Supabase y el código de seguridad existente. Se incluye el PNG original en `assets/logo-app-rgr.png` y se usa en el login, la barra lateral, el encabezado y las pantallas de seguridad. También se utiliza como favicon.

## Apertura

1. Descomprime el ZIP completo (no abras `index.html` dentro del ZIP).
2. Abre la carpeta `RGR_Panama_CRM_Completo_v17_Logo_RGR` en VS Code.
3. Ejecuta `index.html` con Live Server.
4. Si el logo aún se ve roto, recarga con Ctrl+Shift+R y comprueba en el navegador la ruta `http://127.0.0.1:5500/assets/logo-app-rgr.png` (ajusta el puerto si Live Server usa otro).

## Seguridad

Esta versión corrige únicamente la distribución del logo y los recursos estáticos, **no** resuelve el error de servidor `[PERFIL_CONSULTA]`. No hace falta redesplegar `crm-security` ni ejecutar SQL por este cambio. El error debe investigarse en los logs de Supabase Edge Functions (crm-security → Logs): consulta el código `profile_query_error` del evento que coincide con el intento de inicio de sesión. Oculta todos los tokens o claves antes de compartir capturas.

Mantén el proyecto apuntando a tu instancia existente de Supabase. No utilices el modo demo para probar seguridad real.
