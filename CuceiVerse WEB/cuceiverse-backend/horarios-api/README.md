# Horarios API — dentro de cuceiverse-backend
Microservicio FastAPI que expone el scraper de oferta académica del CUCEI (SIIAU).

## Dependencias
```
pip install -r requirements.txt
```

## Iniciar manualmente (normalmente es automático al arrancar el backend NestJS)
```
uvicorn main:app --port 8020
```

## Endpoints
- `POST /reload` — Inicia un nuevo scraping en background
- `GET /reload/status` — Estado del scraping (incluye resultados cuando termina)
- `GET /ciclo` — Ciclo escolar actual calculado
- `POST /export` — Scrapr + exporta a Excel
- `GET /health` — Health check
