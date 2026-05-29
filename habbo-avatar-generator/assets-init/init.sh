#!/usr/bin/env bash
set -euo pipefail

ASSETS_REPO="${ASSETS_REPO:-https://github.com/sphynxkitten/nitro-assets.git}"
ASSETS_BRANCH="${ASSETS_BRANCH:-master}"

mkdir -p /data

# ------------------------------------------------------------------
# Clonar o actualizar assets
# ------------------------------------------------------------------
if [ ! -d "/data/nitro-assets/.git" ]; then
  echo "[assets-init] Clonando assets: ${ASSETS_REPO} (branch: ${ASSETS_BRANCH})"
  rm -rf /data/nitro-assets
  git clone --depth 1 --branch "${ASSETS_BRANCH}" "${ASSETS_REPO}" /data/nitro-assets
else
  echo "[assets-init] Assets ya existen, intentando actualizar..."
  cd /data/nitro-assets
  git fetch --depth 1 origin "${ASSETS_BRANCH}" || true
  git reset --hard "origin/${ASSETS_BRANCH}" || true
fi

# ------------------------------------------------------------------
# Preparar carpeta combinada de libs Nitro
# ------------------------------------------------------------------
echo "[assets-init] Preparando carpeta combinada /data/assets (clothes + effects) ..."
rm -rf /data/assets
mkdir -p /data/assets

# Clothes (.nitro en cualquier subcarpeta)
if [ -d "/data/nitro-assets/clothes" ]; then
  find /data/nitro-assets/clothes -type f -name "*.nitro" -print0 \
    | xargs -0 -I{} cp -f "{}" /data/assets/ || true
fi

# Effects (.nitro en cualquier subcarpeta)
if [ -d "/data/nitro-assets/effects" ]; then
  find /data/nitro-assets/effects -type f -name "*.nitro" -print0 \
    | xargs -0 -I{} cp -f "{}" /data/assets/ || true
fi

# ------------------------------------------------------------------
# Fix rutas de gamedata para Nitro Imager
# (el imager espera /data/nitro-assets/gamedata/json)
# ------------------------------------------------------------------
mkdir -p /data/nitro-assets/gamedata/json

# FigureData + FigureMap (vienen de clothes/json)
if [ -f "/data/nitro-assets/clothes/json/FigureData.json" ]; then
  cp -f "/data/nitro-assets/clothes/json/FigureData.json" \
        "/data/nitro-assets/gamedata/json/FigureData.json"
fi

if [ -f "/data/nitro-assets/clothes/json/FigureMap.json" ]; then
  cp -f "/data/nitro-assets/clothes/json/FigureMap.json" \
        "/data/nitro-assets/gamedata/json/FigureMap.json"
fi

# EffectMap (viene de effects/json)
if [ -f "/data/nitro-assets/effects/json/EffectMap.json" ]; then
  cp -f "/data/nitro-assets/effects/json/EffectMap.json" \
        "/data/nitro-assets/gamedata/json/EffectMap.json"
fi

# ------------------------------------------------------------------
# Optimizar Assets
# ------------------------------------------------------------------
echo "[assets-init] Optimizando assets (Reduciendo a 40 items por categoría)..."
node /assets-init/optimize.js

# ------------------------------------------------------------------
# Resumen
# ------------------------------------------------------------------
echo "[assets-init] Listo."
echo "[assets-init] Total nitro libs en /data/assets: $(ls -1 /data/assets | wc -l | tr -d ' ')"
