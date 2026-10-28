# Extracción de la base de la Fundación

Cómo `maia extraer` y `maia corrida` leen la base de origen del Programa Madre Canguro (esquema `consumo`, solo
lectura) y la convierten en un corte SEVARTI. El código está en
`plataforma/entrenamiento/maia_entrenamiento/fuentes/kmc_postgres.py`. La traducción a SEVARTI sigue siendo la del
núcleo (`sevarti.kmc.borrador`, `sevarti.diccionario.sincronizar`, `sevarti.kmc.to_sevarti`), que la plataforma
llama sin modificarlo.

**Contenido:** [Configuración](#configuración) · [Parámetros](#parámetros) · [Semántica](#semántica) ·
[Seguridad](#seguridad-de-las-consultas) · [Trazabilidad](#trazabilidad) · [Ejemplos](#ejemplos) ·
[Pruebas](#pruebas)

---

## Configuración

Lo más simple es configurar la conexión en **Administración › Configuración** (la clave se guarda cifrada con
`MAIA_CIFRADO_CLAVE`). Para las ejecuciones que lanza el programador, eso reemplaza a las variables de abajo. Sin
conexión guardada, o al correr `maia` a mano, las variables se leen del entorno o de `.env` (`maia_comun.config`).
El servidor y el usuario no tienen valor por defecto: los entrega el Observatorio y no se escriben en el código.

| Variable | Por defecto | Para qué |
|---|---|---|
| `KMC_PW` | (ninguno) | Clave del usuario de solo lectura. **Nunca en `.env`**: se exporta en la terminal o se guarda en el llavero (ver `Makefile`). |
| `KMC_HOST` | (ninguno) | Servidor de la base. Puede ir en `.env`. |
| `KMC_PORT` | `5432` | |
| `KMC_DB` | `postgres` | |
| `KMC_USUARIO` | (ninguno) | El usuario de solo lectura que entregó el Observatorio. Puede ir en `.env`. |
| `KMC_ESQUEMA` | `consumo` | Esquema con `diccionario`, `categoria`, `perfil_paciente` y `variable_restringida`. |
| `KMC_SSLMODE` | `require` | `disable` solo para un Postgres de prueba local. |
| `KMC_TIMEOUT` | `20` | Segundos de espera para conectar. |

Cada sesión es de solo lectura por dos vías: `SET default_transaction_read_only = on` al conectar y
`conn.read_only = True` en psycopg (cada transacción empieza con `BEGIN READ ONLY`). Un `INSERT`, `UPDATE` o `DELETE`
falla aunque el usuario tuviera permisos de escritura.

## Parámetros

Todos son opcionales. Sin ninguno, la extracción trae la base completa, igual que antes.

| CLI | Make | `ParametrosExtraccion` | Qué filtra |
|---|---|---|---|
| `--fecha-corte AAAA-MM-DD` | `FECHA_CORTE` | `fecha_corte` | Lo que se sabía en esa fecha. También es la fecha del corte. |
| `--anio-desde AAAA` | `ANIO_DESDE` | `anio_desde` | Año de nacimiento mínimo (`anio_parto`). |
| `--anio-hasta AAAA` | `ANIO_HASTA` | `anio_hasta` | Año de nacimiento máximo. |
| `--desde-visita AAAA-MM-DD` | `DESDE_VISITA` | `desde` | Solo niños con alguna visita desde esa fecha. |
| `--hasta-visita AAAA-MM-DD` | `HASTA_VISITA` | `hasta` | Ninguna visita posterior entra. |
| (solo pruebas) | | `limite` | Los primeros N niños por `paciente_id`. |

Las combinaciones imposibles se rechazan antes de conectar: `desde` posterior a `hasta` o a la fecha de corte,
`anio_desde` posterior a `anio_hasta` o al año de corte, años fuera de 1980-2100, `limite` menor que 1.

En `maia corrida`, la opción `--desde` **no** es un parámetro de extracción. Sigue siendo el inicio del periodo de
revisión de datos y riesgos. Los parámetros de extracción solo se aceptan con `--fuente kmc` y sin `--sin-extraer`.

## Semántica

La tabla ancha `perfil_paciente` tiene una fila por niño. Desde el 15 de octubre de 2026 no trae la fecha exacta de
nacimiento, solo `anio_parto`. Las fechas de visita son columnas de texto en formato ISO (`v195` salida a casa,
`v195a` entrada al programa, `v215`, `v259`, `v302`, `v345`, `v387` para las visitas de 40 semanas a 12 meses). Qué
columna fecha cada visita lo define la hoja *Visitas* del diccionario de los expertos.

* **Año de nacimiento** (`anio_desde`, `anio_hasta`): se filtra en el servidor
  (`WHERE anio_parto >= %(anio_desde)s ...`). Si la columna es de texto, se convierte a número en la consulta.
* **Tope de fechas** (`hasta`, `fecha_corte`; si vienen los dos, manda el menor). Se aplica en tres pasos:
  1. En el servidor no se piden nacidos en un año posterior al del tope.
  2. Si la fecha de una visita de un niño es posterior al tope, se borran **todos** los datos de esa visita, incluidos
     los que no tienen fecha propia (p. ej. un peso medido a su propia edad dentro de la visita), además de la fecha
     y la edad de la visita. Así no se filtra información que se registró después.
  3. No entran los niños cuya primera fecha conocida es posterior al tope. Tampoco entra ninguna medición fechada
     después del tope (red de seguridad sobre el corte SEVARTI ya armado).
* **Fecha de corte** (`fecha_corte`): además del tope, fija `sev.corte`, que es la fecha del corte en MinIO
  (`cortes/kmc/<fecha>/`) y en `sevarti.cortes`. Sin `fecha_corte`, el corte es, como antes, la última visita
  programada que no pasa de hoy, y nunca después de `hasta`.
* **Desde** (`desde`): selecciona la cohorte. Entran los niños con al menos una visita fechada entre `desde` y el tope,
  y conservan su historia anterior, porque los modelos de anomalías y de riesgo necesitan la trayectoria. Los datos
  anteriores no se borran.
* **Niños sin ninguna fecha**: no los afectan `hasta` ni `fecha_corte`, salvo por el año de nacimiento. Sí los excluye
  `desde`.

Un corte se identifica por fuente y fecha. Dos extracciones con la misma fecha de corte y distintos filtros ocupan
la misma carpeta de MinIO y la misma fila de `sevarti.cortes`: la última reemplaza a la anterior. Su
`extraccion.json` dice qué parámetros produjeron el corte guardado.

## Seguridad de las consultas

* Los valores van siempre como parámetros enlazados (`%(anio_desde)s`, `%(limite)s`, `%(esquema)s`). Ningún texto
  del usuario se concatena en el SQL.
* El esquema, las tablas y las columnas se arman con `psycopg.sql.Identifier`. Un nombre raro queda entre comillas y
  no se ejecuta.
* Antes de leer datos se consulta `<esquema>.variable_restringida`, si existe. Esas columnas y `iden_codigo` no se
  piden: la lista de columnas del `SELECT` sale de `information_schema.columns` sin ellas. Si una vista vieja las
  trajera igual, se descartan antes de cualquier otro paso. El diccionario tampoco las incluye.
* La tabla ancha se lee con un cursor de servidor con nombre, en bloques de 2.000 filas (`itersize`).

## Trazabilidad

Cada extracción devuelve metadatos sin datos por niño y sin la clave:

```json
{
  "parametros": {"fecha_corte": "2026-06-30", "anio_desde": 2015, "anio_hasta": null,
                 "desde": null, "hasta": null, "limite": null},
  "consulta_sha": "<sha256 de todas las consultas, en orden>",
  "consultas": [{"nombre": "perfil_paciente", "sha256": "..."}, "..."],
  "origen": {"host": "...", "puerto": 5432, "db": "postgres", "esquema": "consumo"},
  "columnas_excluidas": ["iden_codigo", "iden_fechaparto", "iden_sede"],
  "filas": {"perfil_paciente": 9120, "excluidos_por_fecha": 210, "sujetos": 8910, "mediciones": 2450000},
  "corte": "2026-06-30"
}
```

Los sha se calculan sobre el texto SQL con los marcadores, no sobre los valores. Dos extracciones con los mismos
filtros activos y valores distintos (p. ej. `anio_desde` 2015 o 2016) tienen el mismo `consulta_sha`. Activar o quitar
un filtro, o que la base agregue una columna, lo cambia.

Dónde queda:

* **MinIO**: `s3://maia-sevarti/cortes/kmc/<fecha>/extraccion.json` (parámetros, `consulta_sha`, origen, sha por
  consulta, columnas excluidas y filas). Entra en el hash del corte (`sha256.txt`), así que no se puede cambiar sin
  invalidarlo. Los cortes simulados no lo llevan y su hash no cambia.
* **Postgres**: `sevarti.cortes.parametros` (JSONB) y `sevarti.cortes.consulta_sha` (migración
  `0002_parametros_corte`). `maia cargar-corte` y `maia corrida` los copian del `extraccion.json`.
* **MLflow**: cada entrenamiento registra los parámetros no vacíos como params `extraccion.*` y la etiqueta
  `consulta_sha`.

## Ejemplos

```bash
export KMC_PW=...                                    # o en el llavero

# Lo que se sabía el 30 de junio de 2026, nacidos desde 2015, y cargarlo en Postgres
maia extraer --fuente kmc --fecha-corte 2026-06-30 --anio-desde 2015 --cargar

# Solo los niños con alguna visita en 2025 (con toda su historia), sin nada posterior a 2025
maia extraer --fuente kmc --desde-visita 2025-01-01 --hasta-visita 2025-12-31

# Corrida semestral con fecha de corte (Make traduce solo las variables definidas)
make corrida FECHA_CORTE=2026-06-30
make corrida-silencio ANIO_DESDE=2015 HASTA_VISITA=2026-06-30
```

Desde Python:

```python
from datetime import date
from maia_entrenamiento import datos
from maia_entrenamiento.fuentes.kmc_postgres import ParametrosExtraccion

sev, meta = datos.extraer_kmc(ParametrosExtraccion(fecha_corte=date(2026, 6, 30), anio_desde=2015))
```

## Pruebas

`plataforma/entrenamiento/pruebas/test_extraccion_kmc.py` tiene dos clases de pruebas:

* Unitarias: validación de los parámetros y texto de cada consulta. Se comprueba que no haya valores interpolados y
  que los nombres vayan como identificadores.
* De integración (`-m integracion`): crean una base con un esquema `consumo` mínimo (ocho niños, uno por año de
  nacimiento entre 2014 y 2021) y verifican cada filtro, la exclusión de restringidas, que un `INSERT` falle, que
  `extraccion.json` y `sevarti.cortes` guarden los parámetros, y `maia extraer` de punta a punta.

Usan el mismo Postgres que el resto de pruebas (`MAIA_TEST_DATABASE_URL` o testcontainers) y se saltan si no hay uno:

```bash
PG_PRUEBA=$(openssl rand -hex 16)
docker run -d --rm --name maia-pg-pruebas -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD="$PG_PRUEBA" postgres:16
MAIA_TEST_DATABASE_URL="postgresql://postgres:$PG_PRUEBA@127.0.0.1:55432/postgres" uv run pytest plataforma -q
```
