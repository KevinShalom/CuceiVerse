# Asistente Universitario IA - CUCEIverse

## Objetivo
Implementar un asistente conversacional universitario contextual para:
- Navegacion y rutas dentro del campus.
- Consulta academica personalizada con snapshot SIIAU ya sincronizado.
- Soporte funcional sobre modulos de CUCEIverse.

## Componentes implementados

### Backend (NestJS)
- Modulo: `src/assistant/assistant.module.ts`
- Controller: `src/assistant/assistant.controller.ts`
- Service: `src/assistant/assistant.service.ts`
- DTOs: `src/assistant/dto/assistant-chat.dto.ts`

Endpoint protegido por JWT:
- `POST /assistant/chat`

Request:
```json
{
  "message": "Como llego al laboratorio de redes?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "lastDestinationPoiId": "...",
    "lastDestinationLabel": "..."
  }
}
```

Response:
```json
{
  "reply": "Te guio a ...",
  "intent": "navigation",
  "suggestions": ["..."],
  "context": {
    "lastDestinationPoiId": "...",
    "lastDestinationLabel": "..."
  },
  "action": {
    "type": "highlight-route",
    "destinationPoiId": "...",
    "destinationLabel": "..."
  }
}
```

### Frontend (React)
- API client: `src/features/assistant/api/assistant.ts`
- Widget persistente: `src/features/assistant/components/CampusAssistantWidget.tsx`
- Integracion global: `src/components/MainLayout.tsx`
- Integracion mapa (accion de ruta): `src/features/campus-map/components/ModularReadOnlyMap.tsx`

## Flujo conversacional funcional
1. Usuario abre boton flotante (esquina inferior izquierda).
2. Envia consulta.
3. Frontend llama `POST /assistant/chat`.
4. Backend clasifica intencion y genera respuesta contextual.
5. Si hay accion de ruta, frontend emite evento `cuceiverse.assistant.route`.
6. El mapa consume el evento y traza la ruta.

## Capacidades cubiertas

### 1) Navegacion campus
- Soporta consultas tipo:
  - "Como llego al edificio X"
  - "Llevame al laboratorio de redes"
  - "Muestrame la ruta"
- Resuelve POI por nombre (fuzzy basico) y contexto "ahi".
- Puede disparar resaltado/trazo en mapa mediante accion `highlight-route`.

### 2) Consulta academica personalizada (snapshot)
- Fuente: `SiiauSessionCacheService.get(userId)`.
- No consulta SIIAU en cada mensaje.
- Soporta:
  - promedio
  - materias cursando
  - clases hoy
  - siguiente clase
  - entrada de manana

### 3) Soporte plataforma
- Respuestas guiadas para modulos (mapa, avatar, horario, oferta, vinculo SIIAU, etc.).

### 4) Contexto conversacional
- Conserva contexto minimo en sesion cliente:
  - ultimo destino consultado
- Soporta referencias como "ahi" o "ese lugar".

## Integracion con microservicio IA (FastAPI)
El backend incluye puente opcional:
- Variable `ASSISTANT_AI_URL`
- Si existe, intenta `POST {ASSISTANT_AI_URL}/assistant/chat`
- Si falla, hace fallback local deterministico (intents/reglas + contexto + datos).

Esto permite evolucionar a NLP/LLM sin cambiar el frontend.

## Enfoque de Computo Flexible defendible
Pipeline recomendado:
1. Deteccion de intencion (navigation/academic/platform/general).
2. Extraccion de entidades (POI, materia, dia, salon).
3. Resolucion de contexto (referencias deicticas: "ahi", "siguiente clase").
4. Enriquecimiento con datos (snapshot, POIs, pathfinding).
5. Generacion de respuesta y acciones UI.

## Metricas sugeridas para evaluacion academica
- Exactitud de intencion (Intent Accuracy).
- Precision de entidad destino (POI Entity Match Rate).
- Tasa de acciones utiles en mapa (Action Success Rate).
- Tiempo promedio de respuesta backend (P95 latency).
- Cobertura de preguntas academicas frecuentes.

## Seguridad
- Endpoint con JWT obligatorio.
- No se guarda NIP en el asistente.
- Solo usa snapshot SIIAU ya sincronizado.
- Contexto conversacional minimo y efimero en cliente.

## Rendimiento y escalabilidad
- Reutiliza snapshot cacheado y evita hits directos a SIIAU.
- Fallback local evita dependencia dura del servicio IA.
- Acciones en mapa son event-driven (sin polling extra).

## Criterios de prueba recomendados
1. Navegacion:
   - "Llevame a biblioteca" -> debe devolver accion `highlight-route`.
2. Contexto:
   - "Como llego a modulo A" seguido de "llevame ahi" -> mantiene destino.
3. Academico:
   - "Que clases tengo hoy" con snapshot ready -> respuesta con materias/horas.
4. Degradacion:
   - Sin `ASSISTANT_AI_URL` -> fallback local responde.
5. Seguridad:
   - Sin token -> endpoint 401.

## Integracion futura mobile (React Native)
- Consumir el mismo endpoint `POST /assistant/chat`.
- Reutilizar contrato JSON (request/response/action).
- Mapear `highlight-route` a accion del mapa mobile.

## Notas
- Esta version implementa un asistente funcional real y modular.
- El siguiente paso para mayor "inteligencia" es mover intent/entity extraction a FastAPI con un modelo NLP dedicado y evaluar metricas automaticamente.
