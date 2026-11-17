# RGR Panamá Web v23 — Panel único CRM + ERP

El `index.html` principal es el **único punto de entrada y login**. Tras autenticarse en Supabase, el sistema selecciona el área autorizada y abre su panel en la misma pestaña y URL, sin mostrar un segundo formulario ni cambiar visualmente entre aplicaciones durante la carga.

- **Administrador (rol 1, ACTIVO):** CRM con comprobación de `crm-security`, validaciones de contraseña, bloqueos y recuperación OTP.
- **Operador (rol OPERADOR, ACTIVO):** ERP con sus herramientas operativas, sin verificación adicional por cada CRUD.
- **Datos y mapas:** se conservan todas las integraciones y rutas de la versión 21.
- **Seguridad:** el módulo verifica el rol y estado antes de mostrar información. Supabase RLS sigue determinando los permisos reales.
- **Cierre de sesión:** vuelve al inicio de sesión principal; no abre otro login.

### Uso local
Abrir el proyecto completo en VS Code y ejecutar **solamente el `index.html` de la raíz** con Live Server. No es necesario abrir manualmente `/crm/index.html` ni `/erp/index.html`.

### GitHub Pages
Publicar todo el contenido de la carpeta en la raíz del repositorio, o mantenerlo en una carpeta contenedora y utilizar su ruta exacta. No se requieren SQL ni despliegues adicionales de `crm-security` por este cambio visual.

La carpeta `crm` y la carpeta `erp` permanecen separadas **internamente**, para conservar la lógica de sus formularios, controles y mapas. El usuario ve un solo panel en la URL principal.

### Desbloqueo de seguridad (v23)
Tras comprobar la contraseña y el estado de sesión activo en Supabase, el CRM muestra una pantalla «Identidad verificada» durante aproximadamente 2 segundos antes de regresar al panel. El temporizador de inactividad se reinicia al confirmar y al volver al dashboard. La pantalla no altera los permisos, el ERP ni la Edge Function, y no requiere ejecutar SQL.


## Versión 24: simulación de camiones GPS (90 segundos)

- En **CRM → Dashboard / Mapa de recorridos** y en **ERP → Mapa de recorridos**, se muestra un camión animado por ruta cargada de `public.coordenadas`.
- Cada recorrido dura exactamente **90 segundos** por ciclo, independientemente de cuántos puntos tenga. Se repite automáticamente.
- El movimiento se interpola entre las coordenadas ordenadas por `secuencia`, proporcionalmente a la distancia de cada segmento.
- Incluye progreso, temporizador, pausa, reanudación y reinicio. Al seleccionar otra ruta, la simulación comienza al inicio.
- Se identifica explícitamente como **GPS simulado**; no se leen, almacenan ni envían posiciones reales.
- No requiere cambiar Supabase, SQL, secretos, funciones ni permisos. Para GitHub Pages, actualiza todo el contenido del repositorio, manteniendo `index.html` en la raíz.
- Rutas que contengan un único punto muestran el camión quieto, porque no hay trayecto suficiente para animarlo.
