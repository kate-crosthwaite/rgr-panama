# RGR Panamá — v14 | OTP mediante Supabase Auth

## Conserva tu configuración actual

- **No borres** el proyecto Supabase, las tablas, las políticas, la configuración SMTP de Gmail, ni los secretos actuales.
- Tu proyecto ya está vinculado a la CLI. Si descargas un ZIP nuevo en otra carpeta, la vinculación local no siempre se conserva, pero puede indicarse el `project-ref` al desplegar o vincular de nuevo esa carpeta.
- `RGR_ALLOWED_ORIGIN` permanece con el origen que configuraste (sin `/index.html#/login`).
- `RGR_OTP_SECRET` puede quedar guardado sin usarse. **Esta versión no usa Resend** ni necesita `RESEND_API_KEY` ni `RGR_OTP_FROM`.

## Antes de desplegar

1. En Supabase **Authentication → Email Templates → Magic Link** comprueba si el cuerpo contiene `{{ .Token }}`. Para recibir un código de seis dígitos por correo, la plantilla debe mostrar ese valor en vez de utilizar únicamente `{{ .ConfirmationURL }}`. **Esta plantilla puede afectar a otros flujos de ingreso por correo; revisa su contenido antes de guardarla.** No es la plantilla de confirmación de registro de Flutter.
2. No ejecutes el SQL de v10, v11 o v12. En este paquete está la migración unificada v13 que corresponde al servicio; **todavía debe revisarse su compatibilidad con las RPC y escrituras directas de Flutter** antes de ejecutarla.
3. La v14 no requiere ninguna modificación adicional en las tablas para pasar de Resend a Supabase Auth. Reutiliza las funciones RPC de seguridad ya definidas en el SQL v13.

## Despliegue (solo cuando se hayan validado las dependencias de Flutter)

Abre PowerShell en la carpeta donde esté `supabase/functions/crm-security/index.ts`.

```powershell
npx.cmd supabase link --project-ref TU_PROJECT_REF
npx.cmd supabase functions deploy crm-security
```

Si ya estás en la carpeta que mantiene el vínculo local, no tienes que repetir `link`.

## Flujo de seguridad

1. Cuenta bloqueada por tres fallos: estado `BLOQUEADO`; el DBA autoriza la recuperación, y transcurre una hora desde el bloqueo.
2. El servidor solicita un correo OTP a **Supabase Auth** usando el SMTP ya configurado. No crea usuarios nuevos (`shouldCreateUser:false`).
3. El servidor verifica el código de seis dígitos con `auth.verifyOtp` y comprueba que pertenece al mismo `auth_user_id`.
4. El registro SQL impone el máximo de tres intentos de verificación y la ventana de recuperación de cinco minutos.
5. La persona confirma su contraseña para recuperar la cuenta y el estado `ACTIVO`.

El cliente de verificación temporal usa `signOut({scope:'local'})` para evitar cerrar sesiones de otros dispositivos.

## Límites de esta entrega

- No se ejecutó SQL ni se desplegó la Edge Function en tu proyecto desde este entorno.
- No se envió ni verificó correo real; revisa la plantilla de OTP y prueba con una cuenta administrativa de pruebas antes de producción.
- El código v13/v14 aún requiere una revisión integral de los RLS y RPC de Flutter y ERP para garantizar que no existan escrituras directas que salten la reautenticación del CRM.
- El correo OTP de Supabase Auth usa su propia expiración y límites de frecuencia; si se desea 5 minutos también del lado de Auth, ajusta la expiración de Email OTP a 300 segundos teniendo en cuenta que puede afectar otros emails de Auth.
- La transición de estado solo se acepta tras autorización y verificación de contraseña.
