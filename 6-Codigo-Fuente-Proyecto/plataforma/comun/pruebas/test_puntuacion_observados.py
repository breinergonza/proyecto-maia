"""``tabla_observados`` guarda, por niño y familia de desenlaces, si el desenlace ocurrió (la vista clínica)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from clinico import modelo as AC
from maia_comun import puntuacion as PU
from maia_comun import simulados as S
from maia_comun.modelos_db import DesenlaceObservado


@pytest.fixture(scope='module')
def preparado():
    sev = S.simular(400, semilla=5)
    clinico = AC.ModeloClinico(S.CONFIG_CLINICA_DEMO)
    return clinico, clinico.preparar(sev), sev


def _modelo(clinico, clave, momento, regla='z_bajo', corte=float('nan'), **campos):
    """Un submodelo sin entrenar: ``tabla_observados`` solo lee su desenlace y su corte de la variable."""
    return SimpleNamespace(desenlace=AC.Desenlace(clave, f'nombre de {clave}', momento, regla, **campos),
                           corte_variable=corte)


def _con(clinico, **modelos):
    return SimpleNamespace(modelos=modelos, etiqueta=clinico.etiqueta)


def test_agrupa_por_familia_y_omite_no_vuelve(preparado):
    clinico, p, _ = preparado
    talla = dict(concepto='talla', etapa='12 m EC')
    fake = _con(clinico,
                talla_baja_12m_desde_3=_modelo(clinico, 'talla_baja_12m_desde_3', '3 m EC', **talla),
                talla_baja_12m_desde_6=_modelo(clinico, 'talla_baja_12m_desde_6', '6 m EC', **talla),
                no_vuelve_3m=_modelo(clinico, 'no_vuelve_3m', '40 sem', 'no_vuelve'),
                readm_3m=_modelo(clinico, 'readm_3m', '40 sem', 'mayor_que_cero', variable='readm_3m'))
    t = PU.tabla_observados(fake, p, 9)
    assert set(t.familia) == {'talla_baja_12m', 'readm_3m'}   # los _desde_ se juntan; no_vuelve no se guarda
    assert set(t.columns) <= {c.name for c in DesenlaceObservado.__table__.columns}
    assert (t.corrida_id == 9).all() and t.valor.dtype == bool
    assert not t.duplicated(['sujeto', 'familia']).any()   # un niño, una fila por familia


def test_el_representante_es_la_clave_base_y_si_no_cualquiera_de_la_familia(preparado):
    clinico, p, _ = preparado
    # desarrollo_6m es percentil_bajo: lo que cuenta como «bajo» sale del corte de cada submodelo
    base = _modelo(clinico, 'desarrollo_6m', '3 m EC', 'percentil_bajo', corte=1e9, variable='desarrollo_6m')
    desde = _modelo(clinico, 'desarrollo_6m_desde_40', '40 sem', 'percentil_bajo', corte=-1e9, variable='desarrollo_6m')
    con_base = PU.tabla_observados(_con(clinico, desarrollo_6m_desde_40=desde, desarrollo_6m=base), p, 1)
    assert con_base.valor.all() and len(con_base)   # corte alto: todos bajo (el de la base)
    sin_base = PU.tabla_observados(_con(clinico, desarrollo_6m_desde_40=desde), p, 1)
    assert not sin_base.valor.any() and len(sin_base)   # sin base, el de la variante


def test_la_poblacion_no_se_limita_a_quien_llego_al_corte(preparado):
    clinico, p, _ = preparado
    talla = dict(concepto='talla', etapa='12 m EC')
    corte = _modelo(clinico, 'talla_baja_12m_desde_3', '3 m EC', **talla)
    al_corte = clinico.etiqueta(p, corte.desenlace).dropna()   # solo quien asistió a los 3 meses
    primera = _modelo(clinico, 'readm_3m', '40 sem', 'mayor_que_cero', variable='readm_3m')   # la visita más temprana
    t = PU.tabla_observados(_con(clinico, talla_baja_12m_desde_3=corte, readm_3m=primera), p, 1)
    t = t[t.familia == 'talla_baja_12m']
    sin_corte = set(t.sujeto) - set(clinico.asistieron(p, '3 m EC'))
    assert sin_corte   # hay niños con dato a los 12 meses que no fueron a los 3: con el corte no tendrían fila
    comunes = al_corte.index.intersection(t.sujeto)   # el valor es el mismo para quien está en los dos
    assert len(comunes) and (t.set_index('sujeto').valor.reindex(comunes).to_numpy() == (al_corte.reindex(comunes).to_numpy() > 0)).all()


def test_solo_hay_fila_cuando_se_sabe(preparado):
    clinico, p, sev = preparado
    corte = _modelo(clinico, 'talla_baja_12m_desde_3', '3 m EC', concepto='talla', etapa='12 m EC')
    t = PU.tabla_observados(_con(clinico, talla_baja_12m_desde_3=corte), p, 1)
    assert len(t) < sev.sujetos.sujeto.nunique()   # el que no fue a los 12 meses no tiene fila
    vacia = PU.tabla_observados(_con(clinico, no_vuelve_3m=_modelo(clinico, 'no_vuelve_3m', '40 sem', 'no_vuelve')), p, 1)
    assert vacia.empty and list(vacia.columns) == ['corrida_id', 'sujeto', 'familia', 'valor']


def test_la_visita_inicial_es_la_primera_de_los_modelos(preparado):
    clinico, p, _ = preparado
    # con un modelo que parte de la visita más temprana, se usa esa; la población son quienes asistieron a ella
    muy_temprano = _modelo(clinico, 'talla_baja_12m_desde_40', '40 sem', concepto='talla', etapa='12 m EC')
    tardio = _modelo(clinico, 'desarrollo_6m', '3 m EC', 'percentil_bajo', variable='desarrollo_6m')
    visitas = []
    espia = SimpleNamespace(modelos={'a': muy_temprano, 'b': tardio},
                            etiqueta=lambda p, des, corte=float('nan'): visitas.append(des.momento)
                            or clinico.etiqueta(p, des, corte))
    PU.tabla_observados(espia, p, 1)
    assert set(visitas) == {'40 sem'}   # a todas se les pide la población de la primera visita
