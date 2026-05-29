# Flujos Agregados - Marzo 2026

## 1) Flujo de autenticacion + sincronizacion SIIAU
1. El usuario inicia sesion con codigo y NIP.
2. El backend autentica y genera JWT.
3. Se dispara la sincronizacion de snapshot SIIAU del usuario.
4. El estado de snapshot queda disponible para consulta por sesion.
5. Frontend consume estado con endpoint de session snapshot para render condicional.

## 2) Flujo de snapshot academico cacheado
1. El modulo SIIAU obtiene datos (materias, kardex, sesiones) mediante provider real/fixture.
2. Se normaliza y guarda snapshot por usuario.
3. Endpoints de perfil/academico leen snapshot cacheado (sin pedir NIP nuevamente).
4. Si existe error, se expone estado y mensaje para reintento controlado.

## 3) Flujo de parser de calificaciones (kardex)
1. Se parsean tablas de kardex identificando encabezados de columnas.
2. Se prioriza columna de calificacion por nombre de header.
3. Se aplican heuristicas de respaldo cuando falta header explicito.
4. Se evita confundir ciclo/periodo con calificacion.
5. Se validan casos con pruebas unitarias del provider real.

## 4) Flujo de asistente IA universitario (backend)
1. Cliente envia `POST /assistant/chat` con JWT, mensaje, historial y contexto opcional.
2. El servicio intenta primero integracion externa via `ASSISTANT_AI_URL` (si esta configurada).
3. Si falla o no existe URL externa, usa fallback local por intents.
4. Intents soportadas: navegacion, academico, plataforma, general.
5. Respuesta incluye `reply`, `intent`, `suggestions`, `context` y `action` opcional.
6. Para navegacion puede devolver `action.type = highlight-route` con destino POI.

## 5) Flujo de navegacion asistida por POIs
1. Se obtiene catalogo de POIs activos.
2. Se normaliza consulta del usuario (sin acentos, tokens utiles).
3. Se resuelve destino por match exacto, alias o score por tokens.
4. Se soportan referencias deicticas (ej. "ahi") con contexto previo.
5. Si no hay match, se responde con sugerencias reales del catalogo.

## 6) Flujo de consulta academica conversacional
1. El asistente consulta snapshot de sesion del usuario.
2. Si snapshot no esta listo, responde guia de sincronizacion.
3. Si esta listo, resuelve consultas de promedio, materias cursando, clases hoy/manana y siguiente clase.
4. Responde en lenguaje natural con sugerencias de seguimiento.

## 7) Flujo de recomendacion/ruta en mapa (soft computing)
1. API recibe origen/destino y parametros de preferencia.
2. Se calcula ruta con servicio de pathfinding y/o recomendaciones difusas.
3. Se entrega ruta y metadatos para consumo en frontend.

## Notas de operacion
- El asistente no persiste NIP.
- La informacion academica del chat se basa en snapshot ya sincronizado.
- El endpoint de chat permanece protegido por JWT.
