# Plataforma profesional: entrenadores, fisios y rehabilitación

Documento de seguimiento de la iniciativa que convierte el servidor de openGym en una plataforma
para profesionales (entrenadores y fisioterapeutas) que prescriben y siguen el trabajo de sus
alumnos, incluida la rehabilitación. Recoge las decisiones tomadas en la exploración inicial
(2026-10-17) y la lista de propuestas OpenSpec necesarias, con su estado y dependencias.

No es una spec: cada bloque se convierte en un cambio con `/opsx:propose <nombre>`, y la spec
vive en ese cambio. Este fichero se actualiza cuando una propuesta cambia de estado.

---

## 1. Seguimiento de propuestas

Estado: `pendiente` → `propuesta` (cambio creado) → `en curso` → `hecha` (archivada).

| ID | Cambio OpenSpec              | Vía | Depende de     | Estado    |
|----|------------------------------|-----|----------------|-----------|
| B1 | `console-admin-redesign`     | B   | —              | hecha     |
| B2 | `server-modules-postgres`    | B   | —              | pendiente |
| A1 | `per-set-prescription`       | A   | —              | pendiente |
| A2 | `rehab-self-managed`         | A   | (A1 recomend.) | pendiente |
| B3 | `professional-roles-consent` | B   | B1, B2         | pendiente |
| A3 | `phased-programmes`          | A   | A1, A2, #159   | pendiente |
| B4a| `pro-templates-assignments`  | B   | B3, A1         | pendiente |
| B4b| `pro-shared-library`         | B   | B3, A1         | pendiente |
| B4c| `pro-progress-dashboards`    | B   | B3, A2         | pendiente |
| X1 | `health-data-privacy`        | —   | —  (acompaña a B3) | pendiente |

Tareas sueltas que no son un cambio:

- [ ] Abrir una Discussion upstream con el modelo de prescripción por serie (A1) antes de
      implementarlo, para que #153/#154 nazcan compatibles. Upstream exige CLA (`CLA.md`).
- [ ] Seguir los hitos de upstream v1.4.1 (#159, #57/#140), v1.4.2 (#154) y v1.4.3 (#153):
      tocan el mismo modelo que A1–A3.

```
 dependencias

   B1 ----+                     A1 ----+----------+
          +--> B3 --+--> B4a <--+      |          |
   B2 ----+         +--> B4b <---------+          v
                    +--> B4c <---- A2 ------> A3 (sobre #159 upstream)
   X1 acompaña a B3 (no se publica B3 sin X1)

   Pueden empezar ya y en paralelo: B1, B2, A1, A2
```

---

## 2. Decisiones tomadas

1. **Varios profesionales, cada uno con su cartera de alumnos** en una misma instancia
   (escenario gimnasio / centro), aunque al principio haya uno solo.
2. **Un único rol `professional`**, no "entrenador" y "fisio" por separado. Lo que distingue a un
   profesional es qué ámbitos le concede cada alumno: `training` y/o `health`.
3. **Rehabilitación en ambos modos**: autogestionada por el propio usuario (sin vínculo, nadie
   más ve sus datos) y prescrita por un profesional (vínculo con ámbito `health`).
4. **PostgreSQL** como almacenamiento del servidor.
5. **El backend (`api/`) se separa de upstream**: se reescribe en módulos sin buscar que los
   diffs de upstream sigan aplicando.
6. **El frontend se mantiene cerca de upstream**, con los cambios propios que hagan falta.
   `frontend/src/lib` y el formato del estado del usuario son la frontera a cuidar.
7. **La app del alumno sigue siendo offline-first.** El contrato `GET/PUT /api/data` (`_rev`,
   409 con el estado actual) no cambia.
8. **Las técnicas se registran con números** (opción b): pesos y reps de cada drop, reps
   parciales, etc., con valores precargados para que el alumno solo toque lo que cambia.
9. **El operador (admin) deja de ver historiales.** Solo metadatos de cuenta. Los datos de
   entrenamiento y salud son del alumno y de los profesionales a los que él se los concede.
10. **El AI Coach no prescribe rehabilitación**, y los datos de salud no se le envían sin un
    consentimiento aparte.
11. **Nombres en código**: `professional` / `trainer`, nunca `coach`, que ya es el AI Coach
    (`api/coach/`, `CoachChat.jsx`).

### Preguntas abiertas

- ¿La consola del profesional es solo online? (Recomendado: sí; la app del alumno no.)
- Lista inicial de técnicas del catálogo (ver A1).
- ¿El vínculo profesional–alumno lo crea el admin (modelo hcke), el alumno con un código
  (modelo !79), o ambos? (Recomendado: ambos.)
- ¿Las copias JSON tras migrar a PostgreSQL son snapshot inmutable o se sigue exportando?
  (Recomendado: snapshot inmutable + export explícito, como propone #191.)

---

## 3. Punto de partida (código actual)

- **Administración**: `frontend/src/views/Admin.jsx` (415 líneas) + `AdminCoach.jsx` (497) +
  `frontend/src/admin.css`. Una sola página estrecha de tarjetas, solo en inglés, pensada para
  "mirarse dos veces al año". El detalle de usuario es un bottom sheet.
- **Roles**: solo `isAdmin` (`api/server.js:150`, `user.admin` o `ADMIN_UIDS`). No hay relación
  entre usuarios.
- **Datos**: `db.json` en memoria y síncrono (`db.users` ×32, `saveDb()` ×32 en `server.js`) y un
  `state-<uid>.json` por usuario, escrito por su cliente con `_rev` y 409 en conflicto
  (`api/server.js:2198` en adelante).
- **Otros lectores de `DATA_DIR`**: `api/coach/jobs.js` (su propio `readState`),
  `api/equipment.js`, `api/media.js`, `mcp/src/state.js`. Todos deben pasar por la nueva capa.
- **Privacidad**: `GET /api/admin/user` devuelve el historial completo aunque el texto de la
  página diga que solo se muestran recuentos.
- **Series**: `docs/dev/SET_TYPES.md`. Existen `type: 'dropset' | 'restpause'` (con `drops[]` /
  `clusters[]`), `failure: true` como eje propio, `rir`/`rpe` registrados, pirámide
  (`pyramid`) y back-off (`lib/backoff.js`). El intensificador se planifica por ejercicio
  (`cfg.intensifier`), no por serie.
- **Rehab**: `mode: 'time'`, holds por lado, bandas como equipamiento, categoría `rehab` en el
  catálogo (solo **38** de 6.554 ejercicios), exclusión de progresión por entrada
  (`entryExcluded`, `lib/history.js:327`), etiqueta de día `injured` (`lib/day-notes.js`),
  medidas corporales (`views/Measurements.jsx`).
- **Reutilizable**: `parsePlan` / `mergePlan` (`lib/plan-share.js:223,281`) para aplicar un plan
  recibido; el patrón de catálogo por instancia con caché local de
  `lib/instance-equipment.js` + `api/equipment.js`.

---

## 4. Qué aprovechar de upstream

| Hilo | Qué se toma |
|------|-------------|
| **#191** base de datos (propuesta de kayloehmann) | Diseño de B2 casi entero: migraciones versionadas, `legacy_imports` con checksum, importación en una transacción con comparación estructural, ficheros antiguos intactos, `PUT /api/data` como transacción con bloqueo de `rev`, columna JSON junto a las relacionales para no perder campos de clientes más nuevos. Ellos eligen SQLite; nosotros PostgreSQL. |
| **#119 + GitLab !79** modo entrenador | Ideas, no código (sobre v1.2.14, repo de origen inaccesible): plantillas reutilizables, notas privadas por alumno, saneado en servidor con listas blancas (`cleanPlan`/`cleanRoutine`/`cleanExercise`), aviso de que los ejercicios personalizados no viajan al alumno. Se descarta escribir en el estado del alumno. |
| **#119, comentario de hcke** | Modelo de asignación: el plan queda pendiente en el servidor, el alumno decide Aplicar/Descartar, se aplica con `parsePlan`→`mergePlan`, el profesional nunca escribe en el estado del alumno. El admin nombra profesionales y les asigna alumnos. |
| **#159** programas (v1.4.1) | Base de A3. |
| **#57 / #140** fases y ejercicios "solo completar" (v1.4.1) | Lo usa A2. Se recibe por estar cerca de upstream en frontend. |
| **#154** rangos por serie, AMRAP (v1.4.2) / **#153** objetivo RPE/RIR, %1RM (v1.4.3) | Solapan con A1: coordinar. |
| **#151** ejercicios compartidos entre cuentas | Base de B4b. |
| **#116** escritura por MCP, **#314** MCP remoto | Más adelante (redactar planes con un LLM). Con PostgreSQL, el MCP pasa por la capa de datos. |
| #180 social, !132 OIDC | Fuera de alcance por ahora. OIDC es candidato si un centro lo pide. |

---

## 5. Arquitectura objetivo

### Roles y consentimiento

```
 users.role:  admin (operador) | professional | athlete

 professional_athletes
 +--------------+---------+------------------------------+
 | professional | athlete | scopes (los concede el alumno)|
 +--------------+---------+------------------------------+
 | Laura        | Ana     | training                     |
 | Pedro (fisio)| Ana     | training, health             |
 +--------------+---------+------------------------------+
   training = rutinas, sesiones, cargas, progreso
   health   = dolor, ROM, notas de lesión, adherencia de rehab
```

Un alumno puede tener varios profesionales y retirar un ámbito sin romper el vínculo. Cada acceso
de un profesional a datos de un alumno queda en el audit.

### Almacenamiento (PostgreSQL)

```
 RELACIONAL                                 DOCUMENTO (contrato del cliente)
 users (role), credentials, push_subs,      athlete_state: uid, rev, doc JSONB
 invites, device_links, audit_events          + columnas de identidad/orden por
 professional_athletes (scopes, consent_at)     entidad, con payload JSON (#191)
 routine_templates, assignments                     |
 techniques (catálogo por instancia)                | proyección al escribir
 shared_exercises                                   v
 schema_migrations, legacy_imports          workouts / sets / pain / rom
                                            (lectura para la consola)
```

### Frontera offline-first

```
 CONSOLA (profesional, online)     SERVIDOR               APP ALUMNO (offline-first)
 plantillas, técnicas,       -->   assignments   --sync--> caché en estado local
 asignar semana / programa         techniques    --sync--> catálogo cacheado
                                   shared_exercises         [Aplicar] -> rutinas locales
                                                            entrena SIN red
 progreso, dolor, ROM,       <--   proyección    <--sync--  PUT /api/data (rev / 409)
 adherencia
```

Reglas:

- El alumno nunca necesita red para entrenar ni para registrar.
- Una técnica o campo que una app antigua no conoce sobrevive al viaje de ida y vuelta.
- El profesional nunca escribe en `athlete_state`: propone, el alumno aplica.

---

## 6. Propuestas

### B1 · `console-admin-redesign`

Shell de consola para escritorio (responsive) en `/console/*`, con navegación lateral y
secciones según el rol, y la administración rehecha dentro de él.

- Secciones: Resumen, Usuarios (tabla con búsqueda, orden y filtros), Detalle de usuario como
  página con pestañas (no un sheet), Invitaciones, Equipamiento, AI Coach, Actividad.
- Pequeño sistema de componentes de consola hecho a mano (tabla, barra lateral, página de
  detalle, cabecera de sección). Sin dependencias nuevas en frontend.
- **El operador ve solo metadatos de cuenta** (decisión 9): se recorta `GET /api/admin/user` y
  la exportación por usuario pasa a ser una acción auditada.
- Deja preparado el hueco de navegación para la sección profesional (B3/B4).
- Funciona contra la API actual; no depende de B2.
- Abierto: i18n de la consola (hoy la administración es solo en inglés por diseño).

### B2 · `server-modules-postgres`

- Dividir `api/server.js` (2.778 líneas) en módulos: `auth`, `sync`, `admin`, `push`,
  `equipment`, `media`, `coach`, y más adelante `professional`.
- Capa de repositorio asíncrona única; `api/coach/jobs.js`, `api/equipment.js`, `api/media.js` y
  `mcp/src/state.js` dejan de leer `DATA_DIR` por su cuenta.
- PostgreSQL con migraciones versionadas; dependencia `pg`; tercer contenedor en
  `docker-compose.yml`, Helm y manifiestos de Kubernetes; backups documentados.
- Migración en el primer arranque desde `db.json` + `state-*.json` + datos del Coach, según #191.
- Contrato `/api/data` idéntico (decisión 7): la PWA y la app móvil no cambian.
- Actualizar `docs/SELF_HOSTING*.md` con las nuevas variables de entorno.

### A1 · `per-set-prescription`

Prescripción por serie en tres ejes, más un catálogo de técnicas por arquetipos.

```
 serie = { volumen: reps | rango | amrap | tiempo,
           esfuerzo: rir | rpe | failure,           <- objetivo, no solo registro
           técnicas: [ {id, params} ... ] }          <- 0..n, combinables ("12 + DS")
 peso: NO se prescribe; lo registra el alumno y se sugiere desde su última sesión comparable
```

Arquetipos de técnica (cada técnica declara uno, y con él cómo se registra y cómo cuenta):

| Arquetipo | Ejemplos | Registro | Volumen / 1RM |
|-----------|----------|----------|---------------|
| bajadas de peso | drop set, strip set, mechanical drop | `drops[] {w, r}` | suma drops / no |
| reps extra mismo peso | rest-pause, myo-reps, parciales/LLP, cluster | `clusters[]` o reps extra | según técnica / no |
| ejecución | tempo, pausa, isométrico, 1 y 1/4 | marca, sin números | sin efecto |

- Extensión **aditiva** del `cfg` actual: campos nuevos y opcionales, sin romper
  `intensifier`, `pyramid`, `backoff`, `failure` (ver `docs/dev/SET_TYPES.md`).
- Técnicas integradas en código; las de instancia o profesional llegan en B4b con el mismo patrón
  que `lib/instance-equipment.js`.
- Registro con números y valores precargados (decisión 8).
- Revisar el efecto en `progression.js`, `onerm.js`, `history.js` (`workoutVolume`),
  `recovery.js` y `effort.js`. Con tests en `src/lib`, como exige CONTRIBUTING.
- Coordinar con upstream #154/#153 (tarea suelta de la sección 1).
- Abierto: lista inicial de técnicas. Mencionadas: parciales/LLP, drop set, al fallo, fallo −N.

### A2 · `rehab-self-managed`

Rehabilitación autogestionada, todo en local y offline.

- **Dolor NRS 0–10** por ejercicio y/o por sesión (antes / después), como eje junto a RIR/RPE.
- **ROM**: articulación × movimiento × lado × grados, con evolución que compare lado sano y
  lesionado. Extiende `Measurements` o es una colección hermana.
- **Resistencia no métrica**: nivel o color de banda en lugar de kg.
- **Varias sesiones al día** (protocolos de 2–3 veces al día); hoy el plan admite una por día.
- **"Solo completar"** y exclusión de volumen/PRs: apoyarse en upstream #57/#140 y en
  `excludeFromProgression` / `entryExcluded`.
- Límites de rango en la prescripción ("hasta 90º de abducción") como parámetro del arquetipo
  "ejecución" de A1.
- Ampliar el catálogo de ejercicios `rehab` (hoy 38): hombro (rotaciones, estabilización
  escapular) y tobillo (propiocepción, eversión/inversión) como primer objetivo.
- Los datos de salud viajan en el estado del usuario; con B3 se hacen visibles al profesional
  solo con el ámbito `health`.

### B3 · `professional-roles-consent`

- `users.role` (`admin` / `professional` / `athlete`) y tabla `professional_athletes` con
  ámbitos `training` / `health` y fecha de consentimiento.
- Alta del vínculo: el admin asigna, o el alumno introduce un código del profesional. Cualquiera
  de los dos puede romperlo.
- Autorización en cada ruta profesional por vínculo + ámbito; aislamiento estricto entre carteras.
- Audit de cada acceso de un profesional a datos de un alumno.
- Sección "Profesional" en la consola (B1) con la lista de alumnos.
- No se publica sin X1.

### A3 · `phased-programmes`

- Programas por fases sobre el modelo de programas de upstream (#159).
- Además de "duración en semanas", **puerta de criterios** para avanzar de fase (p. ej. dolor ≤ 2
  y ROM ≥ 150º), útil en rehab y en fuerza.
- Evaluación de criterios como helper puro en `src/lib` con tests.

### B4a · `pro-templates-assignments`

- Biblioteca de plantillas del profesional (rutina, semana, programa) construida en la consola.
- Asignación a un alumno durante un periodo; el plan queda pendiente en el servidor y el alumno
  ve una tarjeta en Plan con Aplicar / Descartar (`parsePlan` → `mergePlan`). Modelo hcke.
- Saneado en servidor con listas blancas (idea de !79).
- Modificar la asignación según la evolución genera una nueva versión pendiente; nunca se escribe
  en el estado del alumno.
- Notas privadas del profesional por alumno.

### B4b · `pro-shared-library`

- Ejercicios personalizados del profesional (con su vídeo e instrucciones) que llegan a sus
  alumnos y se cachean offline. Resuelve el problema de !79 y cubre #151.
- Catálogo de técnicas por instancia/profesional con el patrón de `instance-equipment`
  (arquetipo + parámetros), incluidas propuestas si se quieren.

### B4c · `pro-progress-dashboards`

- Panel por alumno: adherencia (hecho / prescrito), progreso de cargas y 1RM, tendencia de dolor
  y de ROM (solo con ámbito `health`).
- Vista de cartera: quién no entrena, quién tiene dolor al alza.
- Alertas: dolor por encima de un umbral → la app sugiere parar y se avisa al profesional por
  push.
- Consultas sobre la proyección SQL de B2.

### X1 · `health-data-privacy`

Transversal; acompaña a B3.

- Dolor, ROM y lesiones son **datos de salud** (RGPD, art. 9): base legal, consentimiento
  explícito y revocable, registro de accesos, derecho de acceso, exportación y supresión.
- Exclusión de datos de salud del AI Coach (proveedor LLM externo) salvo consentimiento aparte.
- Responsabilidad: la app ejecuta lo que prescribe el profesional, no genera pautas de rehab.
- Revisar `SECURITY.md` y la documentación de self-hosting (cifrado en reposo, backups).
