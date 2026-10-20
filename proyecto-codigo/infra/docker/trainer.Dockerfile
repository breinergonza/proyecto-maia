# syntax=docker/dockerfile:1.7
# Trainer con GPU: CLI maia + núcleo + LightGBM compilado con CUDA. Se construye solo en el equipo con GPU NVIDIA
# (necesita el NVIDIA Container Toolkit para correr). Contexto de build: proyecto-codigo/.
FROM nvidia/cuda:12.6.3-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        git cmake build-essential curl ca-certificates libgomp1 cron tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /uvx /bin/
ENV UV_PYTHON=3.13 UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_PYTHON_INSTALL_DIR=/opt/python \
    MAIA_RAIZ=/datos MAIA_LGBM_DEVICE=cuda MLFLOW_DISABLE_AGENT_HINT=1 TZ=America/Bogota
WORKDIR /app

# 1) dependencias, sin el código del proyecto (capa que se reutiliza entre builds)
COPY pyproject.toml uv.lock ./
COPY nucleo/pyproject.toml nucleo/
COPY plataforma/comun/pyproject.toml plataforma/comun/
COPY plataforma/entrenamiento/pyproject.toml plataforma/entrenamiento/
COPY plataforma/api/pyproject.toml plataforma/api/
RUN uv sync --frozen --no-dev --no-install-workspace --package maia-entrenamiento

# 2) LightGBM compilado con CUDA, la MISMA versión que la API (rueda de CPU): los pickles dependen de ella
RUN uv pip install --python .venv/bin/python --reinstall --no-binary lightgbm \
        -C cmake.define.USE_CUDA=ON "lightgbm==4.7.0"

# 3) el código, sin volver a resolver dependencias
COPY nucleo nucleo
COPY plataforma/comun plataforma/comun
COPY plataforma/entrenamiento plataforma/entrenamiento
RUN uv pip install --python .venv/bin/python --no-deps \
        -e nucleo -e plataforma/comun -e plataforma/entrenamiento

ENV PATH="/app/.venv/bin:$PATH"
VOLUME ["/datos"]
ENTRYPOINT ["maia"]
CMD ["--help"]
