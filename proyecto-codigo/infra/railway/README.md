# Despliegue de la demostración en Railway

Railway aloja **solo** la demostración: la web, la API y un Postgres, con niños simulados. Ningún dato real, modelo
entrenado con la base de la Fundación, `.env` ni `KMC_PW` sale del equipo local. La API lo hace cumplir:
con `MAIA_SOLO_SIMULADO=true` rechaza cualquier paquete cuya fuente no sea `simulado`.

```
             Internet
                │ https
        ┌───────▼────────┐   red privada (IPv6)   ┌────────────────┐        ┌──────────┐
        │ web (nginx)    │ ── /api/* ───────────▶ │ api (FastAPI)  │ ─────▶ │ Postgres │
        │ React + proxy  │                        │ volumen        │        │ (Railway)│
        └────────────────┘                        │ /datos/paquetes│        └──────────┘
                                                  └───────▲────────┘
                       equipo local: maia publicar ───────┘  (paquete firmado, solo simulado)
```

## Por qué no hay `railway.json`

El plan original proponía `api.railway.json` y `web.railway.json` (Config as Code). Railway dejó de aceptar Config as
Code en servicios nuevos el 28 de agosto de 2026 y deja de leer esos archivos el 1 de diciembre de 2026. Su reemplazo
(Infrastructure as Code, `.railway/railway.ts`) todavía no documenta cómo construir desde un Dockerfile que no está en
la raíz. Por eso la configuración va en **variables de servicio** (que Railway sí documenta, como
`RAILWAY_DOCKERFILE_PATH`) y en dos ajustes del panel. Todo cabe en los pasos de abajo.

## Una sola vez

Requisitos: la CLI de Railway (`npm i -g @railway/cli`) y una cuenta. Todo se ejecuta desde `proyecto-codigo/`.

```bash
railway login
railway init --name maia-demo            # crea el proyecto
railway add --database postgres           # Postgres administrado
railway add --service api                 # servicio vacío; el código llega con "railway up"
railway add --service web
```

### Variables de `api`

Genere secretos nuevos (no reutilice los de su `.env` salvo `MAIA_PAQUETE_CLAVE`, que **debe** ser la misma con que
firma el equipo local):

```bash
openssl rand -base64 48   # para MAIA_JWT_SECRETO
openssl rand -base64 24   # para MAIA_ADMIN_CLAVE
```

```bash
railway variables --service api \
  --set 'RAILWAY_DOCKERFILE_PATH=infra/docker/api.Dockerfile' \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'PORT=8000' \
  --set 'RAILWAY_RUN_UID=0' \
  --set 'MAIA_ENTORNO=demo' \
  --set 'MAIA_SOLO_SIMULADO=true' \
  --set 'MAIA_DEMO_SUJETOS=3000' \
  --set 'MAIA_DIR_PAQUETES=/datos/paquetes' \
  --set 'MAIA_URL_PUBLICA=https://${{web.RAILWAY_PUBLIC_DOMAIN}}' \
  --set 'MAIA_ADMIN_EMAIL=<correo de administración>' \
  --set 'MAIA_ADMIN_CLAVE=<clave generada>' \
  --set 'MAIA_JWT_SECRETO=<secreto generado>' \
  --set 'MAIA_PAQUETE_CLAVE=<la misma del .env local>'
railway volume add --service api --mount-path /datos/paquetes
```

* `PORT=8000` fija el puerto interno para que la web sepa adónde llamar.
* `RAILWAY_RUN_UID=0`: la imagen corre sin root, pero los volúmenes de Railway se montan como root; con esta variable
  el proceso puede escribir los paquetes subidos.
* El servidor de correo se configura en la web, en **Notificaciones › Servidor de correo** (la clave se guarda cifrada y requiere `MAIA_CIFRADO_CLAVE`). Para desarrollo con Mailpit: servidor `mailpit`, puerto `1025`, sin TLS. Sin servidor de correo la demostración funciona igual; solo fallan los correos (quedan como error en el historial).

### Variables de `web`

```bash
railway variables --service web \
  --set 'RAILWAY_DOCKERFILE_PATH=infra/docker/web.Dockerfile' \
  --set 'MAIA_ENTORNO=demo' \
  --set 'API_INTERNA=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000'
railway domain --service web              # dominio público *.up.railway.app
```

### En el panel de Railway (Settings → Deploy de cada servicio)

| Servicio | Healthcheck path | Réplicas | Restart policy |
|---|---|---|---|
| api | `/api/salud` | 1 (el paquete activo vive en la memoria del proceso) | On failure |
| web | `/config.js` | 1 | On failure |

## Cada despliegue

```bash
make railway-api      # railway up --service api --detach
make railway-web      # railway up --service web --detach
```

`railway up` sube `proyecto-codigo/` sin lo que listan `.gitignore` y `.railwayignore` (datos, modelos, `.env`,
respaldos, `node_modules`). Revise ese archivo antes del primer despliegue.

Al arrancar, la API aplica las migraciones, crea el usuario de administración y siembra una cohorte simulada de
`MAIA_DEMO_SUJETOS` niños.

## Publicar los modelos de demostración

En el equipo local, con los modelos simulados ya entrenados (`make demo-entrenar` y `make demo-exportar`):

```bash
read -rsp 'Clave de administración en Railway: ' RCLAVE; echo
docker compose --env-file .env -f infra/local/docker-compose.yml --profile entrenamiento run --rm \
  -e MAIA_ADMIN_EMAIL=<correo de Railway> -e MAIA_ADMIN_CLAVE="$RCLAVE" \
  trainer publicar --url https://<dominio-web> --fuente simulado
unset RCLAVE
```

Sube el paquete simulado firmado más reciente y lo activa (la clave se lee sin mostrarla y no queda en el historial). Después, en la web:
**Administración → Corridas → Ejecutar corrida**.

## Si algo falla

* **La web responde 502 en `/api`**: revise que `API_INTERNA` tenga el dominio privado y el puerto 8000, y que la API
  esté sana (`railway logs --service api`).
* **"Defina valores propios (12 caracteres o más)"**: la API no arranca en `demo` con secretos de ejemplo.
* **"Este entorno solo acepta modelos entrenados con datos simulados"**: es el comportamiento esperado con un paquete
  de la base real.
* **"La firma no coincide"**: `MAIA_PAQUETE_CLAVE` de Railway es distinta de la del equipo que firmó.
