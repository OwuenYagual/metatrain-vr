# MetaTrain VR MVP

## 1. Descripción

MetaTrain VR es una aplicación web de capacitación empresarial con un entorno 3D ejecutado en el navegador. En este MVP, “VR” describe una experiencia inmersiva WebGL: no se implementa soporte para gafas ni APIs WebXR.

La capa de interacción está separada de la entrada del usuario para que, en una fase futura, un adaptador WebXR pueda reutilizar los servicios de progreso sin reemplazar la lógica de negocio.

## 2. Alcance del MVP

Este estado del proyecto incluye:

- Registro e inicio de sesión con JWT.
- Tres avatares GLB predefinidos con previsualización 3D.
- Selección persistente de avatar.
- Escenario de inducción 3D con cinco estaciones interactivas sobre políticas, departamentos, personas y funciones del puesto.
- Cinco NPC capacitadores integrados al escenario; cada uno explica el tema mediante globos de texto secuenciales antes de habilitar la actividad práctica.
- Navegación y progreso accesibles desde un menú hamburguesa que deja libre la vista del entorno 3D.
- Oficina corporativa modular con mobiliario 3D low-poly alojado localmente.
- Contenidos asociados mediante `interactionObjectId` estable.
- Actividades de decisiones, exploración del organigrama, secuenciación de tareas y selección de responsabilidades; no se completa una estación leyendo un cuadro de diálogo.
- Registro y recuperación de progreso por módulo.
- Evaluación final de cinco preguntas, calificación segura y reintentos cuando no se alcanza el 70 %.
- Emisión y descarga de un certificado PDF verificable para participantes aprobados.
- Reto de integración que simula tres momentos del primer día laboral con consecuencias y avance persistente.
- Cola offline para reintentar eventos cuando vuelve la conexión.
- Modo de bajo rendimiento al detectar FPS críticos.
- Validación de modelos y pruebas unitarias básicas.

## 3. Requisitos técnicos

- Node.js 22.12 o superior.
- MongoDB local o MongoDB Atlas.
- Navegador moderno con WebGL: Chrome, Edge, Firefox o Safari.
- Resolución recomendada: 1280x720 o superior.

Los avatares de demostración se cargan desde los ejemplos públicos oficiales de Three.js. Antes de un despliegue productivo conviene copiarlos a `public/assets/avatars` y revisar su licencia específica.

El entorno corporativo usa una selección local del [Furniture Kit de Kenney](https://kenney.nl/assets/furniture-kit), publicado bajo licencia [Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/). La licencia y la procedencia también están documentadas en `public/models/office/LICENSE-KENNEY.txt`.

Los nombres de personas y el puesto “Analista de Operaciones” usados en la inducción son datos demostrativos. Deben sustituirse por la estructura y el personal autorizados de la empresa antes de publicar el módulo.

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
  certificate/ Emisión y descarga de certificados
  evaluation/   Preguntas, entrega y recuperación de resultados
  induction/    Actividades interactivas de políticas, organigrama y funciones
  progress/     Recuperación de progreso
  scene/        Escenario, interacción y monitor de FPS
  simulation/   Simulación formativa y recuperación de decisiones
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
| `POST` | `/api/progress/content` | Sí | Marcar contenido como completado. |
| `GET` | `/api/simulation/:moduleId` | Sí | Recuperar escenario y decisiones guardadas. |
| `POST` | `/api/simulation/:moduleId/decisions` | Sí | Validar y guardar una decisión en orden. |
| `GET` | `/api/evaluation/:moduleId/questions` | Sí | Obtener preguntas sin exponer respuestas correctas. |
| `GET` | `/api/evaluation/:moduleId/result` | Sí | Recuperar el resultado más reciente del participante. |
| `POST` | `/api/evaluation/:moduleId/submit` | Sí | Validar, calificar y guardar un intento. |
| `GET` | `/api/certificates/:moduleId` | Sí | Recuperar el certificado emitido. |
| `POST` | `/api/certificates/:moduleId/issue` | Sí | Emitir de forma idempotente un certificado aprobado. |
| `GET` | `/api/certificates/:moduleId/download` | Sí | Descargar el certificado PDF propio. |
| `GET` | `/api/certificates/verify/:certificateId` | No | Verificar la autenticidad mediante su código. |

Las rutas protegidas requieren `Authorization: Bearer <token>`. La identidad siempre se obtiene del JWT; el backend no confía en un `participantId` enviado dentro del cuerpo.

## 10. Flujo funcional

1. El participante crea una cuenta e inicia sesión.
2. El frontend consulta su progreso guardado.
3. Si no hay progreso en curso, muestra los tres avatares 3D.
4. El participante confirma un avatar y entra al módulo.
5. El escenario compone una oficina low-poly con cinco estaciones conectadas por una ruta entrecortada; los tramos pendientes son grises y se pintan de verde al avanzar.
6. La primera estación comienza habilitada; cada estación posterior se desbloquea únicamente al completar y guardar la anterior.
7. El participante sigue la ruta visual e interactúa con el NPC capacitador asignado a la estación disponible.
8. Al abrir una estación, la cámara se acerca suavemente al NPC; al cerrar el panel regresa a la vista general.
9. El guía presenta la información en tres bloques formativos mediante globos anclados al NPC dentro de la escena 3D, con escritura progresiva y pausas breves; solo entonces habilita la actividad práctica.
10. En la práctica, el participante aplica políticas, explora departamentos y personas, organiza las funciones del puesto, selecciona canales de apoyo o construye su tarjeta de responsabilidades.
11. La estación se marca como completada únicamente después de superar su actividad y guardar el resultado.
12. Cada interacción se guarda inmediatamente o queda en la cola offline; la escena distingue las estaciones completadas.
13. Al completar las cinco actividades se habilita el reto de integración.
14. El participante recorre tres momentos de su primer día, decide una acción y observa su consecuencia; el reto no tiene nota.
15. Al completar la simulación se habilita la evaluación final.
16. El servidor valida todas las respuestas, calcula la nota y aprueba desde 70 %.
17. Un resultado no aprobado puede reintentarse; una aprobación queda cerrada y se recupera al volver a iniciar sesión.
18. El participante aprobado puede emitir y descargar un único certificado PDF con código de verificación.
19. Si los FPS permanecen por debajo del umbral crítico, se reduce la calidad de render.

## 11. Criterios de aceptación

- El registro rechaza correos duplicados con HTTP 409.
- La contraseña contiene entre 8 y 128 caracteres y nunca se serializa su hash.
- Solo existen los IDs `avatar_01`, `avatar_02` y `avatar_03`.
- Las opciones de avatar apuntan a archivos `.glb` y se visualizan en 3D.
- Un participante no puede modificar ni consultar datos de otro participante.
- El escenario no solicita modelos locales inexistentes.
- Los contenidos se enlazan por `interactionObjectId`, no por título.
- El recorrido y el progreso contienen exactamente las cinco estaciones publicadas; los registros antiguos no vinculados quedan fuera.
- Una ruta entrecortada conecta las cinco estaciones en el orden pedagógico de la inducción.
- La ruta conserva en gris los tramos pendientes y cambia a verde solamente los segmentos consecutivos completados.
- La cámara enfoca la estación activa mediante una transición, conserva visibles al NPC y el escenario temático, y recupera el encuadre general al cerrarla.
- Cada estación presenta un NPC identificable por nombre y rol, con al menos tres bloques de capacitación antes de mostrar su actividad.
- Los mensajes del NPC aparecen sobre el personaje dentro de la escena 3D, en globos consecutivos con escritura progresiva, velocidad lenta/normal/rápida persistente, una pausa legible y una opción para mostrar el diálogo completo.
- El acceso al progreso y a la lista de estaciones se mantiene contraído en un menú hamburguesa y se cierra al abrir una estación.
- Solo la siguiente estación pendiente muestra el mensaje “Habla con [nombre] sobre [capacitación]”; las futuras permanecen bloqueadas y el servidor impide completarlas fuera de orden.
- El avance guardado muestra actividades superadas, porcentaje y marcadores 3D después de iniciar una nueva sesión.
- Cada objeto abre una actividad contextual junto a la escena y no un modal de lectura con un botón “Comprendido”.
- Una respuesta práctica correcta se resalta en verde; los controles de continuación y guardado reciben foco al aparecer, y la pregunta siguiente recupera el foco al avanzar.
- El organigrama presenta al menos cuatro departamentos, una persona de referencia y un canal de contacto por área.
- Las actividades cubren confidencialidad y convivencia, departamentos y personal, y las funciones del Analista de Operaciones.
- La evaluación no entrega `correctOptionId` al frontend y rechaza preguntas, opciones o respuestas duplicadas inválidas.
- La evaluación permanece bloqueada hasta completar las cinco actividades vigentes.
- La evaluación también exige completar las tres decisiones de la simulación; los resultados emitidos antes de este cambio conservan compatibilidad.
- Las decisiones se guardan en orden y los datos ajenos al escenario activo no cuentan para completarlo.
- La nota y el estado se recuperan después de cerrar e iniciar sesión.
- Un participante no aprobado no puede emitir un certificado y no puede descargar el de otra persona.
- El PDF se genera bajo demanda; la base conserva solo sus metadatos y código único.
- Los eventos fallidos por red se sincronizan al reconectar.
- TypeScript revisa frontend y backend de forma independiente.
- Lint, pruebas y build deben terminar sin errores.

## 12. Limitaciones del MVP

- No se implementa WebXR ni soporte para gafas VR en esta versión.
- No hay multijugador, voz, chat ni avatares personalizados.
- Los tres GLB de avatar se sirven temporalmente desde Three.js; producción debería alojarlos localmente.
- El rate limit usa memoria del proceso; una instalación con varias réplicas requerirá Redis u otro almacenamiento compartido.
- La cola offline conserva como máximo 250 solicitudes y no sustituye una estrategia de sincronización distribuida.
