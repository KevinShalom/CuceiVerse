# Despliegue Unificado Con Docker Compose

Este documento levanta en conjunto:

- PostgreSQL local
- Backend NestJS
- Microservicio de logica difusa (FastAPI)

Archivo principal:

- `docker-compose.fuzzy.yml`

## Requisitos

- Docker Desktop
- Puerto 3000 libre (backend)
- Puerto 5432 libre (PostgreSQL)
- Puerto 8010 libre (microservicio fuzzy)

## Levantar Todo

Desde la raiz de `cuceiverse-backend`:

```bash
docker compose -f docker-compose.fuzzy.yml up --build
```

En segundo plano:

```bash
docker compose -f docker-compose.fuzzy.yml up --build -d
```

## Verificar Salud

```bash
curl --no-progress-meter -sS http://localhost:8010/health
curl --no-progress-meter -sS http://localhost:3000/
```

## Smoke Test De Recomendacion

Una vez arriba el compose:

```bash
npm run smoke:fuzzy-route
```

Debe imprimir `SMOKE_OK` y mostrar ruta recomendada.

## Apagar

```bash
docker compose -f docker-compose.fuzzy.yml down
```

Tambien eliminar volumen de base de datos local:

```bash
docker compose -f docker-compose.fuzzy.yml down -v
```

## Notas

- El backend usa `SIIAU_MODE=fixture` dentro de este compose para pruebas locales reproducibles.
- `SOFT_COMPUTING_URL` queda apuntando al servicio interno `http://soft-computing:8010`.
- El contenedor backend ejecuta migraciones y seed al iniciar.
