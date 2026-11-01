# Decisiones de implementación y desvíos del plan

Este archivo registra lo que la implementación decidió por su cuenta, lo que cambió frente al plan
«Plan de implementación: componentes de software» (Notion) y lo que no se pudo verificar en el entorno donde se
escribió el código. Léalo antes de la primera instalación en el equipo con GPU.

## Origen del núcleo

* `nucleo/` es una copia de `insumo-datos/` en el commit `f3224765b0477c5963ea197ec97285bb4cbb9277`
  (19 de octubre de 2026). Los módulos conservan sus nombres (`sevarti`, `anomalias`, `clinico`, `retroalimentacion`,
  `archivos`) porque los modelos guardados con pickle los referencian.
* Cambios sobre esa copia, como parches en `nucleo/parches/` (los vuelve a aplicar `make sincronizar-nucleo`):
  * `01-raiz-configurable.patch`: `archivos/carpetas.py` lee la raíz de datos de `MAIA_RAIZ` (en los contenedores,
    `/datos`).
  * `02-lightgbm-cuda.patch`: `MAIA_LGBM_DEVICE=cuda` entrena LightGBM en la GPU; lo que la GPU no puede entrenar
    vuelve a la CPU con un aviso, y la ficha del modelo registra qué dispositivo se usó. Incluye
    `pruebas/test_dispositivo.py`.
  * `03-limites-oms.patch` (decisión f): un dato de crecimiento va a «revisar el dato» (no al médico) con los límites
    de la OMS por indicador (WHO Anthro / igrowup): talla para la edad < -6 o > +6, peso para la edad < -6 o > +5,
    peso para la talla y perímetro cefálico < -5 o > +5, en lugar de ±6 DE para todos. La hoja «Crecimiento» acepta
    dos columnas opcionales («Dato improbable si z menor/mayor que»); vacías o ausentes usan las de la OMS. Se
    mantienen -2 DE y la caída de 1 DE. Incluye `pruebas/test_limites_oms.py`.
  * `04-decisiones-ab.patch` (decisiones a y b, apagadas por defecto): `MAIA_VENTANAS_REALES=1` toma la ventana de
    cada visita con base corregida del p1 al p99 de la base, recalculada en cada corrida (con menos de 200 niños se
    conserva la del diccionario; `etapas.ventana_fuente` dice cuál se usó). `MAIA_USAR_SEDE_FECHA=1` usa `iden_sede`
    como grupo e `iden_fechaparto` como fecha de nacimiento cuando la base las trae y no están restringidas.
    `iden_codigo` nunca se lee. Al cambiar `MAIA_USAR_SEDE_FECHA` hay que reentrenar el modelo de anomalías (los
    grupos son parte del modelo). Incluye `pruebas/test_decisiones_ab.py`.
* `nucleo/pyproject.toml` es nuevo (empaqueta el núcleo para el workspace de uv).
* Con los cuatro parches, el núcleo pasa 191 pruebas (1 omitida).
* **`nucleo/` está atrasado frente a `insumo-datos`** (2026-10-28): allí ya hay `en_ventana`/`revisar` en
  `clinico/crecimiento.py` y `modelo.py`. Los parches 03 y 04 se generaron contra una copia fresca de `insumo-datos`
  y aplican limpio después de 01 y 02; falta correr `make sincronizar-nucleo` y revisar. Ese objetivo excluye
  `*.parquet`, así que los esperados de `pruebas/esperado_kmc` deben copiarse aparte.

## Versiones

| Pieza | Versión | Nota |
|---|---|---|
| Python | 3.13 | uv 0.11.32 |
| LightGBM | **4.7.0** | El plan decía 4.6. La misma versión en el trainer (compilada con CUDA) y en la API (rueda de CPU): la API rechaza un paquete hecho con otra versión. |
| pandas / numpy | 3.0.6 / 2.5.4 | |
| MLflow | 3.17.1 | El número de versión del registro es entero en MLflow 3; el paquete lo guarda como texto. |
| FastAPI / uvicorn | 0.151.0 / 0.54.0 | |
| SQLAlchemy / Alembic / psycopg | 2.1.5 / 1.20.0 / 3.3.6 | |
| React / Vite / Tailwind | 19.3.1 / 8.3.4 / 4.3.3 | |
| react-router | 7.18.4 | La 7.13 tenía avisos de seguridad (`npm audit`). |
| TypeScript | 5.9.3 | La 7 (compilador nativo) aún no expone la API que usa `openapi-typescript`. |
| Vitest | 5.0.5 | Con la 4.1 `npm install` fallaba por una dependencia opcional. |

Todas las versiones de Python están fijadas en `uv.lock` y las de JavaScript en `plataforma/web/package-lock.json`.

## Desvíos del plan

1. **Railway sin `railway.json`.** Railway dejó de aceptar Config as Code en servicios nuevos (28 de agosto de 2026)
   y deja de leerlo el 1 de diciembre de 2026. La configuración va en variables de servicio
   (`RAILWAY_DOCKERFILE_PATH`, etc.) y dos ajustes del panel. Pasos completos en `infra/railway/README.md`.
2. **Volumen propio de la API en el compose** (`paquetes_api` en `/datos/paquetes`) en vez de compartir `datos_maia`
   con el trainer: la API corre sin root y no necesita ver los datos del trainer.
3. **Escucha IPv6 opcional.** La API usa `MAIA_HOST` (por defecto `::`, como pide la red privada de Railway; `0.0.0.0`
   en el compose). nginx quita `listen [::]` si el contenedor no tiene IPv6.
4. **`KMC_PW` fuera de `.env`.** Se exporta en la terminal o se guarda en el llavero de Ubuntu
   (`secret-tool store --label='MAIA KMC' maia kmc_pw`); el Makefile la toma de ahí para cron. El compose la pasa al
   trainer desde el entorno de la terminal.
5. **`maia publicar` sin `--version`** sube el paquete más reciente de esa fuente en MinIO.
6. **Columnas adicionales en la base** frente al plan, porque la API las necesita: `resultados.corridas` guarda
   `paquete`, `dispositivo` y `paso` (progreso visible en la web); `resultados.alertas_dato` guarda `fuerza` (orden de
   la cola); `sevarti.sujetos` guarda `anio_nacimiento` (para mostrar el año sin la fecha exacta).
7. **Revisión ciega.** Los resultados agregados de la revisión de riesgos solo los ve administración, para no sesgar
   a los expertos mientras responden. El resumen de cada niño omite texto libre (puede traer nombres).
8. **Componentes de interfaz.** En lugar de generar shadcn/ui con su CLI, `plataforma/web/src/components/ui` tiene
   los pocos componentes que se usan, escritos en el mismo estilo (código en el repositorio, Tailwind, sin
   dependencias de Radix).
9. **Modo sin GPU (`SIN_GPU=1`).** El contenedor `trainer` pide una GPU NVIDIA, así que en macOS u otro equipo sin
   ella el `Makefile` corre la CLI en el equipo con `uv run --env-file .env maia`, en CPU, contra los servicios del
   compose en `localhost`. Se probó el flujo simular → entrenar → exportar → publicar con este modo.
10. **Fuente tipográfica.** Atkinson Hyperlegible Next (diseñada para baja visión) desde Google Fonts; si no carga,
   la del sistema.
11. **Extracción parametrizada desde la plataforma.** `nucleo/sevarti/kmc.py` tenía la conexión fija y leía toda la
   base. La plataforma la lee con `maia_entrenamiento/fuentes/kmc_postgres.py`: conexión de `KMC_*`, sesión de solo
   lectura, valores enlazados, identificadores con `psycopg.sql`, sin pedir las columnas restringidas, y reutiliza
   `kmc.borrador` y `kmc.to_sevarti`. `--desde-visita` elige la cohorte y conserva su historia; el tope
   (`--hasta-visita`/`--fecha-corte`) borra las visitas posteriores completas. Los parámetros y el sha de las
   consultas quedan en `extraccion.json` del corte, en `sevarti.cortes` (migración 0002) y en MLflow. Un corte se
   sigue identificando por fuente y fecha: dos extracciones con la misma fecha y filtros distintos se reemplazan.
   Detalle en `docs/extraccion.md`. `maia corrida` ahora carga el corte que acaba de extraer, no el último de MinIO.
12. **Integración continua (2026-10-28).** `.github/workflows/codigo.yml` corre ruff, pytest (Postgres 16 de
   servicio, `MAIA_LGBM_DEVICE=cpu`) y vitest + build del frontend en cada push o PR que toque `proyecto-codigo/`. No
   reemplaza `make verificar-gpu` ni la construcción de las imágenes.

13. **Administración de las ejecuciones (2026-10-28).** El perfil admin configura desde la web lo que antes era
   `.env`, cron y la terminal:
   * **Conexión a la base de la entidad** (`app.conexion_origen`, migración 0003). Reemplaza a `KMC_*` del entorno. La
     clave se guarda cifrada con Fernet; la llave se deriva de `MAIA_CIFRADO_CLAVE`, que vive solo en el entorno del
     servidor (on-premise: `SERVICE_BASE64_64_CIFRADO`). La API nunca devuelve la clave, ni la escribe en la auditoría.
     Solo el programador la descifra, y la pasa como `KMC_PW` al entorno del proceso `maia corrida`. Esto **cambia el
     desvío 4**: `KMC_PW` ya no tiene que estar en la terminal ni en el llavero (sigue valiendo si no hay clave guardada).
     Con `MAIA_SOLO_SIMULADO=true` (Railway) no se configura la base real.
   * **Programaciones** (`app.programaciones`) con expresiones cron de cinco campos (`maia_comun/calendario.py`, sin
     dependencias) en la zona `MAIA_ZONA_HORARIA` (America/Bogota). Los filtros admitidos son `anio_desde`,
     `anio_hasta` y `ventana_meses`; este último se vuelve `--desde-visita` el día de cada ejecución.
   * **Cola** (`app.ejecuciones`). La web y los horarios encolan; el **programador** (`maia programador`) toma una a la
     vez con `FOR UPDATE SKIP LOCKED` y la lanza como un proceso `maia` aparte. Guarda las últimas 200 líneas de la
     salida y el resultado. On-premise es el proceso del contenedor `trainer` (antes `sleep infinity`); en local,
     `make programador`. Las tareas programadas del orquestador quedan solo para el respaldo.
   * **Hiperparámetros** (`app.hiperparametros`). Son una lista cerrada con límites (`maia_comun/hiperparametros.py`).
     `maia entrenar` y `maia corrida` los aplican sobre la configuración del núcleo; `--config` sigue mandando sobre
     ellos. MLflow registra los valores usados (`cfg.*`), el origen (etiqueta `hiperparametros`: `nucleo` o el JSON
     de los ajustes) y la ejecución que lo lanzó (etiquetas `ejecucion` y `programacion`).
   * **Aprobación.** Lo entrenado queda con el alias `candidato`. En **Entrenamientos** (que lee MLflow por su API
     REST, sin instalar mlflow en la API) administración compara versiones y aprueba una de cada modelo. El programador
     las promueve a `produccion` y arma el paquete (`maia exportar`); la API lo baja de MinIO y lo activa (hilo
     `importar-aprobados`, cada 15 s, un solo intento por aprobación). Por eso la API on-premise ahora tiene acceso
     a MinIO y a MLflow.
   * La corrida programada sigue calculando la revisión y los riesgos con los modelos recién entrenados (como la
     corrida semestral de siempre). La aprobación decide qué modelos usan el paquete activo, las corridas desde la
     web y **Calcular un niño**.

14. **Entrenar ahora desde la web (2026-10-28).** Ejecución `entrenamiento` (migración 0004). La pide
   `POST /api/entrenamientos/entrenar` con los modelos, si se traen datos nuevos de la fuente y los hiperparámetros
   escritos en el formulario (validados con la lista cerrada; `guardar` los deja también como ajuste). El
   programador corre `maia extraer` (kmc, con los filtros) o `maia simular`, y luego `maia entrenar <modelo>
   --fecha <corte> --hiperparametros <json>` por modelo. `--hiperparametros` manda sobre los ajustes guardados.
   Mientras corre, `resultado.paso` y `resultado.hechos` dicen el paso; la web consulta cada 4 s y muestra el
   avance y un aviso en el menú. No carga el corte en Postgres ni calcula riesgos (para eso está la corrida): solo
   deja el modelo en MLflow como `candidato`. Un solo entrenamiento en cola o en curso a la vez.

15. **Ajustes para el uso clínico, primera parte (2026-10-30; fase 8 de la lista de chequeo).**
   * **Regla simple:** la comparación con la regla que usa solo las variables que hoy mira el equipo clínico fue una
     prueba interna. Sigue en MLflow (`metricas.interna`), pero ya no va a `resultados.metricas_modelo`, al paquete ni
     a la API; `/modelos` la filtra también en los paquetes armados antes. Se quitó `GET /tablero/desempeno` (lo pedía
     cualquier perfil y mandaba todas las métricas de validación) y el panel del Tablero.
   * **Riesgo alto:** `/tablero/resumen` cuenta niños distintos (`ninos_riesgo_alto`) además del total por desenlace
     (`riesgos_altos`), igual que la lista de niños. El umbral es uno solo: `PERCENTIL_ALTO` en `modelos_db` (90: el
     10 % de mayor riesgo de cada desenlace, una posición relativa y no un umbral clínico) y `RIESGO_ALTO` en la web.
   * **Pantalla de ingreso:** el gráfico de ejemplo ya no habla de «predicción de crecimiento» ni de «riesgo
     moderado», que la plataforma no tiene: muestra el rango OMS, los controles y la caída que sí avisa.
   * **Errores:** `maia_api/errores.py` traduce los errores de validación de Pydantic al español con el nombre visible
     del campo (`detail` es una frase; `errores`, la lista por campo) y responde los 500 sin la traza. El programador
     guarda un mensaje claro para los fallos conocidos (`programador.explicar`) y deja el texto original al final del
     registro, bajo «Detalle técnico».
   * **Interfaz:** las grillas declaran una columna que se puede encoger (`grid-cols-1` y `minmax(0, …fr)`), que es lo
     que hacía salir de la pantalla al Tablero en el celular y cortaba la última columna de Usuarios. Usuarios queda en
     tres columnas con las acciones fijas a la derecha; las alarmas de grupo tienen su propio panel.

16. **Lenguaje clínico (2026-10-30; fase 8, punto 5).** Las pantallas del equipo clínico (Tablero, Niños, Niño, Datos
   por revisar y Revisión de riesgos) y los correos de alerta usan palabras de consulta; el término técnico queda en
   `title` y en Administración. Todo sale de `web/src/lib/lenguaje.ts`, el único lugar que hay que tocar cuando los
   médicos de la Fundación revisen las palabras (pendiente: validarlas con ellos).
   * Posición (percentil) → «N de 10 niños tienen menos riesgo»; ≥ 90 «Riesgo alto», ≥ 95 «Riesgo muy alto». En el
     correo, con la misma escala, «más riesgo que 9 de cada 10 niños».
   * Puntaje z → «Bajo para la edad» (< −2), «En el rango esperado», «Alto para la edad» (> +2); caída de más de
     1 DE → «Cayó desde el último control».
   * Capas → tipos de alerta («Valor fuera de lo esperado», «No cuadra con el resto de sus datos», «Cambio raro entre
     controles», «Cambio en todo un grupo»), y los siete motivos que escribe el motor, en frases clínicas.
   * «Lo que más pesó» sin códigos internos: se quita el `(codigo)` de la etiqueta, `quiebre_X = 1` es «Nació después
     del X» y `z_<medida>_<visita>` se dice frente a la OMS.
   * Corte → «Datos al {fecha}»; corrida → «actualización». El paquete y la corrida solo los ve administración.
   * «Calcular el riesgo de un niño» usa el mismo glosario desde el punto 17.
   * Guardia: `pruebas/lenguaje.test.tsx` pinta esas pantallas como experto y falla si en el texto visible vuelve a
     aparecer «posición», «percentil», «puntaje z», «corte», «corrida», «Capa N», «−2 DE», «AUC» o un código interno.

17. **Calcular el riesgo de un niño con un formulario (2026-10-30; fase 8, punto 6).** Antes era pegar un JSON.
   `GET /api/inferencia/formulario` (experto y administración) arma el formulario con el esquema del paquete activo
   (`sevarti_base/esquema.parquet` y `etapas.parquet`): datos generales (variables sin visita) y cada visita en orden,
   con su ventana de edad, los desenlaces que se calculan con lo medido hasta ella (`momento` de cada modelo) y sus
   campos (etiqueta; tipo número, lista con las categorías del diccionario, sí/no, fecha o texto; unidad y rango
   habitual, solo informativo). Son **principales** las medidas de crecimiento y las 6 variables de cada visita que más
   pesan: la ganancia de LightGBM de cada modelo de desenlace, normalizada por modelo y sumada (las columnas
   `z_<medida>_<visita>` cuentan para las medidas de esa visita). El resto queda plegado. La web arma la misma petición
   de siempre (`POST /api/inferencia` no cambió): `edad_dias` sale de la fecha de nacimiento y la de cada visita; las
   visitas del nacimiento usan la fecha de nacimiento. Las validaciones (fechas, semanas de gestación 20 a 45, números)
   se dicen en español; el rango no bloquea, porque un valor fuera de lo habitual es justo lo que el modelo de
   anomalías debe ver. Los episodios no tienen campos: el JSON queda como «Modo avanzado», solo para administración.
   Los resultados usan el glosario clínico del punto 16.
   El niño de ejemplo se carga hasta la última visita en que se calcula un riesgo (el riesgo sale de la última visita
   con datos), y la página lleva el resultado a la vista al terminar.

18. **El diccionario de variables vive con versiones en la plataforma (2026-10-30; fase 8, punto 2).** El Excel sigue
   siendo el formato de trabajo de los expertos (listas desplegables y validaciones), pero ya no vive en el volumen del
   trainer: se guarda en Postgres (`app.diccionarios`, migración 0005) con número de versión, sha256, estado
   (`vigente`, `borrador`, `archivado`), origen (`subido`, `corrida`, `semilla`), nota y autor. Va en Postgres y no en
   MinIO porque pesa unos 50 KB y la API en Railway no tiene MinIO; un índice único parcial garantiza una sola vigente.
   Toda validación pasa por `sevarti.diccionario.leer`, así que el núcleo sigue siendo la única fuente de reglas; los
   errores se dicen en español con hoja y fila.
   * API `/api/diccionario` (experto y administración): versiones, descargar, comparar antes de subir, subir (409 si es
     igual a la vigente), diferencias, activar o volver a una anterior, variables por clasificar y clasificar rápido
     (Lista o No usar), que crea una versión nueva. Subir, activar y clasificar quedan en la auditoría.
   * Programador: antes de cada corrida o entrenamiento baja la vigente a `MAIA_RAIZ/entradas/diccionario.xlsx` (solo si
     cambió); si la corrida agrega variables nuevas de la base, guarda un borrador y anota `resultado.variables_nuevas`.
     Activar ese borrador suma sus variables nuevas a la vigente, sin deshacer lo que los expertos clasificaron
     mientras tanto. Nada de esto hace fallar la ejecución.
   * Semilla: si la base no tiene ninguna versión, la API o el programador siembran la del núcleo
     (`nucleo/entradas`, ahora también en la imagen de la API). Se quitó el `cp -f` del trainer, que en cada reinicio
     pisaba el archivo y perdía las variables nuevas y los cambios de los expertos.
   * Web: página **Diccionario** (Revisión clínica), insignia en el menú y aviso en el Tablero con las variables por
     clasificar. El menú lateral ahora se desplaza (`min-h-0`): con el enlace nuevo ya no cabía en ventanas de menos de
     ~900 px de alto y escondía Usuarios y Notificaciones detrás de la tarjeta del usuario.
   * En el compose local el trainer monta `nucleo/entradas` como `/datos/entradas`: bajar la vigente escribe en el
     archivo del repositorio cuando difiere de la que está en la base. On-premise no pasa: es un volumen.

19. **Las corridas de la plataforma calculan los riesgos con los modelos aprobados (2026-10-30).** En producción se vio
   que **Corrida ahora** (Programación) volvía a entrenar y calculaba los riesgos con esas versiones recién entrenadas,
   todavía candidatas: la aprobación en Entrenamientos quedaba de adorno. Ahora el programador pasa siempre
   `--usar produccion` a `maia corrida`: los riesgos salen de los modelos con alias `produccion` en MLflow. La pedida a
   mano agrega `--sin-entrenar` (no entrena); la programada sigue entrenando y deja candidatos para aprobar. Sin modelos
   aprobados la corrida falla con un mensaje que dice qué hacer. `maia corrida` sin `--usar` (equipo local) sigue igual.

## Pendiente fuera de este código

* **Primera extracción real con `kmc_postgres`.** Supone que `perfil_paciente` trae `anio_parto`, que `diccionario`
  trae `nombre_corto, tipo, unidades, rango_min, rango_max, subtipo, origen, descripcion` y que el pooler de Supabase
  (modo sesión, puerto 5432) permite cursores de servidor con nombre. Confirmarlo en la primera `make corrida`.
* **Programador en el servidor.** Falta probar on-premise el ciclo completo: guardar la conexión en la web, una
  ejecución programada con la base real, aprobar y ver el paquete activo. En este equipo se probó con un lanzador
  falso y con MLflow simulado.

## Lo que no se pudo verificar al escribir el código

El código se escribió y probó en un entorno sin Docker, sin GPU y sin acceso a Docker Hub ni a ghcr.io. Por eso:

* **Las imágenes no se construyeron.** Los pasos de `api.Dockerfile` se reprodujeron fuera de Docker (mismo
  `uv sync --frozen --no-dev --package maia-api`, misma orden de arranque) y la API respondió; la configuración de
  nginx se probó con nginx 1.24 local y el frontend compilado, incluido el proxy, la cookie de sesión y la política de
  seguridad de contenido. La primera `make arrancar` es la verdadera prueba de los Dockerfile.
* **Etiquetas de imágenes:** `minio/minio` y `minio/mc` ya no existen en Docker Hub (comprobado el 2026-10-27: MinIO
  dejó de publicar imágenes ahí). On-premise y el compose local las eligen con `MINIO_IMAGEN` y `MC_IMAGEN` (por
  defecto, las etiquetas originales, que ya no se descargan) hasta que el equipo apruebe una fuente.
  `axllent/mailpit:v1.27` sin confirmar.
* **La GPU.** El parche de CUDA está probado en su camino de CPU (y con una GPU simulada que falla). Ejecute
  `make verificar-gpu` en el equipo: debe decir `cuda` y medir la diferencia de tiempo.
* **La CLI de Railway.** Los comandos de `infra/railway/README.md` siguen la documentación de octubre de 2026; si la
  CLI cambió, `railway --help` manda.

* **On-premise (2026-10-27).** Se construyeron por primera vez las imágenes de postgres, mlflow, api y web con
  `docker-compose.on-premise.yml` y se levantaron postgres + api + web en `MAIA_ENTORNO=produccion`: salud, initdb de
  MLflow, admin sembrado, ingreso y proxy de nginx correctos. La api no arrancaba con un checkout de permisos 600
  (ahora `chmod -R a+rX /app`). Sin probar: la imagen del trainer (CUDA) y MinIO.

## Datos de demostración

La cohorte simulada reparte los nacimientos de forma pareja en 14 años. Como el riesgo se calcula en la visita en que
se mide cada desenlace y solo mientras la siguiente no ha pasado, en un corte quedan pocos niños con riesgo vigente
(unos 20 de 2.000). Es el comportamiento correcto, no un error; para una demostración con más niños en la lista de
riesgo, suba `MAIA_DEMO_SUJETOS`.

## Pruebas

| Conjunto | Cantidad | Cómo |
|---|---|---|
| Núcleo | 191 (1 omitida) | `uv run pytest nucleo/pruebas` |
| Común | 9 + 1 + 6 | Postgres real (`MAIA_TEST_DATABASE_URL`) y MinIO simulado (moto); buckets de otro usuario de MinIO; texto del correo de alerta; versiones del diccionario |
| Extracción KMC | 26 | 18 unitarias y 8 contra un esquema `consumo` de prueba en Postgres real |
| Administración de ejecuciones | 19 + 9 + 3 + 10 | cron, cifrado, hiperparámetros, cola y conexión (comun); programador con lanzador falso, incluidos los mensajes de los fallos conocidos y el diccionario; API con MLflow simulado |
| CLI de entrenamiento | flujo completo | simular → entrenar → registrar → promover → exportar → corrida → silencio |
| API | 11 + 3 + 6 | paquete firmado real, Postgres real, SMTP de prueba; riesgo alto por niño y sin métricas de la regla simple; errores de validación en español y 500 sin traza; diccionario |
| Frontend | 33 | Vitest + Testing Library (5 de las páginas de administración, incluido entrenar ahora; 8 del glosario clínico y la guardia de términos técnicos; 2 del formulario de cálculo; 5 del diccionario) |
