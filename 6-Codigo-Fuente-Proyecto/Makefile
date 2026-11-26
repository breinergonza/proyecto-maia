# Observatorio Canguro (MAIA): tareas del equipo local. Ejecutar desde 6-Codigo-Fuente-Proyecto/.
# "make" sin argumentos muestra la ayuda.

SHELL := /bin/bash
.DEFAULT_GOAL := ayuda
COMPOSE := docker compose --env-file .env -f infra/local/docker-compose.yml
FECHA := $(shell date +%Y-%m-%d_%H%M)
INSUMO ?= ../4-Insumos-Proyecto/insumo-datos

# La CLI "maia" corre en el contenedor trainer (necesita GPU NVIDIA). En un equipo sin NVIDIA (p. ej. macOS) use
# SIN_GPU=1: corre en el equipo con uv, en CPU, contra los servicios del compose publicados en localhost.
SIN_GPU ?= 0
ifeq ($(SIN_GPU),1)
PG_CLAVE := $(shell grep -E '^POSTGRES_PASSWORD=' .env 2>/dev/null | cut -d= -f2 | awk '{print $$1}')
TRAINER := DATABASE_URL=postgresql+psycopg://maia:$(PG_CLAVE)@127.0.0.1:5432/maia \
           MLFLOW_TRACKING_URI=http://127.0.0.1:5000 MINIO_URL=http://127.0.0.1:9000 \
           MAIA_RAIZ=$(CURDIR)/nucleo MAIA_LGBM_DEVICE=cpu MLFLOW_DISABLE_AGENT_HINT=1 uv run --env-file .env maia
WEB_LOCAL := http://localhost:8080
else
TRAINER := $(COMPOSE) --profile entrenamiento run --rm trainer
WEB_LOCAL := http://web:8080
endif

# KMC_PW: de la terminal o, para cron, del llavero (Ubuntu: secret-tool store --label='MAIA KMC' maia kmc_pw;
# macOS: security add-generic-password -s maia -a kmc_pw -w). Nunca en un archivo.
KMC_PW ?= $(shell (command -v secret-tool >/dev/null && secret-tool lookup maia kmc_pw) 2>/dev/null || \
                  (command -v security >/dev/null && security find-generic-password -s maia -a kmc_pw -w) 2>/dev/null)
export KMC_PW

.PHONY: ayuda env verificar-gpu arrancar detener estado registros migrar demo-entrenar demo-exportar demo-publicar \
        corrida corrida-si-hay-corte-nuevo corrida-silencio programador pruebas pruebas-web verificar-todo tipos-web respaldo \
        sincronizar-nucleo parches-nucleo railway-api railway-web

ayuda:  ## esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-28s\033[0m %s\n", $$1, $$2}'

env:  ## crea .env a partir de .env.example (no lo sobrescribe)
	@test -f .env && echo ".env ya existe" || (cp .env.example .env && echo "Creado .env: cambie todo lo que dice 'cambiar'")

# ------------------------------------------------------------------ entorno local

verificar-gpu:  ## comprueba que LightGBM entrena en la GPU dentro del trainer
	$(TRAINER) verificar-gpu

arrancar:  ## levanta postgres, minio, mlflow, mailpit, api y web (http://localhost:8080)
	$(COMPOSE) up -d --build postgres minio minio-init mlflow mailpit api web
	@echo "Web http://localhost:8080 · MLflow http://localhost:5000 · MinIO http://localhost:9001 · Correo http://localhost:8025"

detener:  ## detiene todo (los datos quedan en los volúmenes)
	$(COMPOSE) --profile entrenamiento --profile programador down

estado:  ## servicios y su salud
	$(COMPOSE) ps

registros:  ## últimos registros de la API y la web
	$(COMPOSE) logs --tail 100 api web

migrar:  ## aplica las migraciones de la base (la API también lo hace al arrancar)
	$(COMPOSE) run --rm --no-deps api python -m maia_comun.migraciones

# ------------------------------------------------------------------ datos simulados (para probar y para Railway)

demo-entrenar:  ## cohorte simulada, entrenar los dos modelos y registrarlos en MLflow (alias candidato)
	$(TRAINER) simular --sujetos 5000 --cargar
	$(TRAINER) entrenar anomalias --fuente simulado
	$(TRAINER) entrenar clinico --fuente simulado

demo-exportar:  ## arma y firma el paquete simulado (MinIO maia-paquetes y /datos/paquetes)
	$(TRAINER) exportar --fuente simulado

demo-publicar:  ## sube y activa el último paquete simulado en la web local (VERSION=... para otro)
	$(TRAINER) publicar --url $(WEB_LOCAL) --fuente simulado $(if $(VERSION),--version $(VERSION),)

# ------------------------------------------------------------------ corridas con la base de la Fundación
# Parámetros de extracción opcionales (docs/extraccion.md); solo se pasan los definidos, p. ej.:
#   make corrida FECHA_CORTE=2026-06-30 ANIO_DESDE=2015
FILTROS_KMC := $(if $(FECHA_CORTE),--fecha-corte $(FECHA_CORTE)) $(if $(ANIO_DESDE),--anio-desde $(ANIO_DESDE)) \
               $(if $(ANIO_HASTA),--anio-hasta $(ANIO_HASTA)) $(if $(DESDE_VISITA),--desde-visita $(DESDE_VISITA)) \
               $(if $(HASTA_VISITA),--hasta-visita $(HASTA_VISITA))

corrida:  ## corrida semestral completa con la base real (pide KMC_PW)
	@test -n "$$KMC_PW" || (echo "Defina KMC_PW en la terminal (export KMC_PW=...) o en el llavero" && exit 1)
	$(TRAINER) corrida --fuente kmc $(FILTROS_KMC)

corrida-si-hay-corte-nuevo:  ## igual, pero solo si la base cambió desde el último corte (para cron)
	@test -n "$$KMC_PW" || (echo "Defina KMC_PW en la terminal o en el llavero" && exit 1)
	$(TRAINER) corrida --fuente kmc --solo-si-nuevo $(FILTROS_KMC)

programador:  ## enciende el servicio que ejecuta lo programado en Administración (SIN_GPU=1: en esta terminal)
ifeq ($(SIN_GPU),1)
	$(TRAINER) programador
else
	$(COMPOSE) --profile programador up -d --build programador
	@echo "Programador encendido. Registros: $(COMPOSE) logs -f programador"
endif

corrida-silencio:  ## corrida en silencio: guarda los riesgos sin mostrarlos ni enviar correos
	@test -n "$$KMC_PW" || (echo "Defina KMC_PW en la terminal o en el llavero" && exit 1)
	$(TRAINER) corrida --fuente kmc --silencio $(FILTROS_KMC)

# ------------------------------------------------------------------ calidad

pruebas:  ## pruebas de Python (núcleo, común, entrenamiento, API) con el Postgres del compose
	MAIA_TEST_DATABASE_URL=$${MAIA_TEST_DATABASE_URL:-postgresql://maia:$$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2 | cut -d' ' -f1)@127.0.0.1:5432/postgres} \
	  uv run pytest

pruebas-web:  ## pruebas y compilación del frontend
	cd plataforma/web && npm ci --no-audit --no-fund && npm run pruebas && npm run build

tipos-web:  ## regenera los tipos del frontend desde el OpenAPI de la API
	uv run python -c "import json; from maia_api.main import app; open('infra/openapi.json','w').write(json.dumps(app.openapi(), ensure_ascii=False, indent=1))"
	cd plataforma/web && npm run tipos

verificar-todo: pruebas pruebas-web  ## ruff, pruebas de Python y del frontend
	uv run ruff check .

# ------------------------------------------------------------------ mantenimiento

respaldo:  ## copia de la base (pg_dump) y de los buckets de MinIO en respaldos/ (fuera de git y de Railway)
	mkdir -p respaldos/$(FECHA)
	$(COMPOSE) exec -T postgres pg_dump -U maia -Fc maia > respaldos/$(FECHA)/maia.dump
	$(COMPOSE) exec -T postgres pg_dump -U maia -Fc mlflow > respaldos/$(FECHA)/mlflow.dump
	$(COMPOSE) run --rm --no-deps -v $(CURDIR)/respaldos/$(FECHA):/respaldo --entrypoint /bin/sh minio-init -c \
	  'mc alias set local http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --quiet local /respaldo/minio'
	@echo "Respaldo en respaldos/$(FECHA)"

sincronizar-nucleo:  ## trae la versión nueva de 4-Insumos-Proyecto/insumo-datos (solo lectura) y vuelve a aplicar nucleo/parches
	@test -d "$(INSUMO)" || (echo "No encuentro $(INSUMO); use INSUMO=/ruta/a/insumo-datos" && exit 1)
	# el Diccionario semilla es de la plataforma (D68: solo los desenlaces a 12 meses activos); no se pisa
	rsync -a --exclude '.git' --exclude 'salidas/' --exclude 'interno/' --exclude 'privado/' --exclude '__pycache__/' \
	  --exclude 'entradas/retroalimentacion/' --exclude 'entradas/diccionario.xlsx' --exclude '*.parquet' --exclude '*.pkl' \
	  --exclude 'pyproject.toml' --exclude 'parches/' "$(INSUMO)/" nucleo/
	for p in nucleo/parches/*.patch; do patch -p1 -d nucleo --forward --binary < "$$p" || exit 1; done
	uv run pytest nucleo/pruebas -q

railway-api:  ## despliega la API en Railway (servicio "api"; ver infra/railway/README.md)
	railway up --service api --detach

railway-web:  ## despliega la web en Railway (servicio "web")
	railway up --service web --detach
