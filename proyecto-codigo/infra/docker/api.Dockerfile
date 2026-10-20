# syntax=docker/dockerfile:1.7
# API FastAPI (CPU). La misma imagen corre en local (docker compose) y en Railway. Contexto de build: proyecto-codigo/.
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /bin/

ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 MLFLOW_DISABLE_AGENT_HINT=1 \
    MAIA_RAIZ=/datos MAIA_DIR_PAQUETES=/datos/paquetes
WORKDIR /app

# 1) dependencias (capa que se reutiliza entre builds)
COPY pyproject.toml uv.lock ./
COPY nucleo/pyproject.toml nucleo/
COPY plataforma/comun/pyproject.toml plataforma/comun/
COPY plataforma/entrenamiento/pyproject.toml plataforma/entrenamiento/
COPY plataforma/api/pyproject.toml plataforma/api/
RUN uv sync --frozen --no-dev --no-install-workspace --package maia-api

# 2) el código (sin pruebas ni informes: no hacen falta para servir)
COPY nucleo/sevarti nucleo/sevarti
COPY nucleo/anomalias nucleo/anomalias
COPY nucleo/clinico nucleo/clinico
COPY nucleo/retroalimentacion nucleo/retroalimentacion
COPY nucleo/archivos nucleo/archivos
COPY nucleo/pipeline.py nucleo/README.md nucleo/
COPY plataforma/comun plataforma/comun
COPY plataforma/api plataforma/api
RUN uv sync --frozen --no-dev --package maia-api

RUN useradd --create-home --uid 10001 maia && mkdir -p /datos/paquetes && chown -R maia:maia /datos
USER maia
ENV PATH="/app/.venv/bin:$PATH"
VOLUME ["/datos"]
EXPOSE 8000

# Railway define PORT; en local es 8000. MAIA_HOST="::" (por defecto) escucha en IPv6 e IPv4, como pide la red
# privada de Railway; en el compose local se usa 0.0.0.0.
# Un solo proceso: el paquete de modelos activo vive en memoria. Las semillas (admin, cohorte demo, paquete activo)
# las corre la API al arrancar.
CMD ["sh", "-c", "python -m maia_comun.migraciones && exec uvicorn maia_api.main:app --host ${MAIA_HOST:-::} --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
