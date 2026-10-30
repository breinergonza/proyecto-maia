"""Las seis tablas SEVARTI entre memoria, MinIO (cortes inmutables) y Postgres (el corte vigente).

* ``subir_corte`` guarda un ``Sevarti`` como Parquet (formato de ``sevarti.contrato.guardar``) en
  ``s3://maia-sevarti/cortes/{fuente}/{AAAA-MM-DD}/`` con el hash del conjunto y, si viene de una extracción,
  ``extraccion.json`` (parámetros y sha de las consultas; entra en el hash).
* ``bajar_corte`` trae un corte de MinIO a una carpeta local y ``sevarti.contrato.leer`` lo abre.
* ``guardar_en_db`` carga un corte en el esquema ``sevarti`` con ``COPY`` (el corte real tiene ~14 millones de
  mediciones) y lo deja vigente; el vigente anterior de la misma fuente se borra de Postgres (sigue en MinIO).
* ``leer_de_db`` reconstruye el ``Sevarti`` del corte vigente, completo o solo de algunos niños.
"""
from __future__ import annotations

import hashlib
import io
import json
import tempfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import Engine, delete, select, text, update
from sqlalchemy.orm import Session

from maia_comun.almacen import BUCKET_SEVARTI, Almacen
from maia_comun.modelos_db import Corte, Esquema, Etapa, Quiebre
from sevarti import contrato as SV
from sevarti.contrato import Sevarti

FUENTES = ('kmc', 'simulado')
BLOQUE_COPY = 250_000
EXTRACCION = 'extraccion.json'


@dataclass(frozen=True)
class InfoCorte:
    fuente: str
    fecha: str              # AAAA-MM-DD
    ruta_minio: str
    sha256: str
    filas: dict[str, int]
    parametros: dict | None = None      # de extraccion.json, si el corte salió de una extracción
    consulta_sha: str | None = None


def fecha_corte(sev: Sevarti) -> str:
    return str(pd.Timestamp(sev.corte).date()) if sev.corte is not None else str(date.today())


def hash_carpeta(carpeta: Path) -> str:
    """Hash del conjunto de archivos (nombre y contenido), para saber si dos cortes son el mismo."""
    h = hashlib.sha256()
    for ruta in sorted(p for p in carpeta.rglob('*') if p.is_file()):
        h.update(ruta.relative_to(carpeta).as_posix().encode())
        h.update(hashlib.sha256(ruta.read_bytes()).digest())
    return h.hexdigest()


def _filas(sev: Sevarti) -> dict[str, int]:
    return {t: int(len(getattr(sev, t))) for t in SV.COLUMNAS}


def _validar_fuente(fuente: str) -> None:
    if fuente not in FUENTES:
        raise ValueError(f'Fuente desconocida: {fuente} (válidas: {", ".join(FUENTES)})')


# ================================================================== MinIO

def prefijo_corte(fuente: str, fecha: str) -> str:
    return f'cortes/{fuente}/{fecha}'


def subir_corte(sev: Sevarti, fuente: str, almacen: Almacen, parametros: dict | None = None,
                consulta_sha: str | None = None, detalle: dict | None = None) -> InfoCorte:
    """``parametros``, ``consulta_sha`` y ``detalle`` (p. ej. origen y sha de cada consulta, sin datos por niño ni
    claves) van a ``extraccion.json``; deben ser deterministas, porque entran en el hash del corte."""
    _validar_fuente(fuente)
    fecha = fecha_corte(sev)
    with tempfile.TemporaryDirectory() as tmp:
        carpeta = SV.guardar(sev, Path(tmp) / 'corte')
        if parametros is not None or consulta_sha is not None:
            extraccion = {'parametros': parametros, 'consulta_sha': consulta_sha, **(detalle or {})}
            (carpeta / EXTRACCION).write_text(json.dumps(extraccion, ensure_ascii=False, sort_keys=True, indent=1),
                                              encoding='utf-8')
        sha = hash_carpeta(carpeta)
        (carpeta / 'sha256.txt').write_text(sha, encoding='utf-8')
        uri = almacen.subir_carpeta(carpeta, BUCKET_SEVARTI, prefijo_corte(fuente, fecha))
    return InfoCorte(fuente, fecha, uri, sha, _filas(sev), parametros, consulta_sha)


def leer_extraccion(carpeta: Path) -> dict:
    """El ``extraccion.json`` de un corte bajado (vacío si el corte no salió de una extracción parametrizada)."""
    ruta = carpeta / EXTRACCION
    return json.loads(ruta.read_text(encoding='utf-8')) if ruta.exists() else {}


def cortes_en_minio(almacen: Almacen, fuente: str) -> list[str]:
    """Fechas (AAAA-MM-DD) de los cortes guardados de una fuente, de la más antigua a la más reciente."""
    claves = almacen.listar(BUCKET_SEVARTI, f'cortes/{fuente}/')
    return sorted({c.split('/')[2] for c in claves if c.endswith('corte.json')})


def bajar_corte(almacen: Almacen, fuente: str, destino: Path, fecha: str | None = None) -> tuple[Path, InfoCorte]:
    _validar_fuente(fuente)
    fechas = cortes_en_minio(almacen, fuente)
    if not fechas:
        raise FileNotFoundError(f'No hay cortes de "{fuente}" en MinIO. Primero: maia extraer o maia simular')
    fecha = fecha or fechas[-1]
    if fecha not in fechas:
        raise FileNotFoundError(f'No hay corte de "{fuente}" del {fecha}. Hay: {", ".join(fechas)}')
    carpeta = almacen.bajar_carpeta(BUCKET_SEVARTI, prefijo_corte(fuente, fecha), destino)
    sha_guardado = (carpeta / 'sha256.txt').read_text(encoding='utf-8').strip()
    (carpeta / 'sha256.txt').unlink()
    sha = hash_carpeta(carpeta)
    if sha != sha_guardado:
        raise RuntimeError(f'El corte {fuente}/{fecha} no coincide con su hash: no se usa.')
    filas = _filas(SV.leer(carpeta))
    ext = leer_extraccion(carpeta)
    return carpeta, InfoCorte(fuente, fecha, f's3://{BUCKET_SEVARTI}/{prefijo_corte(fuente, fecha)}/', sha, filas,
                              ext.get('parametros'), ext.get('consulta_sha'))


# ================================================================== Postgres

def _a_csv(df: pd.DataFrame) -> str:
    return df.to_csv(index=False, header=False, date_format='%Y-%m-%d', na_rep='')


def copiar(conexion, tabla: str, columnas: list[str], df: pd.DataFrame) -> None:
    sql = f'COPY {tabla} ({", ".join(columnas)}) FROM STDIN WITH (FORMAT csv)'
    with conexion.cursor() as cur, cur.copy(sql) as copia:
        for i in range(0, len(df), BLOQUE_COPY):
            copia.write(_a_csv(df.iloc[i:i + BLOQUE_COPY][columnas]))


def _fecha(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors='coerce').dt.date


def _json_seguro(v):
    if isinstance(v, (float, np.floating)) and not np.isfinite(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def guardar_en_db(motor: Engine, sev: Sevarti, fuente: str, ruta_minio: str | None = None,
                  sha256: str | None = None, parametros: dict | None = None, consulta_sha: str | None = None) -> int:
    """Carga el corte y lo deja vigente para su fuente. Devuelve el id del corte. ``parametros`` y ``consulta_sha``
    dicen cómo se extrajo (``sevarti.cortes``)."""
    _validar_fuente(fuente)
    fecha = fecha_corte(sev)
    with Session(motor) as s, s.begin():
        anterior = s.scalars(select(Corte).where(Corte.fuente == fuente, Corte.fecha_corte == date.fromisoformat(fecha)))
        for c in anterior:
            s.delete(c)
        s.flush()
        corte = Corte(fuente=fuente, fecha_corte=date.fromisoformat(fecha), ruta_minio=ruta_minio, sha256=sha256,
                      filas=_filas(sev), vigente=False, parametros=parametros, consulta_sha=consulta_sha)
        s.add(corte)
        s.flush()
        cid = corte.id
        cols_esq = [c for c in sev.esquema.columns if c != 'variable']
        s.add_all(Esquema(corte_id=cid, variable=str(r['variable']),
                          datos={c: _json_seguro(r[c]) for c in cols_esq})
                  for r in sev.esquema.to_dict('records'))
        nombres = sev.etapas.nombre if 'nombre' in sev.etapas else pd.Series(None, index=sev.etapas.index)
        s.add_all(Etapa(corte_id=cid, etapa=str(r.etapa), orden=int(r.orden), edad_min=_json_seguro(r.edad_min),
                        edad_max=_json_seguro(r.edad_max), base=str(r.base), nombre=_json_seguro(n))
                  for r, n in zip(sev.etapas.itertuples(), nombres))
        s.add_all(Quiebre(corte_id=cid, quiebre=str(r.quiebre), fecha=pd.Timestamp(r.fecha).date() if pd.notna(r.fecha) else None)
                  for r in sev.quiebres.itertuples())
        s.flush()
        conexion = s.connection().connection.driver_connection   # psycopg 3, dentro de la misma transacción
        suj = sev.sujetos.drop_duplicates('sujeto')
        anio = (suj.anio_nacimiento if 'anio_nacimiento' in suj
                else pd.to_datetime(suj.fecha_nacimiento, errors='coerce').dt.year)
        copiar(conexion, 'sevarti.sujetos', ['corte_id', 'sujeto', 'grupo', 'fecha_nacimiento', 'anio_nacimiento', 'eg_semanas'],
                pd.DataFrame({'corte_id': cid, 'sujeto': suj.sujeto.astype(str),
                              'grupo': suj.grupo.map(lambda g: None if pd.isna(g) else str(g)),
                              'fecha_nacimiento': _fecha(suj.fecha_nacimiento),
                              'anio_nacimiento': pd.to_numeric(anio, errors='coerce').astype('Int64'),
                              'eg_semanas': pd.to_numeric(suj.eg_semanas, errors='coerce')}))
        m = sev.mediciones
        copiar(conexion, 'sevarti.mediciones', ['corte_id', 'id', 'sujeto', 'variable', 'valor', 'fecha', 'edad_dias'],
                pd.DataFrame({'corte_id': cid, 'id': np.arange(1, len(m) + 1), 'sujeto': m.sujeto.astype(str).to_numpy(),
                              'variable': m.variable.astype(str).to_numpy(),
                              'valor': m.valor.map(lambda v: None if pd.isna(v) else str(v)).to_numpy(),
                              'fecha': _fecha(m.fecha).to_numpy(),
                              'edad_dias': pd.to_numeric(m.edad_dias, errors='coerce').to_numpy()}))
        e = sev.episodios
        copiar(conexion, 'sevarti.episodios', ['corte_id', 'id', 'sujeto', 'tipo', 'edad_inicio', 'edad_fin'],
                pd.DataFrame({'corte_id': cid, 'id': np.arange(1, len(e) + 1), 'sujeto': e.sujeto.astype(str).to_numpy(),
                              'tipo': e.tipo.astype(str).to_numpy(),
                              'edad_inicio': pd.to_numeric(e.edad_inicio, errors='coerce').to_numpy(),
                              'edad_fin': pd.to_numeric(e.edad_fin, errors='coerce').to_numpy()}))
        # el vigente anterior de la fuente sale de Postgres (sigue en MinIO)
        viejos = [c for c in s.scalars(select(Corte.id).where(Corte.fuente == fuente, Corte.vigente.is_(True)))]
        if viejos:
            s.execute(delete(Corte).where(Corte.id.in_(viejos)))
        s.execute(update(Corte).where(Corte.id == cid).values(vigente=True))
    return cid


def corte_vigente(s: Session, fuente: str | None = None) -> Corte | None:
    """El corte vigente de una fuente; sin fuente, el más reciente de todos."""
    q = select(Corte).where(Corte.vigente.is_(True))
    if fuente:
        q = q.where(Corte.fuente == fuente)
    return s.scalars(q.order_by(Corte.creado_en.desc())).first()


def _leer_sql(conexion, sql: str, params: dict) -> pd.DataFrame:
    return pd.read_sql_query(text(sql), conexion, params=params)


def leer_de_db(motor: Engine, corte_id: int, sujetos: list[str] | None = None) -> Sevarti:
    """El ``Sevarti`` de un corte guardado; con ``sujetos``, solo esos niños (el esquema y las etapas completos)."""
    filtro = ' AND sujeto = ANY(:sujetos)' if sujetos is not None else ''
    p = {'c': corte_id, 'sujetos': list(sujetos) if sujetos is not None else None}
    with motor.connect() as cx:
        corte = cx.execute(text('SELECT fecha_corte FROM sevarti.cortes WHERE id = :c'), {'c': corte_id}).scalar_one()
        esq = _leer_sql(cx, 'SELECT variable, datos FROM sevarti.esquema WHERE corte_id = :c ORDER BY variable', p)
        etapas = _leer_sql(cx, 'SELECT etapa, orden, edad_min, edad_max, base, nombre FROM sevarti.etapas '
                               'WHERE corte_id = :c ORDER BY orden', p)
        sujetos_df = _leer_sql(cx, 'SELECT sujeto, grupo, fecha_nacimiento, anio_nacimiento, eg_semanas '
                                   f'FROM sevarti.sujetos WHERE corte_id = :c{filtro} ORDER BY sujeto', p)
        med = _leer_sql(cx, 'SELECT sujeto, variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                            f'WHERE corte_id = :c{filtro} ORDER BY id', p)
        epi = _leer_sql(cx, 'SELECT sujeto, tipo, edad_inicio, edad_fin FROM sevarti.episodios '
                            f'WHERE corte_id = :c{filtro} ORDER BY id', p)
        qui = _leer_sql(cx, 'SELECT quiebre, fecha FROM sevarti.quiebres WHERE corte_id = :c ORDER BY fecha', p)
    esquema = pd.DataFrame([{'variable': v, **(d if isinstance(d, dict) else json.loads(d))}
                            for v, d in zip(esq.variable, esq.datos)])
    for c in ('rango_min', 'rango_max', 'tolerancia'):
        if c in esquema:
            esquema[c] = pd.to_numeric(esquema[c], errors='coerce')
    if etapas.nombre.isna().all():
        etapas = etapas.drop(columns='nombre')
    sujetos_df['fecha_nacimiento'] = pd.to_datetime(sujetos_df.fecha_nacimiento).astype('datetime64[ns]')
    if sujetos_df.fecha_nacimiento.notna().all() or sujetos_df.anio_nacimiento.isna().all():
        sujetos_df = sujetos_df.drop(columns='anio_nacimiento')
    for df, cols in ((med, ['fecha']), (qui, ['fecha'])):
        for c in cols:
            df[c] = pd.to_datetime(df[c]).astype('datetime64[ns]')
    med['valor'] = med.valor.astype(object)
    return Sevarti(esquema=esquema, etapas=etapas, sujetos=sujetos_df, mediciones=med, episodios=epi, quiebres=qui,
                   corte=pd.Timestamp(corte))


def sujetos_con_datos(motor: Engine, corte_id: int) -> int:
    with motor.connect() as cx:
        return int(cx.execute(text('SELECT count(*) FROM sevarti.sujetos WHERE corte_id = :c'), {'c': corte_id}).scalar_one())


def eliminar_corte(motor: Engine, corte_id: int) -> None:
    with Session(motor) as s, s.begin():
        s.execute(delete(Corte).where(Corte.id == corte_id))


def guardar_en_carpeta(sev: Sevarti, carpeta: Path) -> Path:
    """El mismo formato de intercambio que usa el núcleo (``--sevarti CARPETA``)."""
    return SV.guardar(sev, carpeta)


def a_bytes_parquet(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    return buf.getvalue()
