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
* `nucleo/pyproject.toml` es nuevo (empaqueta el núcleo para el workspace de uv).
* Con los dos parches, las 154 pruebas del núcleo pasan igual que en `insumo-datos`.

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

## Pendiente fuera de este código

* **Decisión f (límites exactos de la OMS para valores improbables).** No está en el núcleo: lo debe definir el
  equipo de `insumo-datos`. Hoy la bandera `improbable` del crecimiento es la que ya calcula el núcleo.

## Lo que no se pudo verificar al escribir el código

El código se escribió y probó en un entorno sin Docker, sin GPU y sin acceso a Docker Hub ni a ghcr.io. Por eso:

* **Las imágenes no se construyeron.** Los pasos de `api.Dockerfile` se reprodujeron fuera de Docker (mismo
  `uv sync --frozen --no-dev --package maia-api`, misma orden de arranque) y la API respondió; la configuración de
  nginx se probó con nginx 1.24 local y el frontend compilado, incluido el proxy, la cookie de sesión y la política de
  seguridad de contenido. La primera `make arrancar` es la verdadera prueba de los Dockerfile.
* **Etiquetas de imágenes sin confirmar:** `minio/minio:RELEASE.2025-09-07T16-13-09Z`,
  `minio/mc:RELEASE.2025-08-13T08-35-41Z` y `axllent/mailpit:v1.27`. Si alguna no existe, use la más reciente de su
  serie y anótelo aquí.
* **La GPU.** El parche de CUDA está probado en su camino de CPU (y con una GPU simulada que falla). Ejecute
  `make verificar-gpu` en el equipo: debe decir `cuda` y medir la diferencia de tiempo.
* **La CLI de Railway.** Los comandos de `infra/railway/README.md` siguen la documentación de octubre de 2026; si la
  CLI cambió, `railway --help` manda.

## Datos de demostración

La cohorte simulada reparte los nacimientos de forma pareja en 14 años. Como el riesgo se calcula en la visita en que
se mide cada desenlace y solo mientras la siguiente no ha pasado, en un corte quedan pocos niños con riesgo vigente
(unos 20 de 2.000). Es el comportamiento correcto, no un error; para una demostración con más niños en la lista de
riesgo, suba `MAIA_DEMO_SUJETOS`.

## Pruebas

| Conjunto | Cantidad | Cómo |
|---|---|---|
| Núcleo | 154 + 1 nueva | `uv run pytest nucleo/pruebas` |
| Común | 8 | Postgres real (`MAIA_TEST_DATABASE_URL`) y MinIO simulado (moto) |
| CLI de entrenamiento | flujo completo | simular → entrenar → registrar → promover → exportar → corrida → silencio |
| API | 10 | paquete firmado real, Postgres real, SMTP de prueba |
| Frontend | 12 | Vitest + Testing Library |
