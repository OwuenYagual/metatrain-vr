# MetaTrain VR MVP

## 1. Descripción

MetaTrain VR es una aplicación web de capacitación empresarial con un entorno 3D ejecutado en el navegador. En este MVP, “VR” describe una experiencia inmersiva WebGL: no se implementa soporte para gafas ni APIs WebXR.

La capa de interacción está separada de la entrada del usuario para que, en una fase futura, un adaptador WebXR pueda reutilizar los servicios de progreso sin reemplazar la lógica de negocio.

## 2. Alcance del MVP

Este estado del proyecto incluye:

- Registro e inicio de sesión con JWT.
- Tres avatares GLB predefinidos con previsualización 3D.
- Selección persistente de avatar.
- Escenario de capacitación 3D con cinco estaciones interactivas.
- Contenidos asociados mediante `interactionObjectId` estable.
- Registro y recuperación de progreso por módulo.
- Cola offline para reintentar eventos cuando vuelve la conexión.
- Modo de bajo rendimiento al detectar FPS críticos.
- Validación de modelos y pruebas unitarias básicas.

## 3. Requisitos técnicos

- Node.js 22.12 o superior.
- MongoDB local o MongoDB Atlas.
- Navegador moderno con WebGL: Chrome, Edge, Firefox o Safari.
- Resolución recomendada: 1280x720 o superior.

Los avatares de demostración se cargan desde los ejemplos públicos oficiales de Three.js. Antes de un despliegue productivo conviene copiarlos a `public/assets/avatars` y revisar su licencia específica.

## 4. Instalación

```bash
npm install
```

Copia `.env.example` como `.env` y reemplaza los valores de desarrollo. Después crea los contenidos y preguntas iniciales:

```bash
npm run seed
```

## 5. Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`. |
| `PORT` | Puerto del backend. |
| `MONGO_URI` | Cadena de conexión de MongoDB. |
| `JWT_SECRET` | Secreto JWT; en producción debe tener al menos 32 caracteres aleatorios. |
| `JWT_EXPIRES_IN_SECONDS` | Duración de la sesión; valor recomendado: `28800`. |
| `CORS_ORIGIN` | Origen permitido del frontend; es obligatorio en producción. |
| `VITE_API_URL` | URL pública de la API usada por Vite. |

`.env` está excluido del control de versiones. Nunca se debe reutilizar el valor de ejemplo en producción.

## 6. Ejecución local

Inicia MongoDB y abre dos terminales:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Comprobaciones disponibles:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Después del build, el backend puede iniciarse sin modo watch mediante `npm start` y el frontend generado se encuentra en `dist/`.

## 7. Usuarios de prueba

El seed no crea credenciales. Registra un participante desde `/register` para evitar contraseñas de prueba compartidas. Un administrador debe crearse de forma controlada en MongoDB cambiando su `role` a `admin`.

## 8. Estructura de carpetas

```text
src/
  api/          Cliente HTTP autenticado
  auth/         Registro, login y sesión
  avatar/       Selector y visor de avatares GLB
  config/       Parámetros centralizados
  content/      Acceso a contenidos
  progress/     Recuperación de progreso
  scene/        Escenario, interacción y monitor de FPS
  store/        Estado de capacitación
  training/     Orquestación del módulo
  utils/        Cola de sincronización offline
server/
  config/       Variables de entorno validadas
  domain/       Contratos de avatar y progreso
  middleware/   Autenticación y rate limiting
  models/       Esquemas Mongoose
  routes/       Endpoints REST
  scripts/      Datos iniciales
  utils/        Validadores y DTOs
tests/          Pruebas unitarias
```

## 9. Endpoints API

| Método | Endpoint | Autenticación | Descripción |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | No | Crear participante. |
| `POST` | `/api/auth/login` | No | Crear sesión JWT. |
| `POST` | `/api/auth/logout` | No | Finalizar sesión cliente. |
| `GET` | `/api/avatars` | No | Listar tres avatares GLB predefinidos. |
| `PATCH` | `/api/participants/:id/avatar` | Sí | Cambiar el avatar propio; admin puede cambiar cualquiera. |
| `GET` | `/api/training/:moduleId/contents` | Sí | Obtener contenidos activos. |
| `GET` | `/api/progress/:participantId?moduleId=...` | Sí | Recuperar progreso propio. |
| `POST` | `/api/progress/interaction` | Sí | Registrar una interacción. |
| `POST` | `/api/progress/checkpoint` | Sí | Registrar un checkpoint. |
| `POST` | `/api/progress/content` | Sí | Marcar contenido como completado. |

Las rutas protegidas requieren `Authorization: Bearer <token>`. La identidad siempre se obtiene del JWT; el backend no confía en un `participantId` enviado dentro del cuerpo.

## 10. Flujo funcional

1. El participante crea una cuenta e inicia sesión.
2. El frontend consulta su progreso guardado.
3. Si no hay progreso en curso, muestra los tres avatares 3D.
4. El participante confirma un avatar y entra al módulo.
5. El escenario carga cinco estaciones livianas y cuatro checkpoints ordenados.
6. El participante visita los checkpoints con el puntero; solo el siguiente punto del recorrido está habilitado.
7. Cada interacción se guarda inmediatamente o queda en la cola offline.
8. Al pulsar “Comprendido”, el contenido se marca como completado.
9. El panel actualiza los dos avances y la escena distingue checkpoints y contenidos completados.
10. Al volver a iniciar sesión, el avance se recupera desde el servidor y se reconstruye la misma vista.
11. Si los FPS permanecen por debajo del umbral crítico, se reduce la calidad de render.

## 11. Criterios de aceptación

- El registro rechaza correos duplicados con HTTP 409.
- La contraseña contiene entre 8 y 128 caracteres y nunca se serializa su hash.
- Solo existen los IDs `avatar_01`, `avatar_02` y `avatar_03`.
- Las opciones de avatar apuntan a archivos `.glb` y se visualizan en 3D.
- Un participante no puede modificar ni consultar datos de otro participante.
- El escenario no solicita modelos locales inexistentes.
- Los contenidos se enlazan por `interactionObjectId`, no por título.
- El recorrido y el progreso contienen exactamente las cinco estaciones publicadas; los registros antiguos no vinculados quedan fuera.
- El recorrido contiene cuatro checkpoints únicos, se visitan en orden y el backend rechaza IDs ajenos al módulo.
- El avance guardado muestra contenidos revisados, porcentaje y marcadores 3D después de iniciar una nueva sesión.
- Los eventos fallidos por red se sincronizan al reconectar.
- TypeScript revisa frontend y backend de forma independiente.
- Lint, pruebas y build deben terminar sin errores.

## 12. Limitaciones del MVP

- No se implementa WebXR ni soporte para gafas VR en esta versión.
- No hay multijugador, voz, chat ni avatares personalizados.
- Los tres GLB de avatar se sirven temporalmente desde Three.js; producción debería alojarlos localmente.
- El rate limit usa memoria del proceso; una instalación con varias réplicas requerirá Redis u otro almacenamiento compartido.
- La cola offline conserva como máximo 250 solicitudes y no sustituye una estrategia de sincronización distribuida.
- Simulación, evaluación completa, generación de certificado y dashboard administrativo permanecen como entregables posteriores de la propuesta técnica.
