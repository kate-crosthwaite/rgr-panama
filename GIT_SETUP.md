# Publicar RGR Panamá Web v20 en GitHub

## 1. Crear un repositorio **privado**
En GitHub > New repository: `RGR-Panama-Web`. Elegir **Private** y dejar desmarcada la creación de README, .gitignore y licencia (ya se incluyen archivos).

## 2. Abrir esta carpeta en VS Code
Abrir la terminal PowerShell desde la carpeta donde está el `index.html` principal. No dentro de `/crm` ni `/erp`.

```powershell
git --version
git init
git add .
git commit -m "feat: integrar CRM y ERP RGR Panama con Apple Glass"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/RGR-Panama-Web.git
git push -u origin main
```

Reemplaza `TU_USUARIO` por tu usuario de GitHub. Si Git solicita identidad:

```powershell
git config --global user.name "Tu nombre publico"
git config --global user.email "correo-asociado-a-github"
```

Ejecuta de nuevo `git commit -m ...` y luego los pasos restantes. GitHub autenticará usando tu navegador o Credential Manager; no incluyas contraseñas en los comandos.

## 3. Comprobar
En GitHub verifica que estén `index.html`, `crm/`, `erp/`, `assets/`, `css/`, `js/`, `supabase/` y `.gitignore`.

## Nota de seguridad
Este proyecto contiene una clave **publicable** de Supabase (apta para frontend), no claves service_role ni secretos OTP/SMTP. No subir archivos `.env` reales ni tokens. Mantener el repositorio **privado** mientras terminas de auditar RLS y las funciones del servidor. Un commit no despliega la web ni cambia la base de datos Supabase.
