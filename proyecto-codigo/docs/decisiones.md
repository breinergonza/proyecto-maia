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
| Común | 8 | Postgres real (`MAIA_TEST_DATABASE_URL`) y MinIO simulado (moto) |
| Extracción KMC | 26 | 18 unitarias y 8 contra un esquema `consumo` de prueba en Postgres real |
| Administración de ejecuciones | 19 + 7 + 9 | cron, cifrado, hiperparámetros, cola y conexión (comun); programador con lanzador falso; API con MLflow simulado |
| CLI de entrenamiento | flujo completo | simular → entrenar → registrar → promover → exportar → corrida → silencio |
| API | 10 | paquete firmado real, Postgres real, SMTP de prueba |
| Frontend | 18 | Vitest + Testing Library (5 de las páginas de administración, incluido entrenar ahora) |
