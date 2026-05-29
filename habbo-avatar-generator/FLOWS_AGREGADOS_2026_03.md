# Flujos Agregados - Marzo 2026

## 1) Flujo de build y runtime del imager
1. La imagen de build instala dependencias npm y compila el servicio.
2. La imagen runtime copia artefactos compilados.
3. Se agregan librerias de sistema requeridas por dependencias graficas:
   - libcairo2
   - libpango-1.0-0
   - libpangocairo-1.0-0
   - libjpeg62-turbo
   - libgif7
   - librsvg2-2
4. El runtime queda listo para ejecutar renderizado de avatares sin faltar binarios del sistema.

## 2) Flujo de ejecucion con docker compose
1. Levantar `imager` y `web` con compose.
2. Verificar puertos y estado de servicios.
3. Si hay conflicto de puertos, ajustar variables de entorno de compose.

## Nota
- `package-lock.json` se incluye para consistencia de instalacion y reproducibilidad del entorno Node.
