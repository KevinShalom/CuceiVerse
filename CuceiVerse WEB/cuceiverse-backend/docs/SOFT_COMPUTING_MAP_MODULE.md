# Modulo Soft Computing En Mapa

## Objetivo

Integrar un motor de recomendacion inteligente para rutas del campus combinando:

- Distancia de ruta
- Afluencia estimada
- Accesibilidad estimada

La seleccion final no usa solo ruta minima. Se evalua conveniencia con logica difusa y se entrega:

- Ruta recomendada
- Rutas alternativas
- Explicacion breve

## Arquitectura

Flujo de alto nivel:

1. Frontend envia origen y destino al backend.
2. Backend calcula varias rutas candidatas en el grafo peatonal.
3. Backend envia atributos de cada ruta al microservicio fuzzy.
4. Microservicio devuelve score y clasificacion por ruta.
5. Backend elige la mejor y responde al frontend.

Servicios y archivos principales:

- Backend endpoint: src/mapa/mapa.controller.ts
- Backend orquestacion: src/mapa/mapa.service.ts
- Backend cliente fuzzy: src/mapa/soft-computing.service.ts
- Rutas alternativas A*: src/mapa/pathfinding.service.ts
- Frontend consumo: cuceiverse-web/src/features/campus-map/api/mapaAdmin.ts
- Frontend UI: cuceiverse-web/src/features/campus-map/components/ModularReadOnlyMap.tsx
- Microservicio fuzzy: ../cuceiverse-soft-computing-service/app/main.py

## Contrato API Backend

### POST /mapa/ruta-recomendada

Request:

```json
{
  "poiOrigenId": "uuid",
  "poiDestinoId": "uuid",
  "alternativesLimit": 3
}
```

Response (ejemplo):

```json
{
  "recommended_route": "ruta_2",
  "score": 0.82,
  "classification": "altamente recomendable",
  "reason": "menor afluencia y distancia moderada",
  "recommended_path": {
    "distanciaTotal": 420.3,
    "polyline": [{ "x": 10, "y": 20 }]
  },
  "alternatives": [
    {
      "route_id": "ruta_1",
      "score": 0.77,
      "classification": "recomendable",
      "reason": "balance entre distancia, afluencia y accesibilidad"
    }
  ],
  "candidates": []
}
```

## Contrato API Microservicio Fuzzy

Base URL: `SOFT_COMPUTING_URL` (default `http://localhost:8010`)

- `GET /health`
- `POST /recommend-route`
- `POST /recommend-batch`

Request hacia `/recommend-batch`:

```json
{
  "routes": [
    {
      "route_id": "ruta_1",
      "origin": { "x": 10, "y": 20 },
      "destination": { "x": 40, "y": 35 },
      "distance": 420,
      "crowd": 28,
      "accessibility": 83
    }
  ]
}
```

## Variables De Entorno

Backend:

- `SOFT_COMPUTING_URL` (ej. `http://localhost:8010`)

Microservicio:

- sin variables obligatorias para iniciar en modo local basico

## Prueba Rapida End-to-End

Desde backend:

```bash
npm run db:seed
npm run smoke:fuzzy-route
```

Script usado: `scripts/smoke_fuzzy_route.sh`

## Observaciones Operativas

- Si no hay POIs con `nearestPathNodeId`, no se puede recomendar ruta.
- El seed oficial ya carga nodos, aristas y POIs base.
- El microservicio fuzzy en Docker requiere `networkx` junto con `scikit-fuzzy`.

## Referencias

- Modelo matematico fuzzy: ../cuceiverse-soft-computing-service/docs/TECHNICAL_MODEL.md
- Variables de entorno backend: docs/ENV.md
- Modulo base de mapa: docs/MAP_MODULE.md
- Despliegue unificado Docker: docs/SOFT_COMPUTING_DOCKER_COMPOSE.md
