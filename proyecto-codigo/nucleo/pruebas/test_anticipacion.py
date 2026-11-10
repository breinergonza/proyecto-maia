"""Anticipation (D20): the draft of the dictionary brings the same outcome predicted from the other visits, for the
three families of the platform (readmission, oxygen and low development). Nothing connects to the real base."""
from clinico import configuracion as CF
from sevarti import diccionario as D
from sevarti import kmc as K


def _filas():
    return K.borrador_clinico().desenlaces.set_index('clave')


def test_las_filas_de_anticipacion_son_en_prueba_y_con_clave_nueva():
    filas = _filas()
    nuevas = filas[filas.index.str.match(r'^(?:readm|oxigeno|desarrollo)_\d+m_desde_')]
    assert len(nuevas) == 21 and not filas.index.duplicated().any()
    assert set(nuevas.estado) == {D.EN_PRUEBA}
    assert 'readm_6m_desde_pmc' in nuevas.index and 'oxigeno_3m_desde_40' in nuevas.index
    assert 'readm_40s_desde_pmc' not in filas.index, 'readm_40s ya se predice desde la primera visita'


def test_cada_fila_copia_la_regla_de_su_desenlace_y_se_predice_antes_de_que_ocurra():
    filas = _filas()
    orden = {v: i for i, v in enumerate(K.VISITAS_CLINICAS)}
    for clave, evento in K.EVENTO_EN.items():
        propias = filas[filas.index.str.startswith(f'{clave}_desde_')]
        assert len(propias), clave
        for c, f in propias.iterrows():
            assert f.regla == filas.at[clave, 'regla'] and f.variable == filas.at[clave, 'variable']
            assert orden[f.momento] < orden[evento] and f.momento != filas.at[clave, 'momento'], c
            assert c == f'{clave}_desde_{K.etiqueta_visita(f.momento)}'


def test_la_configuracion_clinica_las_lee_sin_descartar_ninguna(meta):
    dic = K.borrador(meta)
    base = CF.leer(dic)   # en uso: sin las nuevas
    todo = CF.leer(dic, prueba=True)
    claves = {d.clave for d in todo.desenlaces}
    assert not any('_desde_' in d.clave and d.clave.startswith(('readm', 'oxigeno', 'desarrollo')) for d in base.desenlaces)
    assert {'readm_12m_desde_pmc', 'readm_12m_desde_6', 'oxigeno_12m_desde_9', 'desarrollo_12m_desde_9'} <= claves
    assert not [c for c, _ in todo.descartados if c.startswith(('readm', 'oxigeno', 'desarrollo'))]
