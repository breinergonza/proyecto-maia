# Proyecto MAIA · KMCPred

**KMCPred: sistema interpretable de alertas y predicción temprana de riesgos en niños prematuros y de bajo peso del
Programa Madre Canguro.** Proyecto de grado de la Maestría en Inteligencia Artificial (Universidad de los Andes), en
colaboración con la Fundación Canguro.

**Contenido:** [Descripción](#descripción-del-proyecto) · [Integrantes](#integrantes) · [Estructura](#estructura-del-repositorio) ·
[Enlaces](#enlaces-relevantes) · [Dependencias](#dependencias) · [Entorno de ejecución](#entorno-de-ejecución) ·
[Credenciales de ejemplo](#credenciales-de-ejemplo) · [Uso básico](#instrucciones-básicas-de-uso) · [Despliegue](#pasos-de-despliegue) · [Ejemplos](#ejemplos-de-uso)

---

## Descripción del proyecto

El seguimiento de niños prematuros y de bajo peso del Programa Madre Canguro produce registros clínicos longitudinales
con datos faltantes, cambios de unidades, errores de captura y modificaciones del sistema de registro (como el de
2022). KMCPred revisa primero la calidad de esos registros y después estima riesgos clínicos con la información
disponible hasta cada visita.

Se desarrolló con el Observatorio Canguro: **62.043 niños, 13.884.056 mediciones y 339 variables catalogadas** (corte
del 24/07/2026), organizadas con el modelo conceptual SEVARTI (*Stages–Episodes–Variables–Topics of Interest*).

La solución tiene dos etapas:

| Etapa | Qué hace | Resultado principal |
|---|---|---|
| **1. Anomalías** | Revisa cada medición en cinco niveles (validez, valores atípicos robustos, LightGBM cuantílico con calibración conformal, trayectoria entre visitas y CUSUM por trimestre) y arma la cola de revisión de los expertos | 83,6 % de los errores sintéticos detectados, con 65,1 alertas por 1.000 registros sin alterar (reglas de rangos: 14,7) |
| **2. Riesgos clínicos** | Clasificadores LightGBM por desenlace y visita, calibración isotónica y explicaciones TreeSHAP; mide el crecimiento contra los estándares OMS | Talla baja a 12 meses EC: AUROC 0,79–0,93 (referencia 0,59–0,61). Desarrollo psicomotor bajo a 12 meses, estimado a los 6 meses: AUROC 0,77 (referencia 0,62) |

La plataforma (API, web, entrenamiento y trazabilidad con MLflow) permite revisar anomalías, consultar el seguimiento
clínico, comparar cohortes y estimar riesgos por niño.

> **Apoyo a la decisión, no diagnóstico.** Los resultados son retrospectivos; se requiere validación clínica
> prospectiva antes de cualquier uso asistencial.

## Integrantes

Maestría en Inteligencia Artificial, Universidad de los Andes (Bogotá, Colombia):

| Nombre | Correo |
|---|---|
| Alex Paul Chirino Caicedo | a.chirino@uniandes.edu.co |
| Breitner Enrique González Angarita | b.gonzalez@uniandes.edu.co |
| Santiago José Ramos Echeverry | s.ramose@uniandes.edu.co |
| Wilfrido Alberto Gómez Pérez | w.gomezp@uniandes.edu.co |

Con el acompañamiento de la Fundación Canguro y del profesor José Tiberio Hernández (responsable de Analítica).

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| [`proyecto-codigo/`](proyecto-codigo/README.md) | Plataforma completa: núcleo de modelos, CLI `maia`, API FastAPI, web React e infraestructura (Docker, Railway, on-premise) |
| `insumo-datos/` | Núcleo de datos y modelos (contrato SEVARTI, anomalías y alertas clínicas) e informes |
| `Modelos/`, `Notebooks/` | Modelos y cuadernos de exploración |
| `insumo-plan/` | Insumos de planeación |
| `avances-1-latex/` | Informe de avance |
| [`informe-final/`](informe-final/README.md) | Informe final en LaTeX (IEEEtran) |
| `proyecto-latex/` | Artículo previo en LaTeX |

## Enlaces relevantes

| Concepto | Enlace |
|---|---|
| Aplicación desplegada | https://maia.canbby.com (instancia pública; el ingreso exige usuario y contraseña) |
| Repositorio | https://github.com/breinergonza/proyecto-maia |
| Informe final (PDF) | [`informe-final/articulo.pdf`](informe-final/articulo.pdf) |
| Manual de usuario | [`proyecto-codigo/docs/manual_usuario.md`](proyecto-codigo/docs/manual_usuario.md) |
| Decisiones técnicas | [`proyecto-codigo/docs/decisiones.md`](proyecto-codigo/docs/decisiones.md) |
| Documentación de la API | `/api/docs` de la aplicación (local: http://localhost:8080/api/docs) |
| Fundación Canguro | [Sitio institucional de la Fundación](https://fundacioncanguro.co/) |
| Estándares de crecimiento OMS | https://www.who.int/tools/child-growth-standards |

## Dependencias

**Sistema** (detalle en [`proyecto-codigo/README.md`](proyecto-codigo/README.md#requisitos)):

- Docker Engine con Compose v2 y `make`.
- [`uv`](https://docs.astral.sh/uv/) ≥ 0.11 para el entorno de Python.
- Node 22 (solo para desarrollar el frontend).
- Para entrenar con GPU: controlador NVIDIA y NVIDIA Container Toolkit.

**Python** (3.13; versiones mínimas declaradas en los `pyproject.toml`):

| Área | Paquetes |
|---|---|
| Datos y base de datos | SQLAlchemy ≥ 2.0.40, psycopg ≥ 3.3, Alembic ≥ 1.16, Pydantic ≥ 2.11, boto3 ≥ 1.40, cryptography ≥ 46 |
| Modelos y trazabilidad | LightGBM, MLflow ≥ 3.4, Typer ≥ 0.16 |
| API | FastAPI ≥ 0.120, Uvicorn ≥ 0.35, PyJWT ≥ 2.10, pwdlib[argon2] ≥ 0.2 |
| Desarrollo | pytest ≥ 9, ruff ≥ 0.15, moto, testcontainers |

**Frontend:** React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, TanStack Query, React Router 7, Recharts 3, Vitest.

**Servicios (contenedores):** PostgreSQL 16, MinIO, MLflow 3, Mailpit, nginx.

Las versiones exactas están fijadas en `proyecto-codigo/uv.lock` y `proyecto-codigo/plataforma/web/package-lock.json`.

## Entorno de ejecución

| | Entrenamiento y operación real | Demostración |
|---|---|---|
| **Dónde** | Equipo o servidor propio (Ubuntu 24.04, GPU NVIDIA) con `docker compose` | Railway (Postgres administrado, API y web) |
| **Datos** | Base real de la Fundación (acceso de solo lectura) y cohortes simuladas | Cohorte simulada |
| **Modelos** | Se entrenan con LightGBM en CUDA | Llegan como paquete firmado (HMAC-SHA256) entrenado con datos simulados |

Sin GPU NVIDIA (macOS u otro equipo) se puede ejecutar en CPU con `SIN_GPU=1`; entrenar con la base completa es mucho
más lento. La instancia desplegada es pública, pero toda la información está detrás del ingreso con usuario y contraseña, con permisos por perfil; ver [Credenciales de ejemplo](#credenciales-de-ejemplo).

## Credenciales de ejemplo

La aplicación **no trae usuarios ni contraseñas fijos**: la cuenta de administración se crea la primera vez que
arranca, con los valores que cada instalación define en su `.env`, y desde ahí se crean los demás usuarios. Por eso
este repositorio no publica credenciales reales: los ambientes de prueba en los que se validó el modelo usaron datos
protegidos por un acuerdo de confidencialidad con la Fundación Canguro, y sus cuentas se entregan solo a las personas
autorizadas.

Para probar la aplicación en una instalación propia (por ejemplo, con la cohorte simulada de `make demo-entrenar`),
defina en `.env` valores como estos (de ejemplo; cámbielos):

| Variable | Ejemplo |
|---|---|
| `MAIA_ADMIN_EMAIL` | `admin@ejemplo.org` |
| `MAIA_ADMIN_CLAVE` | una clave propia de 12 caracteres o más |

Ingrese en http://localhost:8080 con esa cuenta y cree, en *Administración → Usuarios*, una cuenta por perfil:

| Perfil | Qué puede hacer | Usuario de ejemplo |
|---|---|---|
| Administración | Todo: usuarios, corridas, modelos, configuración | `admin@ejemplo.org` |
| Experto clínico | Revisiones y cálculo de riesgo de un niño | `expertoclinico@ejemplo.org` |
| Experto en Datos | Revisión y validación de calidad de los datos | `expertoendatos@ejemplo.org`
| Consulta | Tablero y lista de niños | `consulta@ejemplo.org` |

Las claves de cada cuenta las define quien la crea. La clave de la base de la Fundación (`KMC_PW`) nunca se guarda en
archivos ni imágenes; el acceso a datos reales lo concede la Fundación Canguro.

## Instrucciones básicas de uso

Todo se hace desde `proyecto-codigo/`. La guía completa está en [`proyecto-codigo/README.md`](proyecto-codigo/README.md).

```bash
cd proyecto-codigo
make env              # crea .env; cambie todo lo que dice "cambiar"
make arrancar         # postgres, minio, mlflow, mailpit, api y web
make estado           # todo debe estar "healthy" o "running"
```

| Dirección | Qué es |
|---|---|
| http://localhost:8080 | La aplicación (ingrese con `MAIA_ADMIN_EMAIL` / `MAIA_ADMIN_CLAVE` de `.env`) |
| http://localhost:8080/api/docs | Documentación de la API |
| http://localhost:5000 | MLflow |
| http://localhost:9001 | Consola de MinIO |
| http://localhost:8025 | Mailpit (correos de prueba) |

Para solo recorrer las pantallas (sin MinIO, MLflow ni trainer):
`docker compose -f docker-compose.app.yml up -d --build`. Perfiles: **administración**, **experto clínico**
(revisiones y cálculo de un niño) y **consulta** (tablero y lista de niños).

Otros comandos útiles: `make detener`, `make registros`, `make respaldo`, `make pruebas`, `make verificar-todo`
(`make` sin argumentos lista todo).

## Pasos de despliegue

Primero se monta el equipo local (entrena los modelos) y después la demostración en Railway. El detalle, con la
verificación de cada paso, está en
[`proyecto-codigo/README.md`](proyecto-codigo/README.md#despliegue-completo-paso-a-paso).

1. **Local:** `make env` → editar `.env` → guardar `KMC_PW` en el llavero (nunca en archivos) → `make arrancar` →
   `make verificar-gpu` → crear usuarios en *Administración → Usuarios*.
2. **Modelos simulados:** `make demo-entrenar && make demo-exportar && make demo-publicar`, y luego
   *Administración → Corridas → Ejecutar corrida*.
3. **Base real:** `make corrida` (o `make corrida-silencio` para guardar riesgos sin mostrarlos).
4. **Railway (una vez):** crear proyecto con Postgres, servicios `api` y `web`, volumen `/datos/paquetes`, variables
   (`MAIA_SOLO_SIMULADO=true` y la misma `MAIA_PAQUETE_CLAVE` del `.env` local) y dominio público
   ([`infra/railway/README.md`](proyecto-codigo/infra/railway/README.md)).
5. **Código a Railway:** `make railway-api` y `make railway-web`.
6. **Publicar el paquete simulado** en Railway con `maia publicar --url https://<dominio-web> --fuente simulado`.
7. **Verificar:** `https://<dominio-web>/api/salud` responde `"db": true`; ingresar y ejecutar una corrida.

Alternativa con un solo servidor con GPU:
[`proyecto-codigo/infra/on-premise/README.md`](proyecto-codigo/infra/on-premise/README.md).

## Ejemplos de uso

**Probar con datos simulados (sin acceso a la base real):**

```bash
make demo-entrenar    # 5.000 niños simulados; entrena los dos modelos y los registra en MLflow
make demo-exportar    # arma y firma el paquete
make demo-publicar    # lo activa en la web local
```

**Corrida semestral con la base real:**

```bash
export KMC_PW='...'            # solo en esta terminal
make corrida                   # extrae, entrena, revisa anomalías y calcula riesgos
```

**Sin GPU:**

```bash
uv sync
make arrancar
make demo-entrenar SIN_GPU=1
```

**Consultar la API:**

```bash
curl http://localhost:8080/api/salud      # {"db": true, ..., "entorno": "local"}
```

**Flujo en la aplicación:** el equipo clínico abre *Seguimiento clínico*, filtra una cohorte, abre la ficha de un niño
y calcula su riesgo de talla baja a los 12 meses desde la visita elegida (40 semanas, 3, 6 o 9 meses EC), con el riesgo
estimado, su percentil y las variables que más pesaron (TreeSHAP). Los expertos revisan las alertas en *Datos por
revisar* y *Revisión de riesgos*.

**Informe:** `cd informe-final && latexmk -pdf articulo.tex`.
