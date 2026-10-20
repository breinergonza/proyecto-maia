"""The KMC to SEVARTI translation, checked on a fake wide table built from the dictionary snapshot."""
import numpy as np
import pandas as pd

from sevarti import kmc as K
from sevarti import contrato as SV


def test_las_etiquetas_de_los_codigos_viajan_en_el_esquema(meta):
    con = meta.assign(categories=np.where(meta.variable == 'v236g', '1=displasia broncopulmonar;9=sin diagnóstico', ''))
    etiquetas = SV.etiquetas_categoria(K.esquema_sevarti(con))
    assert etiquetas == {'v236g': {1.0: 'displasia broncopulmonar', 9.0: 'sin diagnóstico'}}
    assert SV.etiquetas_categoria(K.esquema_sevarti(meta)) == {}      # a source without labels still works


def test_esquema_por_bloque_de_visita_y_modulo(meta):
    e = K.esquema_sevarti(meta).set_index('variable')
    assert e.loc['v261', 'etapa'] == '3 m EC' and e.loc['v261', 'concepto'] == 'peso'
    assert e.loc['v344b', 'etapa'] == '6 m EC' and e.loc['v430b', 'etapa'] == '12 m EC'
    assert e.loc['v196a', 'etapa'] == 'entrada PMC' and e.loc['v196', 'etapa'] == 'hospitalización'
    assert e.loc['ec_9m', 'etapa'] == '9 m EC'
    assert e.loc['v390', 'no_decreciente'] and e.loc['v390', 'concepto'] == 'talla'
    assert pd.isna(e.loc['ern_talla', 'concepto'])  # another instrument: not chained
    assert e.loc['v234', 'concepto'] == 'peso' and not e.loc['v234', 'ventana']  # weighed at its own age
    assert pd.isna(e.loc['v275g', 'concepto'])  # its "dias" field is not the age: not chained
    assert e.loc['csp_ingresomensual', 'rol'] == 'contexto' and pd.isna(e.loc['csp_ingresomensual', 'etapa'])
    assert e.loc['cp_edadmaterna', 'etapa'] == 'prenatal' and e.loc['cp_edadmaterna', 'rol'] == 'basal'
    assert not {'iden_codigo', 'iden_sede', 'iden_fechaparto', 'paciente_id'} & set(e.index)
    assert set(e.etapa.dropna()) <= set(K.ETAPAS_SEVARTI.etapa)


def test_to_sevarti_arma_las_tablas(meta, wide):
    sev = K.to_sevarti(K.borrador(meta), wide)
    assert len(sev.sujetos) == len(wide)
    assert 'NO_USAR' not in set(sev.mediciones.valor.astype(str)) | set(sev.sujetos.astype(str).stack())
    assert sev.sujetos.fecha_nacimiento.isna().all()             # only the year is known
    assert sev.sujetos.anio_nacimiento.tolist() == wide.anio_parto.tolist()
    assert sev.sujetos.grupo.nunique() == 1                       # no site: one group
    entrada = sev.mediciones[sev.mediciones.variable == 'v196a']
    assert (entrada.edad_dias == 33).all()  # age at discharge + days from discharge to entry
    assert sev.mediciones.groupby('variable').size().get('v261') == len(wide) - 6
    con_edad = sev.mediciones[sev.mediciones.variable == 'v234']
    assert con_edad.edad_dias.notna().all() and con_edad.fecha.isna().all()
    sin_edad = sev.mediciones[sev.mediciones.variable == 'v275g']
    visita = pd.to_numeric(wide.set_index('paciente_id').v260).reindex(sin_edad.sujeto).to_numpy()
    assert sin_edad.fecha.notna().all() and (sin_edad.edad_dias.to_numpy() == visita).all()  # at its visit
    v261 = sev.mediciones[sev.mediciones.variable == 'v261']
    assert v261.fecha.notna().all()
    assert set(sev.episodios.tipo) == {'hospitalización URN', 'hospitalización total'}
    urn = sev.episodios[sev.episodios.tipo == 'hospitalización URN']
    assert len(urn) == len(wide) - 10 and (urn.edad_inicio == 0).all()  # from the duration, in days of life
    assert sev.mediciones.index.is_unique


def test_edad_gestacional_es_la_que_pidio_la_fundacion(meta, wide):
    """The Fundación asked for EG_Semanas (consumo.perfil_paciente.eg_semanas), not Ballard."""
    sev = K.to_sevarti(K.borrador(meta), wide)
    assert sev.sujetos.eg_semanas.tolist() == wide.eg_semanas.tolist()
    assert (K.prepare(wide.assign(iden_fechaparto='2020-01-01')).ga_semanas == wide.eg_semanas.astype(int)).all()
