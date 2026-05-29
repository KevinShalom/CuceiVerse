#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
LOGIN_CODE="${LOGIN_CODE:-218542692}"
LOGIN_NIP="${LOGIN_NIP:-MoKa++-A2B}"
ALTERNATIVES_LIMIT="${ALTERNATIVES_LIMIT:-3}"

POIS_JSON="$(curl --no-progress-meter -sS "${API_BASE}/puntos-interes?activo=true")"
IDS="$(printf '%s' "$POIS_JSON" | node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));const arr=(p.data||[]).filter(x=>x.nearestPathNodeId);if(arr.length<2){console.error('No hay al menos 2 POIs con nearestPathNodeId');process.exit(2);}process.stdout.write(arr[0].id+' '+arr[1].id);")"

ORIG="$(printf '%s' "$IDS" | awk '{print $1}')"
DEST="$(printf '%s' "$IDS" | awk '{print $2}')"

TOKEN="$(curl --no-progress-meter -sS -X POST "${API_BASE}/auth/login" -H 'Content-Type: application/json' -d "{\"codigo\":\"${LOGIN_CODE}\",\"nip\":\"${LOGIN_NIP}\"}" | node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(0,'utf8'));if(!j.accessToken){console.error('No se recibio accessToken en login');process.exit(3);}process.stdout.write(j.accessToken);")"

RESPONSE="$(curl --no-progress-meter -sS -X POST "${API_BASE}/mapa/ruta-recomendada" -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' -d "{\"poiOrigenId\":\"${ORIG}\",\"poiDestinoId\":\"${DEST}\",\"alternativesLimit\":${ALTERNATIVES_LIMIT}}")"

printf '%s' "$RESPONSE" | node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(0,'utf8'));console.log('SMOKE_OK');console.log('recommended_route:',j.recommended_route);console.log('score:',j.score);console.log('classification:',j.classification);console.log('reason:',j.reason);console.log('alternatives:',Array.isArray(j.alternatives)?j.alternatives.length:0);"
