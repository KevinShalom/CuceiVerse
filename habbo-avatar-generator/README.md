# Habbo/Nitro Avatar Generator (random + manual builder)

Una web lista para correr (con Docker) que:
- **Genera avatares aleatorios** estilo Habbo/Nitro.
- Permite **construir el avatar manualmente** (selección por categorías y colores).
- Renderiza el avatar llamando a un **Nitro Imager** local (server-side) y devuelve PNG/GIF.

> Nota legal: los assets de Habbo/Nitro pueden estar sujetos a copyright/licencias.Este proyecto es sin fines de lucro.

## Qué incluye

- `assets-init`: contenedor “init” que descarga un pack de `.nitro` + gamedata (por defecto: `sphynxkitten/nitro-assets`) y prepara una carpeta `data/assets` con **clothes + effects** juntos.
- `imager`: Nitro Imager (se clona y compila desde `billsonnn/nitro-imager`) con cache local.
- `web`: Next.js (UI + API routes) para construir y randomizar el avatar.

## Requisitos

- Docker + Docker Compose (v2)
- Internet la primera vez (para clonar repos y bajar assets)

## Ejecutar

1) En la carpeta del proyecto:

```bash
docker compose up --build
```

2) Abre:
- Web: http://localhost:3000
- Imager (interno): http://localhost:3030/imaging

## Configuración rápida

Copia `.env.example` a `.env` si quieres cambiar puertos o el repo de assets.

- `ASSETS_REPO`: repositorio git con assets `.nitro` y gamedata json (default: `https://github.com/sphynxkitten/nitro-assets.git`)
- `ASSETS_BRANCH`: rama (default: `master`)
- `WEB_PORT`: puerto del front (default: `3000`)
- `IMAGER_PORT`: puerto del imager (default: `3030`)

## Cómo funciona el “set compatible con Habbo/Nitro”

El Nitro Imager usa:
- `FigureData.json`
- `FigureMap.json`
- `EffectMap.json`
- `HabboAvatarActions.json`
- `.nitro` libraries (figuras/ropa + efectos)

El init-container prepara todo en `./data/` y el imager lo consume desde paths locales (más rápido). Ver variables en `docker-compose.yml`.

## Producción (ideas)

- Monta `web` detrás de nginx/caddy.
- Mantén `imager` privado (solo accesible desde el backend).
- Añade rate limiting/cache a `/api/render`.
- Usa un pack de assets propio (tu hotel/Nitro).

## Créditos

- Nitro Imager: https://github.com/billsonnn/nitro-imager
- Nitro Converter: https://github.com/billsonnn/nitro-converter
- Ejemplo env vars + docker: https://github.com/duckietm/docker-imager
- Pack de assets ejemplo: https://github.com/sphynxkitten/nitro-assets
