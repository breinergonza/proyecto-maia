# Despliegue completo on-premise (servidor con GPU)

Todo el sistema en un solo servidor propio (on-premise), administrado con un orquestador de Docker Compose:
Postgres, MinIO, MLflow, el trainer con GPU, la API y la web. El servidor reemplaza al «equipo local» del [README principal](../../README.md): entrena, guarda los cortes
y sirve la aplicación. El archivo es [`docker-compose.on-premise.yml`](../../docker-compose.on-premise.yml).

```
                 Internet ──https──▶ Traefik (proxy)   ──▶ web (nginx + React) ──/api──▶ api (FastAPI)
                                                                                              │
   SSH (túnel) ──▶ 127.0.0.1:5000 MLflow ◀── trainer (GPU) ──▶ Postgres ◀─────────────────────┘
               └─▶ 127.0.0.1:9001 consola MinIO ◀── MinIO ◀───┘
```

| Servicio | Qué hace | ¿Público? |
|---|---|---|
| `web` | React + nginx, proxy de `/api` | Sí, el único (dominio con HTTPS del proxy) |
| `api` | FastAPI | No, solo red interna |
| `postgres` | Datos, resultados, usuarios y la base de MLflow (la crea su initdb) | No |
| `minio` + `minio-init` | Cortes, salidas, paquetes y artefactos de MLflow | Consola en `127.0.0.1:9001` del servidor |
| `mlflow` | Experimentos y registro de modelos | `127.0.0.1:5000` del servidor |
| `trainer` | CLI `maia` con LightGBM CUDA. Queda encendido sin hacer nada; los trabajos se lanzan con `docker exec` | No |

## Antes de empezar: decisiones

1. **Modo de uso** (variable `MAIA_ENTORNO`):

   | Modo | `MAIA_ENTORNO` | `MAIA_SOLO_SIMULADO` | `KMC_PW` | Qué ve la web |
   |---|---|---|---|---|
   | **Operación real** (por defecto) | `produccion` | `false` | sí | Niños reales, detrás de ingreso |
   | **Demostración** | `demo` | `true` | **no** | Cohorte simulada que siembra la API |

   En operación real, los datos de los niños quedan en este servidor y la web es accesible desde Internet (con
   ingreso). Confirme con la Fundación que eso cumple el acuerdo de datos. Si no lo cumple, restrinja el acceso a la
   web (VPN, lista de IP en Traefik) o use el modo demostración.
2. **Imagen de MinIO.** MinIO dejó de publicar `minio/minio` y `minio/mc` en Docker Hub; las etiquetas del compose
   ya no se descargan. Antes del primer despliegue, defina `MINIO_IMAGEN` y `MC_IMAGEN` con una fuente que el equipo
   apruebe (por ejemplo, el fork comunitario `pgsty/minio` / `pgsty/mc`, o una imagen propia construida desde el
   código fuente de MinIO).
3. **Acceso a la base KMC.** El servidor necesita llegar a la base de la Fundación. Si esta filtra por IP, pida que
   agreguen la del servidor.

## Requisitos del servidor

* El orquestador on-premise instalado (panel con soporte de Docker Compose, variables `SERVICE_*`, tareas
  programadas y terminal de contenedores).
* Controlador NVIDIA y el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
  configurado para Docker (`sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`).
  Compruebe con `docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi`.
* Unos 30 GB libres para las imágenes (la del trainer, con CUDA, es la grande) y lo que ocupen los datos.
* 8 GB de RAM o más: el build de LightGBM con CUDA y el entrenamiento son lo más exigente.

## Crear el recurso

1. **Projects → (proyecto) → New → Resource → Private Repository (GitHub App)**, o **Public Repository**:
   `breinergonza/proyecto-maia`, rama `main` (o la rama que se quiera desplegar).
2. **Build Pack:** Docker Compose · **Base Directory:** `/proyecto-codigo` ·
   **Docker Compose Location:** `/docker-compose.on-premise.yml`. Pulse **Reload Compose File**: aparecen siete
   servicios.
3. En el servicio **web**, escriba el dominio (`https://maia.ejemplo.org`). El proxy emite el certificado.
4. **Environment Variables:** el orquestador ya creó las `SERVICE_*` (claves de Postgres, MinIO, MLflow, el secreto JWT, la
   clave de los paquetes y la del administrador). Complete:

   | Variable | Valor |
   |---|---|
   | `MAIA_ADMIN_EMAIL` | Correo de la cuenta de administración (obligatoria) |
   | `MINIO_IMAGEN`, `MC_IMAGEN` | Ver «decisiones», punto 2 |
   | `KMC_PW` | Opcional: mejor guardarla cifrada en **Administración › Configuración** (la web la cifra con `SERVICE_BASE64_64_CIFRADO`, que el orquestador genera como `MAIA_CIFRADO_CLAVE`) |
   | `MLFLOW_URL_PUBLICA` | Enlace a MLflow desde **Administración › Entrenamientos** (por defecto `http://localhost:5000`, el túnel SSH) |
   | `MAIA_ZONA_HORARIA` | Zona de los horarios programados en la web (por defecto `America/Bogota`) |
   | `MAIA_ENTORNO`, `MAIA_SOLO_SIMULADO` | Ver la tabla de modos (por defecto `produccion` / `false`) |
   | `MLFLOW_PUERTO`, `MINIO_CONSOLA_PUERTO` | Solo si 5000 o 9001 ya están ocupados en el servidor |
   | `MLFLOW_USUARIO` | Usuario administrador de MLflow (por defecto `admin`); su clave es `SERVICE_PASSWORD_MLFLOWADMIN` |

   El servidor de correo se configura en la web, en **Notificaciones › Servidor de correo** (la clave se guarda cifrada y requiere `MAIA_CIFRADO_CLAVE`). Para desarrollo con Mailpit: servidor `mailpit`, puerto `1025`, sin TLS. Sin servidor de correo, la app funciona, pero los correos quedan con error.

   La clave del administrador es `SERVICE_PASSWORD_ADMIN` (cópiela del panel). Si define `KMC_PW` aquí, queda guardada
   en la base del orquestador y en el `.env` que este escribe en el servidor: proteja el acceso SSH y el panel.
   `SERVICE_BASE64_64_CIFRADO` no debe cambiar después de guardar la clave en la web (si cambia, hay que escribirla de
   nuevo).
5. **Deploy.** El primer build tarda (compila LightGBM con CUDA). Al terminar, `https://<dominio>/api/salud` debe
   responder `{"db": true, ..., "entorno": "produccion"}`.

## Operar on-premise

El contenedor `trainer` es el **programador** (`maia programador`): ejecuta las corridas que se programan o piden en
**Administración › Programación** y las aprobaciones de modelos de **Administración › Entrenamientos**. La primera
vez: ingrese como administración, guarde la conexión en **Configuración** y cree la programación (por ejemplo, cada
semestre). Sus registros: `docker logs -f $(docker ps -qf name=trainer)`.

Los comandos de la CLI también corren a mano dentro del contenedor `trainer`: desde **Terminal** en el panel (servicio `trainer`), o
por SSH con `docker exec -it $(docker ps -qf name=trainer) maia ...`.

| Tarea | Comando |
|---|---|
| Comprobar la GPU | `maia verificar-gpu` (primera línea: `cuda`) |
| Probar con datos simulados | `maia simular --sujetos 5000 --cargar && maia entrenar anomalias --fuente simulado && maia entrenar clinico --fuente simulado && maia exportar --fuente simulado && maia publicar --url http://api:8000 --fuente simulado` |
| Corrida con la base real | `maia corrida --fuente kmc` |
| Corrida en silencio | `maia corrida --fuente kmc --silencio` |
| Publicar los modelos reales en la API | `maia exportar --fuente kmc && maia publicar --url http://api:8000 --fuente kmc` |

`maia publicar` toma el correo y la clave de administración de las variables del contenedor, así que no las pide.

### Tareas programadas (Scheduled Tasks)

En el recurso, **Scheduled Tasks → Add**:

| Nombre | Servicio | Comando | Frecuencia |
|---|---|---|---|
| Respaldo de Postgres | `postgres` | `sh -c 'pg_dump -U maia -Fc maia > /respaldos/maia_$(date +%F).dump && pg_dump -U maia -Fc mlflow > /respaldos/mlflow_$(date +%F).dump && find /respaldos -name "*.dump" -mtime +60 -delete'` | `0 3 * * *` |

Las corridas ya no van aquí: se programan en la web. La hora de la tarea de respaldo es la zona horaria configurada en
el panel (**Settings → Timezone**). Copie periódicamente el volumen `respaldos` (y el de MinIO) fuera del servidor.

### MLflow y la consola de MinIO

Solo escuchan en el servidor. MLflow además pide usuario y clave (autenticación nativa, `--app-name basic-auth`):
`MLFLOW_USUARIO` (por defecto `admin`) y `SERVICE_PASSWORD_MLFLOWADMIN`. El trainer y la API entran con esas mismas
credenciales. Desde su equipo:

```bash
ssh -N -L 5000:127.0.0.1:5000 -L 9001:127.0.0.1:9001 usuario@servidor
```

Luego abra http://localhost:5000 (MLflow) y http://localhost:9001 (MinIO, usuario `maia`, clave
`SERVICE_PASSWORD_MINIOROOT`).

## Actualizaciones

* **Código:** un push a la rama vuelve a desplegar (con la GitHub App y *Auto Deploy*). La API aplica las migraciones
  al arrancar. El trainer se reconstruye, pero los datos siguen en los volúmenes.
* **Diccionario de los expertos:** vive con versiones en Postgres y se edita en la página **Diccionario**. Antes de cada
  corrida o entrenamiento el trainer baja la versión en uso al volumen. `nucleo/entradas/diccionario.xlsx` solo se
  siembra si la base no tiene ninguna versión: cambiarlo en git no cambia una instalación que ya tiene diccionario.
* **Desenlaces por defecto (D68):** la semilla deja solo desarrollo psicomotor 12 m («En uso») y talla baja 12 m («En
  prueba»). En una instalación que ya tiene diccionario: **Diccionario › Importar desde Excel** con
  `nucleo/entradas/diccionario.xlsx`. Confirme solo si la vista previa muestra únicamente cambios de estado en
  **Desenlaces**; si muestra otros cambios (variables que los expertos ya clasificaron), cancele, use **Exportar a
  Excel**, cambie a «No usar» el estado de los demás desenlaces en la hoja **Desenlaces** e importe ese archivo. Luego
  entrene de nuevo y ejecute una corrida.
* **Regla de referencia de la talla baja (D72):** la semilla compara la talla baja a 12 meses con `z_talla` (el puntaje
  z de talla de la visita del cálculo). En una instalación que ya tiene diccionario: **Diccionario › Desenlaces**, abra
  cada fila `talla_baja_12m_desde_*`, ponga `z_talla` en **Comparar con** y guarde; la vista previa de «Importar desde
  Excel» no lista este cambio. Luego entrene de nuevo: **Modelos › Comparación técnica** dirá «solo talla, puntaje z…».
* **Réplicas:** una por servicio. El paquete activo vive en la memoria de la API.

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| El despliegue falla en `minio` o `minio-init` con «pull access denied» | Imágenes de MinIO retiradas de Docker Hub | Defina `MINIO_IMAGEN` y `MC_IMAGEN` |
| `could not select device driver "nvidia"` | Falta el NVIDIA Container Toolkit | Instálelo, configúrelo para Docker y reinicie Docker |
| `maia verificar-gpu` dice `cpu` | El contenedor no ve la GPU | `nvidia-smi` dentro del trainer; revise el toolkit |
| «Defina valores propios (12 caracteres o más)» | Faltan variables `SERVICE_*` | Vuelva a cargar el compose para que el orquestador las genere |
| 502 en `/api` | La API no está sana | Logs del servicio `api` en el panel |
| MLflow no arranca: «password authentication failed» | El volumen de Postgres se creó antes que `SERVICE_PASSWORD_MLFLOWDB` | `ALTER ROLE mlflow PASSWORD '...'` en la terminal de `postgres` |
| MLflow no arranca: «defina MLFLOW_TRACKING_PASSWORD» / «MLFLOW_FLASK_SERVER_SECRET_KEY» | Faltan `SERVICE_PASSWORD_MLFLOWADMIN` o `SERVICE_BASE64_64_MLFLOWFLASK` | Vuelva a cargar el compose para que el orquestador las genere |
| Entrenamientos: «MLflow rechazó las credenciales» | La clave del admin cambió en el panel después del primer arranque (MLflow solo la usa al crear el usuario) | Cámbiela en MLflow (`POST /api/2.0/mlflow/users/update-password` con la clave anterior) o deje la variable como estaba |
| «No hay un paquete de modelos activo» | No se publicó ninguno | `maia publicar --url http://api:8000 --fuente ...` |
