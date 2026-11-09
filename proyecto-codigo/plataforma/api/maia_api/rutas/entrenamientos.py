"""Entrenamientos registrados en MLflow (solo administración): hiperparámetros, métricas de validación, versión del
registro y sus alias. Aprobar unas versiones candidatas deja una ejecución ``aprobacion`` para el programador, que
las promueve a ``produccion`` y arma el paquete; la API lo importa y lo activa (``trabajos.importar_aprobados``)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from maia_api.dependencias import ADMIN, EXPERTO, auditar, configuracion, sesion
from maia_api.esquemas import (
    AprobacionEntrada,
    ColaEntrenamientos,
    EjecucionSalida,
    Entrenamientos,
    EntrenarAhora,
    Fuente,
    ItemBanco,
    ItemCola,
    LimitesPersona,
)
from maia_comun import cuotas as CU
from maia_comun import ejecuciones as EJ
from maia_comun import hiperparametros as HP
from maia_comun import mlflow_rest as ML
from maia_comun.config import Configuracion
from maia_comun.metricas import interna
from maia_comun.modelos_db import Corte, Ejecucion, Hiperparametro, Usuario
from maia_comun.modelos_muestras import Muestra

ruta = APIRouter(prefix='/entrenamientos', tags=['entrenamientos'])


def _enlace(cfg: Configuracion, e: dict) -> str | None:
    if not cfg.mlflow_url_publica:
        return None
    return f'{cfg.mlflow_url_publica.rstrip("/")}/#/experiments/{e["experimento_id"]}/runs/{e["run_id"]}'


@ruta.get('', response_model=Entrenamientos)
def listar(fuente: Fuente | None = Query(None), limite: int = Query(30, ge=1, le=200),
           cfg: Configuracion = Depends(configuracion), _: Usuario = Depends(ADMIN)) -> Entrenamientos:
    lector = ML.Lector(cfg.mlflow_tracking_uri, cfg.mlflow_tracking_username, cfg.mlflow_tracking_password)
    try:
        datos = {t: lector.entrenamientos(t, fuente, limite) for t in ML.EXPERIMENTOS}
    except ML.MlflowNoDisponible as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    for lista in datos.values():
        for e in lista:
            e['enlace'] = _enlace(cfg, e)
            e['metricas'] = {k: v for k, v in e['metricas'].items() if not interna(k)}
    return Entrenamientos(mlflow_url=cfg.mlflow_url_publica, **datos)


@ruta.post('/aprobar', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def aprobar(datos: AprobacionEntrada, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
            admin: Usuario = Depends(ADMIN)) -> Ejecucion:
    """Promueve las dos versiones a ``produccion``, arma el paquete y lo activa en la solución."""
    if cfg.maia_solo_simulado and datos.fuente == 'kmc':
        raise HTTPException(status.HTTP_409_CONFLICT, 'Este servicio solo trabaja con datos simulados.')
    if s.scalars(select(Ejecucion.id).where(Ejecucion.tipo == 'aprobacion',
                                            Ejecucion.estado.in_(EJ.ACTIVAS))).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya hay una aprobación pendiente o en curso.')
    e = EJ.encolar(s, 'aprobacion', datos.fuente, 'manual',
                   {'anomalias': datos.anomalias, 'clinico': datos.clinico}, None, admin.id)
    auditar(s, admin, 'aprobar_modelos', str(e.id), datos.model_dump())
    s.commit()
    return e


@ruta.post('/entrenar', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def entrenar(datos: EntrenarAhora, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
             usuario: Usuario = Depends(EXPERTO)) -> Ejecucion:
    """Entrena ya (administración y expertos): se pone en la cola y el programador los toma uno por vez, en orden de
    llegada. Un experto entrena modelos personales con los hiperparámetros vigentes y tiene cuota (D17, D40); el
    resultado queda en MLflow como ``candidato`` (u ``personal`` si es personal). El avance se ve en
    ``GET /entrenamientos/cola``."""
    es_admin = usuario.rol == 'admin'
    if cfg.maia_solo_simulado and datos.fuente == 'kmc':
        raise HTTPException(status.HTTP_409_CONFLICT, 'Este servicio solo trabaja con datos simulados.')
    visibilidad = datos.visibilidad or ('oficial' if es_admin else 'personal')
    if not es_admin and visibilidad != 'personal':
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Solo administración entrena modelos oficiales.')
    if not es_admin:
        if EJ.activas_de(s, usuario.id) >= CU.cuota_cola():
            raise HTTPException(status.HTTP_409_CONFLICT,
                                'Ya tiene un entrenamiento en cola o en curso: espere a que termine o cancélelo.')
        if EJ.personales_guardados(s, usuario.id) >= CU.cuota_modelos():
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f'Ya tiene {CU.cuota_modelos()} modelos personales guardados: descarte alguno.')
    extraer = datos.extraer if es_admin else False       # un experto entrena con el corte vigente
    if datos.muestra_id is not None and 'extraer' not in datos.model_fields_set:
        extraer = False                                  # una muestra es del corte vigente: no se extrae aparte
    try:
        hp = {m: HP.validar(m, datos.hiperparametros.get(m, {})) for m in datos.modelos}
        filtros = EJ.validar_parametros(datos.fuente, datos.filtros.model_dump() if extraer else {},
                                        rol=usuario.rol, hiperparametros=datos.hiperparametros)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    if not es_admin and datos.guardar:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Los expertos no cambian los hiperparámetros.')
    if datos.muestra_id is not None:
        if extraer:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                'Una muestra se arma sobre el corte vigente: no se puede combinar con extraer datos nuevos.')
        try:
            EJ.validar_muestra(s, datos.muestra_id, usuario.id, usuario.rol, datos.fuente)
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    parametros = {'modelos': list(dict.fromkeys(datos.modelos)), 'extraer': extraer, 'hiperparametros': hp,
                  'filtros': filtros, 'visibilidad': visibilidad}
    for k in ('nombre', 'descripcion', 'muestra_id'):
        if getattr(datos, k) not in (None, ''):
            parametros[k] = getattr(datos, k)
    if datos.fuente == 'simulado' and datos.sujetos:
        parametros['sujetos'] = datos.sujetos
    if datos.guardar and es_admin:
        for m, valores in hp.items():
            h = s.get(Hiperparametro, m) or Hiperparametro(modelo=m)
            antes = dict(h.valores or {})
            h.valores, h.actualizado_por, h.actualizado_en = valores, usuario.id, EJ.ahora()
            s.add(h)
            auditar(s, usuario, 'ajustar_hiperparametros', m, {'antes': antes, 'despues': valores})
    e = EJ.encolar(s, 'entrenamiento', datos.fuente, 'manual', parametros, None, usuario.id)
    auditar(s, usuario, 'entrenar_ahora', str(e.id), parametros)
    s.commit()
    return e


def _limites(s: Session, u: Usuario) -> LimitesPersona:
    return LimitesPersona(sin_limite=u.rol == 'admin', cola_max=CU.cuota_cola(), cola_usada=EJ.activas_de(s, u.id),
                          modelos_max=CU.cuota_modelos(), modelos_usados=EJ.personales_guardados(s, u.id))


@ruta.get('/cola', response_model=ColaEntrenamientos)
def cola(s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> ColaEntrenamientos:
    """Los entrenamientos en cola o en curso, con su posición y el tiempo estimado, y los límites de esta persona."""
    promedio = EJ.promedio_minutos(s)
    activas = s.execute(select(Ejecucion, Usuario.nombre).outerjoin(Usuario, Usuario.id == Ejecucion.solicitada_por)
                        .where(Ejecucion.tipo == 'entrenamiento', Ejecucion.estado.in_(EJ.ACTIVAS))
                        .order_by(Ejecucion.id)).all()
    items = []
    for e, dueno in activas:
        pos = EJ.posicion_en_cola(s, e) or 0
        p = e.parametros or {}
        items.append(ItemCola(
            id=e.id, estado=e.estado, posicion=pos, estimado_min=None if promedio is None else round(promedio * max(pos, 1), 1),
            propietario=dueno, visibilidad=p.get('visibilidad', 'oficial'), nombre=p.get('nombre'),
            muestra_id=p.get('muestra_id'), creada_en=e.creada_en, propia=e.solicitada_por == u.id,
            cancelable=e.estado == 'pendiente' and (u.rol == 'admin' or e.solicitada_por == u.id)))
    return ColaEntrenamientos(items=items, limites=_limites(s, u), promedio_min=promedio)


@ruta.post('/{ejecucion_id}/cancelar', response_model=EjecucionSalida)
def cancelar(ejecucion_id: int, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> Ejecucion:
    """Cancela un entrenamiento pendiente propio (administración cancela cualquiera); uno en curso no se cancela."""
    e = s.get(Ejecucion, ejecucion_id)
    if e is None or e.tipo != 'entrenamiento':
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe ese entrenamiento.')
    if u.rol != 'admin' and e.solicitada_por != u.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Solo puede cancelar sus propios entrenamientos.')
    hecho = EJ.cancelar(s, ejecucion_id, u.nombre)
    if hecho is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Solo se cancelan los entrenamientos que siguen pendientes.')
    auditar(s, u, 'cancelar_entrenamiento', str(ejecucion_id), {})
    s.commit()
    return hecho


@ruta.post('/{ejecucion_id}/descartar', response_model=EjecucionSalida)
def descartar(ejecucion_id: int, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> Ejecucion:
    """Descarta un modelo personal terminado propio (libera un lugar de la cuota; administración puede con cualquiera)."""
    e = s.get(Ejecucion, ejecucion_id)
    if e is None or e.tipo != 'entrenamiento' or e.estado != 'ok' or not EJ.es_personal(e):
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe ese modelo personal.')
    if u.rol != 'admin' and e.solicitada_por != u.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Solo puede descartar sus propios modelos.')
    e.parametros = {**(e.parametros or {}), 'descartado': True}
    auditar(s, u, 'descartar_modelo_personal', str(ejecucion_id), {})
    s.commit()
    return e


@ruta.get('/banco', response_model=list[ItemBanco])
def banco(limite: int = Query(100, ge=1, le=300), s: Session = Depends(sesion),
          u: Usuario = Depends(EXPERTO)) -> list[ItemBanco]:
    """El banco compartido: entrenamientos terminados (oficiales y personales) con dueño, muestra y si su corte ya
    no es el vigente (D38). Lo ven administración y expertos."""
    vigentes = {c.fuente: str(c.fecha_corte) for c in s.scalars(select(Corte).where(Corte.vigente.is_(True)))}
    filas = s.execute(select(Ejecucion, Usuario.nombre).outerjoin(Usuario, Usuario.id == Ejecucion.solicitada_por)
                      .where(Ejecucion.tipo == 'entrenamiento', Ejecucion.estado == 'ok')
                      .order_by(Ejecucion.id.desc()).limit(limite)).all()
    ids = {(e.parametros or {}).get('muestra_id') for e, _ in filas} - {None}
    titulos = {m.id: m.titulo for m in s.scalars(select(Muestra).where(Muestra.id.in_(ids)))} if ids else {}
    salida = []
    for e, dueno in filas:
        p, r = e.parametros or {}, e.resultado or {}
        if p.get('descartado'):
            continue
        corte = r.get('corte')
        auc = r.get('auc')
        salida.append(ItemBanco(
            id=e.id, propietario=dueno, visibilidad=p.get('visibilidad', 'oficial'), nombre=p.get('nombre'),
            descripcion=p.get('descripcion'), fuente=e.fuente, modelos=list(p.get('modelos') or []),
            muestra_id=p.get('muestra_id'), muestra=titulos.get(p.get('muestra_id')), corte=corte,
            corte_anterior=bool(corte and vigentes.get(e.fuente) and corte != vigentes[e.fuente]),
            auc=auc if isinstance(auc, (int, float)) else None, terminada=e.terminada,
            propia=e.solicitada_por == u.id, descartado=bool(p.get('descartado'))))
    return salida


@ruta.get('/ejecuciones', response_model=list[EjecucionSalida])
def ejecuciones(limite: int = Query(10, ge=1, le=50), s: Session = Depends(sesion),
                _: Usuario = Depends(ADMIN)) -> list[Ejecucion]:
    """Los últimos entrenamientos pedidos desde la web, con su paso actual (para la capa de presentación)."""
    return list(s.scalars(select(Ejecucion).where(Ejecucion.tipo == 'entrenamiento')
                          .order_by(Ejecucion.id.desc()).limit(limite)))
