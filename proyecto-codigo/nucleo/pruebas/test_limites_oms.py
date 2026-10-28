"""WHO's limits for a biologically implausible growth z-score, per indicator: a datum beyond them is
sent to be checked, not to the clinician. Length/height-for-age -6 / +6, weight-for-age -6 / +5,
weight-for-length and head circumference-for-age -5 / +5 (WHO Anthro, igrowup)."""
from pathlib import Path

import pandas as pd
import pytest
from openpyxl import load_workbook

from clinico import configuracion as CF
from clinico import crecimiento as CR
from sevarti import diccionario as D
from sevarti import kmc as K


def _alertas(concepto: str, valores: list[float], medidas: tuple[CR.Medida, ...] = ()) -> pd.DataFrame:
    """One child, one datum per visit of the concept, with the given z-scores."""
    n = len(valores)
    z = pd.DataFrame({'sujeto': 'a', 'concepto': concepto, 'ec_dias': [90.0 * i for i in range(n)],
                      'z': valores, 'etapa': [f'v{i}' for i in range(n)]})
    return CR.alertas_crecimiento(z, medidas).set_index('ec_dias')


def test_los_limites_son_los_de_la_oms():
    assert CR.Z_IMPROBABLES == {'talla': (-6.0, 6.0), 'peso': (-6.0, 5.0), 'peso_para_talla': (-5.0, 5.0),
                                'perimetro_cefalico': (-5.0, 5.0)}
    assert set(CR.Z_IMPROBABLES) == set(CR.INDICADORES)


def test_mas_cinco_y_medio_es_improbable_en_peso_y_no_en_talla():
    peso, talla = _alertas('peso', [5.5]).iloc[0], _alertas('talla', [5.5]).iloc[0]
    assert peso.improbable and 'revisar el dato' in peso.motivo and '+5' in peso.motivo
    assert not talla.improbable and talla.motivo == ''


def test_menos_cinco_y_medio_es_improbable_en_perimetro_y_no_en_peso():
    pc, peso = _alertas('perimetro_cefalico', [-5.5]).iloc[0], _alertas('peso', [-5.5]).iloc[0]
    assert pc.improbable and not pc.bajo and 'menos de -5 DE' in pc.motivo
    assert not peso.improbable and peso.bajo                 # a credible, very low weight: a clinical alert


@pytest.mark.parametrize('concepto, minimo, maximo', [
    ('talla', -6.0, 6.0), ('peso', -6.0, 5.0), ('peso_para_talla', -5.0, 5.0), ('perimetro_cefalico', -5.0, 5.0)])
def test_el_limite_exacto_no_es_improbable_y_lo_que_pasa_si(concepto, minimo, maximo):
    a = _alertas(concepto, [minimo, maximo, minimo - 0.01, maximo + 0.01])
    assert a.improbable.tolist() == [False, False, True, True]


def test_la_medida_toma_los_limites_de_su_indicador_aunque_el_concepto_se_llame_distinto():
    medida = CR.Medida('peso_g', 'peso', factor=0.001, restringido=True)
    assert medida.improbable == (-6.0, 5.0)
    assert _alertas('peso_g', [5.5], (medida,)).iloc[0].improbable
    assert not _alertas('peso_g', [5.5]).iloc[0].improbable      # no measure, no indicator: +-6
    pt = CR.Medida('peso', 'peso_para_talla', por_talla='talla')
    assert CR.limites_improbable('peso_para_talla', (pt,)) == (-5.0, 5.0)


def test_los_expertos_pueden_cambiar_los_limites():
    medida = CR.Medida('talla', 'talla', z_improbable_min=-4.0, z_improbable_max=None)
    assert medida.improbable == (-4.0, 6.0)
    assert _alertas('talla', [-4.5], (medida,)).iloc[0].improbable


def test_una_medida_guardada_antes_de_los_limites_usa_los_de_la_oms():
    medida = CR.Medida('peso', 'peso')
    for campo in ('z_improbable_min', 'z_improbable_max'):    # what unpickling an older model leaves
        object.__delattr__(medida, campo)
    assert medida.improbable == (-6.0, 5.0)


def test_el_desenlace_de_crecimiento_ignora_el_dato_improbable_con_el_limite_de_su_indicador():
    medidas = (CR.Medida('peso', 'peso'), CR.Medida('talla', 'talla'))
    assert CR.limites_improbable('peso', medidas) == (-6.0, 5.0)
    assert CR.limites_improbable('talla', medidas) == (-6.0, 6.0)
    assert CR.limites_improbable('otro', medidas) == (-CR.Z_IMPROBABLE, CR.Z_IMPROBABLE)


# ---------------------------------------------------------------- the dictionary

def _dic(crecimiento: list[dict]) -> D.Diccionario:
    variables = pd.DataFrame([dict(variable='peso_v', estado=D.LISTA, tipo='numeric', concepto='peso'),
                              dict(variable='talla_v', estado=D.LISTA, tipo='numeric', concepto='talla'),
                              dict(variable='sexo', estado=D.LISTA, tipo='categorical', categorias='1=niño;2=niña')])
    visitas = pd.DataFrame([dict(etapa='a', orden=0, base='corregida')])
    curva = pd.DataFrame([dict(sexo='sexo', codigo_nino='1', codigo_nina='2', etapas='a')])
    return D.Diccionario(variables, visitas, crecimiento=pd.DataFrame(crecimiento), curva=curva)


def test_un_diccionario_sin_las_columnas_usa_los_limites_de_la_oms():
    cfg = CF.leer(_dic([dict(indicador='peso', concepto='peso', unidad='g', estado=D.EN_USO),
                        dict(indicador='talla', concepto='talla', unidad='cm', estado=D.EN_USO)]))
    assert {m.nombre: m.improbable for m in cfg.medidas} == {'peso': (-6.0, 5.0), 'talla': (-6.0, 6.0)}


def test_los_limites_del_diccionario_llegan_a_la_medida():
    cfg = CF.leer(_dic([dict(indicador='peso', concepto='peso', unidad='g', z_improbable_min=-5.0,
                             estado=D.EN_USO)]))
    assert cfg.medidas[0].improbable == (-5.0, 5.0)


def _sin_columnas_de_limites(ruta: Path) -> None:
    """A dictionary written before the two columns existed."""
    wb = load_workbook(ruta)
    ws = wb['Crecimiento']
    for celda in reversed(ws[1]):
        if celda.value and str(celda.value).startswith('Dato improbable'):
            ws.delete_cols(celda.column)
    wb.save(ruta)


def test_un_libro_anterior_a_las_columnas_se_lee_igual(meta, tmp_path):
    ruta = tmp_path / 'diccionario.xlsx'
    borrador = K.borrador(meta)
    D.escribir(borrador, ruta)
    assert {'Dato improbable si z menor que', 'Dato improbable si z mayor que'} <= {
        c.value for c in load_workbook(ruta)['Crecimiento'][1]}
    _sin_columnas_de_limites(ruta)
    dic = D.leer(ruta)
    assert dic.crecimiento[['z_improbable_min', 'z_improbable_max']].isna().all().all()
    assert len(dic.crecimiento) == len(borrador.crecimiento)
    medidas = CF.leer(dic, prueba=True).medidas
    assert medidas and all(m.improbable == CR.Z_IMPROBABLES[m.indicador] for m in medidas)
