# Guía de Despliegue Ligero con Git™ Version Control en cPanel

Este proyecto compila a archivos estáticos puros (`dist/`), por lo que el servidor compartido **no necesita mantener procesos Node.js, Python ni bases de datos MySQL encendidos** para ejecutar el juego.

## Opción Recomendada (Cero Consumo de RAM/CPU en el cPanel)

1. **Prepara la carpeta estática en tu equipo**:
   ```bash
   npm install
   npm run build
   ```
   Esto genera la carpeta `dist/` con `index.html`, `.htaccess` y los archivos minificados (< 100 KB).
2. **Sube la rama de producción a Git** (por ejemplo, manteniendo `dist/` en una rama `deploy` o quitando `dist/` de `.gitignore` si solo usas una rama):
   - Edita `.cpanel.yml` cambiando `USUARIO` y la ruta de destino (se recomienda un subdominio dedicado como `/home/tuusuario/arcade.tudominio.com/` para aislarlo de WordPress).
3. **Conecta en cPanel → Archivos → Git™ Version Control**:
   - Haz clic en **Create**, pega la URL de tu repositorio y selecciona la rama de despliegue.
   - En la pestaña **Manage → Pull or Deploy**, pulsa **Update from Remote** y luego **Deploy HEAD Commit**.
4. **Limpia caché si usas LiteSpeed**:
   - Si actualizas el sitio, abre **LiteSpeed Web Cache Manager → Flush All** si tu dominio tiene caché agresiva de HTML.
