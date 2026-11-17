# Activación rápida CRM v15 — sin afectar las RPC actuales de Flutter

No borres tu base de datos, SMTP, secretos ni la versión actual.

## 1. SQL Editor (Supabase)

Ejecuta **solo** `sql/01_ACTIVAR_CRM_SECURITY_SIN_CAMBIAR_FLUTTER.sql`. Esta migración instala las tablas internas de intentos y auditoría y las funciones `crm_security_*` que necesita la Edge Function. No toca las RLS existentes ni revoca acceso de la app Flutter. Si una comprobación falla, la transacción revierte sus cambios.

**NO ejecutes** `sql/RGR_Panama_Seguridad_Unificada_v13.sql` en esta fase: modifica políticas y revoca una RPC utilizada por Flutter.

## 2. PowerShell / VS Code

En la carpeta del CRM v15, que contiene `supabase/`:

```powershell
Test-Path .\supabase\functions\crm-security\index.ts
npx.cmd supabase link --project-ref TU_PROJECT_REF
npx.cmd supabase functions deploy crm-security --no-verify-jwt
```

Si ya está vinculado esta misma carpeta, puedes omitir `link`. Se usa `--no-verify-jwt` porque el código de la función valida el JWT por sí mismo con `auth.getUser(token)`; **no** se elimina la comprobación de identidad.

## 3. Probar login

Abre `index.html` en Live Server (`http://127.0.0.1:5500`). Inicia sesión con un administrador `id_rol=1`, `estado_usuario='ACTIVO'`, vinculado al correo mediante `auth_user_id`.

## Estado real y pendientes

- En esta fase la función de CRM pide contraseña antes de cada CRUD, bloquea la pantalla por inactividad y registra intentos en Supabase.
- La lógica de autorización de acceso está en el servidor, pero la protección global **no está completa** mientras haya políticas/RPC antiguas que permitan escrituras directas a Flutter y ERP.
- La recuperación OTP depende de configurar la plantilla de correo de Supabase Auth para mostrar `{{ .Token }}` y de la autorización DBA; hay que probarla con una cuenta de ensayo.
- No ejecutes la migración SQL restrictiva de v13 sin adaptar antes la administración de roles de Flutter.
- Este ZIP es completo. Su archivo v13 queda como referencia, no para ejecutarlo en esta fase.
