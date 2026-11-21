# Guía Técnica y de Despliegue: CodeBoy Advance (GitHub → cPanel)

> **Nota de contexto para Gemini / Asistente de IA:**  
> Si estás leyendo este archivo en una nueva conversación sin acceso al historial previo, aquí tienes el contexto completo del proyecto:  
> **CodeBoy Advance** es una aplicación web educativa ligera estilo **Game Boy Advance** escrita en **TypeScript nativo (sin React ni frameworks pesados), HTML5 Canvas 2D, Web Audio API y Tailwind CSS v4**, compilada con Vite a archivos estáticos puros (`dist/`). Enseña programación en español a niños (bloques visuales + JavaScript guiado + teclado táctil) a través de 4 mundos progresivos y 4 proyectos jefe jugables. Guarda el progreso localmente en `localStorage` y permite exportar/compartir partidas `.json` (o códigos compactos `CB1:...`) por WhatsApp, correo electrónico o archivo para cargarlas en otro dispositivo.  
> **Entorno destino:** Hosting compartido con **cPanel** (con *Git™ Version Control*, *LiteSpeed Web Cache Manager*, *Dominios*, *Uso de Recursos* de CloudLinux y posible presencia de *WordPress Management*). Por diseño, el despliegue **no ejecuta `npm install` ni `vite build` en el servidor compartido** para mantener el consumo de RAM y CPU cercano a cero.

---

## 1. Arquitectura y Contenido del Paquete

- `dist/`: Aplicación web **ya compilada y lista para producción** (`index.html`, `.htaccess` para LiteSpeed/Apache y recursos estáticos minificados con rutas relativas `./`).
- `.cpanel.yml`: Archivo de automatización que indica a **Git™ Version Control** de cPanel cómo copiar `dist/` hacia tu dominio o subdominio.
- `public/.htaccess`: Reglas de caché (`no-cache` para `index.html` e `immutable` para `assets/`) y compresión Gzip/Deflate para LiteSpeed/Apache.
- `src/`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`: Código fuente completo por si deseas editar lecciones o recompilar en el futuro.
- `GUIA_DESPLIEGUE_GITHUB_CPANEL.md`: Esta guía técnica.
- `GUIA_PASO_A_PASO_CPANEL.pdf`: Manual didáctico ilustrado para usuarios sin experiencia técnica.

---

## 2. Antes de Subir a GitHub: Ajustar `.cpanel.yml`

Abre el archivo `.cpanel.yml` con cualquier editor de texto y ajusta la ruta `DEPLOYPATH` con tu usuario real de cPanel y la carpeta donde vivirá la aplicación:

```yaml
---
deployment:
  tasks:
    - export DEPLOYPATH=/home/TU_USUARIO_CPANEL/arcade.tudominio.com/
    - /bin/mkdir -p $DEPLOYPATH
    - /bin/cp -R dist/. $DEPLOYPATH
```

### ¿Qué ruta elegir?
1. **Subdominio dedicado (Recomendado si ya tienes WordPress en `public_html`)**:  
   Crea el subdominio `arcade.tudominio.com` desde **cPanel → Dominios**. Por defecto su carpeta será `/home/TU_USUARIO_CPANEL/arcade.tudominio.com/` (o `/home/TU_USUARIO_CPANEL/public_html/arcade/` según tu cPanel; verifica la columna *Document Root* en la sección *Dominios*).
2. **Subcarpeta dentro del dominio principal**:  
   Usa `/home/TU_USUARIO_CPANEL/public_html/arcade/`. Gracias a que Vite está configurado con `base: './'`, la aplicación funciona correctamente tanto en raíz como en subcarpeta.

> **Importante:** En `.gitignore` de este paquete **no** se excluye `dist/` para que GitHub y cPanel reciban directamente los archivos compilados sin tener que instalar Node.js en el servidor.

---

## 3. Subir el Proyecto a GitHub

### Opción A — Por consola Git (en tu computadora)
```bash
git init
git add .
git commit -m "Versión inicial de CodeBoy Advance lista para cPanel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/codeboy-advance.git
git push -u origin main
```

### Opción B — Sin consola (Directo en GitHub.com)
1. Crea un repositorio nuevo en GitHub (público o privado).
2. Haz clic en **uploading an existing file**.
3. Arrastra todo el contenido descomprimido (asegurándote de incluir los archivos ocultos `.cpanel.yml`, `.gitignore` y la carpeta `dist/` con `.htaccess` dentro).
4. Pulsa **Commit changes**.

---

## 4. Conectar y Desplegar en cPanel (`Git™ Version Control`)

1. Inicia sesión en **cPanel** y abre **Archivos → Git™ Version Control**.
2. Haz clic en **Create**.
3. Activa **Clone a Repository** y configura:
   - **Clone URL**: `https://github.com/TU_USUARIO/codeboy-advance.git` *(si el repositorio es privado, usa SSH con llave configurada en cPanel → SSH Access o hazlo público temporalmente)*.
   - **Repository Path**: `/home/TU_USUARIO_CPANEL/repositories/codeboy-advance` *(fuera de `public_html` para mayor seguridad)*.
   - **Repository Name**: `codeboy-advance`.
4. Haz clic en **Create**.
5. En la lista de repositorios, pulsa **Manage** junto a `codeboy-advance`, ve a la pestaña **Pull or Deploy**:
   - Pulsa **Update from Remote**.
   - Pulsa **Deploy HEAD Commit** (esto ejecuta `.cpanel.yml` y copia `dist/` a tu web).
6. Si usas LiteSpeed y no ves un cambio reciente, entra a **Avanzada → LiteSpeed Web Cache Manager → Flush All**.

---

## 5. Cómo Recompilar Si Modificas el Código Fuente en el Futuro

Si más adelante pides a Gemini o a un desarrollador editar lecciones, retos o textos en `src/`:

1. En tu computadora (con Node.js instalado):
   ```bash
   npm install
   npm run build
   ```
2. Sube los cambios incluyendo la carpeta `dist/` actualizada:
   ```bash
   git add .
   git commit -m "Actualización de lecciones"
   git push
   ```
3. En **cPanel → Git™ Version Control → Manage → Pull or Deploy**, pulsa **Update from Remote** y luego **Deploy HEAD Commit**.

---

## 6. Solución Rápida de Problemas

| Síntoma | Causa probable | Solución |
| :--- | :--- | :--- |
| Error 404 o página en blanco al abrir la URL | La ruta `DEPLOYPATH` en `.cpanel.yml` no coincide con el *Document Root* del dominio | Verifica la ruta exacta en **cPanel → Dominios**, corrige `.cpanel.yml`, haz push y vuelve a pulsar *Deploy HEAD Commit*. |
| El botón *Deploy HEAD Commit* aparece deshabilitado | `.cpanel.yml` no está en la raíz del repositorio o tiene errores de indentación YAML | Asegúrate de que `.cpanel.yml` esté en la raíz (no dentro de una subcarpeta) y conserve espacios (no tabulaciones). |
| No se ven los últimos cambios tras actualizar | Caché de LiteSpeed o del navegador | Entra a **LiteSpeed Web Cache Manager → Flush All** y recarga con `Ctrl + F5`. |
| Conflicto con reglas de WordPress en `public_html` | Están compartiendo la misma carpeta raíz | Mueve el despliegue a un subdominio limpio (`arcade.tudominio.com`) o subcarpeta dedicada con su propio `.htaccess`. |
