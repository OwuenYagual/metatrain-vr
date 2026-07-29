# MetaTrain VR

MetaTrain VR es un campus virtual 3D individual para capacitación empresarial. Funciona en navegadores de escritorio con React, React Three Fiber y Rapier; Express y MongoDB mantienen la autoridad sobre el orden formativo, los desbloqueos, la evaluación y los certificados.

La experiencia es inmersiva WebGL, pero no implementa WebXR ni requiere gafas VR.

## Campus

La ruta canónica es `/campus/:zoneId` y carga una sola zona a la vez:

1. `lobby`: orientación y acceso inicial.
2. `induction-office`: cinco estaciones formativas en orden.
3. `simulation-lab`: disponible después de completar la inducción.
4. `assessment-room`: disponible después de completar la simulación; el certificado requiere una evaluación aprobada.

El manifiesto compartido de `shared/campus.ts` define las versiones, zonas, puntos seguros de aparición, portales, objetos interactivos, ambiente y reglas de acceso. Cliente y servidor consumen los mismos identificadores.

### Controles

| Acción | Tecla |
| --- | --- |
| Caminar | `WASD` o flechas |
| Correr | `Shift` |
| Interactuar | `E` o `Enter` |
| Girar cámara en tercera persona | Arrastrar con el botón izquierdo |
| Cambiar cámara | `V` |
| Cerrar panel/liberar ratón | `Escape` |

La tercera persona es el modo inicial. La primera persona solicita pointer lock de forma explícita. El movimiento se pausa mientras un panel accesible tiene el foco y no se implementa salto.

## Funciones principales

- Cápsula cinemática con colisiones, pendientes, escalones y sensores de proximidad mediante `@react-three/rapier` v2.
- Tres avatares locales con IDs estables `avatar_01`, `avatar_02` y `avatar_03`, normalizados a una escala común y con animaciones `Idle`, `Walk` y `Run`.
- Cámaras de primera y tercera persona con seguimiento y prevención de cruce de paredes.
- HUD con zona, objetivo, progreso, cámara, calidad gráfica y audio.
- Ambiente, pasos, puertas y confirmaciones sintetizados con Web Audio después de una acción del usuario; mute y volumen persisten localmente.
- Narración de los cinco NPC mediante Azure Speech, con subtítulos sobre el personaje, perfiles de voz ecuatorianos y mezcla independiente de ambiente y voz.
- Respuestas de evaluación por micrófono con pulsación sostenida, transcripción temporal y confirmación obligatoria antes de seleccionar una opción.
- Paneles HTML con foco controlado para inducción, simulación, evaluación y certificado.
- Ubicación segura persistida solo al cambiar de zona o completar contenido; nunca se guarda movimiento por frame.
- Cola offline aislada por participante, con `clientEventId` estable e idempotencia en reintentos.
- Escrituras atómicas de progreso y protección para que una aprobación no retroceda.
- Reducción de calidad ante FPS críticos y registros de errores de assets o pérdida del contexto WebGL.

## Requisitos

- Node.js 22.12 o superior.
- npm 10.9 o superior.
- MongoDB local o MongoDB Atlas.
- Navegador de escritorio moderno con WebGL.
- Resolución recomendada: 1280×720 o superior.

## Instalación

```bash
npm ci
```

Copia `.env.example` como `.env`, configura valores de desarrollo y carga el contenido inicial:

```bash
npm run seed
```

Nunca confirmes `.env`, secretos JWT, credenciales de MongoDB ni datos de participantes.

## Desarrollo

Ejecuta frontend y backend en terminales separadas:

```bash
npm run dev:frontend
npm run dev:backend
```

Comprobaciones disponibles:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

El build genera el frontend en `dist/` y el backend compilado en `dist/server/index.js`. En producción, `npm start` usa Node directamente y no depende de `tsx`.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`. |
| `PORT` | Puerto del backend. |
| `MONGO_URI` | Cadena de conexión de MongoDB. |
| `JWT_SECRET` | Secreto JWT; en producción debe tener al menos 32 caracteres aleatorios. |
| `JWT_EXPIRES_IN_SECONDS` | Duración de la sesión; valor recomendado: `28800`. |
| `CORS_ORIGIN` | Origen permitido del frontend; obligatorio en producción. |
| `VITE_API_URL` | URL pública de la API usada por Vite. |
| `AZURE_SPEECH_ENABLED` | Habilita narración y transcripción; puede permanecer en `false` para desarrollo sin Azure. |
| `AZURE_SPEECH_ENDPOINT` | Endpoint del recurso Azure Speech. |
| `AZURE_SPEECH_KEY` | Clave privada de Azure Speech; nunca debe exponerse en Vite ni confirmarse en Git. |
| `AZURE_SPEECH_API_VERSION` | Versión de la API de transcripción rápida. |
| `AZURE_SPEECH_FEMALE_VOICE` | Voz femenina para los perfiles de NPC. |
| `AZURE_SPEECH_MALE_VOICE` | Voz masculina para los perfiles de NPC. |

## Persistencia y versiones

El progreso se identifica por participante, módulo y `moduleVersion`. Los registros anteriores se migran a la versión `1`, conservando contenidos completados, nota, estado, simulación y certificados. También se almacena `worldVersion` y la última `PlayerLocation` segura.

Si una ubicación ya no existe, pertenece a otra versión o continúa bloqueada, la recuperación vuelve al lobby. El servidor valida que cada interacción corresponda al módulo, mundo, zona y objeto activos.

Endpoints principales:

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Registrar participante. |
| `POST` | `/api/auth/login` | Crear sesión JWT. |
| `GET` | `/api/avatars` | Listar los tres avatares locales. |
| `PATCH` | `/api/participants/:id/avatar` | Guardar el avatar autorizado. |
| `GET` | `/api/progress/:participantId` | Recuperar el progreso versionado. |
| `PUT` | `/api/progress/location` | Guardar una ubicación segura de forma idempotente. |
| `POST` | `/api/progress/interaction` | Registrar una interacción idempotente. |
| `POST` | `/api/progress/content` | Completar una estación respetando el orden. |
| `GET/POST` | `/api/simulation/:moduleId/...` | Recuperar y guardar decisiones de simulación. |
| `GET/POST` | `/api/evaluation/:moduleId/...` | Recuperar y calificar la evaluación. |
| `GET/POST` | `/api/certificates/:moduleId/...` | Emitir y descargar el certificado aprobado. |
| `GET` | `/api/speech/capabilities` | Consultar si narración y micrófono están habilitados. |
| `GET` | `/api/speech/narrations/:moduleId/:stationId/:bubbleId` | Obtener una narración autorizada del NPC. |
| `POST` | `/api/speech/transcriptions` | Transcribir temporalmente una respuesta de evaluación. |

Las rutas protegidas usan `Authorization: Bearer <token>` y la identidad se obtiene siempre del JWT.

## Estructura

```text
shared/         Contratos, manifiesto del campus y IDs curriculares
src/campus/     Mundo, jugador, cámaras, HUD, audio y overlays
src/induction/  Actividades de las cinco estaciones
src/simulation/ Reto del primer día
src/evaluation/ Evaluación final
src/progress/   Recuperación y ubicación segura
server/domain/  Reglas autoritativas y validadores
server/models/  Esquemas MongoDB/Mongoose
server/routes/  API REST autenticada
server/migrations/ Migración curricular del progreso
tests/          Pruebas unitarias, integración y E2E
```

## Assets y licencias

Los avatares provienen de **Blocky Characters 2.0** de Kenney y el mobiliario del **Furniture Kit** de Kenney. Ambos se distribuyen bajo Creative Commons CC0 y se alojan en `public/models/`. Cada carpeta contiene la licencia y procedencia correspondiente.

Los nombres, personas y el puesto usados en la inducción son datos demostrativos y deben sustituirse por información corporativa autorizada antes de publicar un módulo real.

## Alcance excluido

Esta versión no incluye multijugador, chat, conversación libre con NPC, WebSocket, WebRTC, WebXR, móvil, NFT, contenido generado por usuarios, editor de mundos, panel administrativo ni multiempresa.
