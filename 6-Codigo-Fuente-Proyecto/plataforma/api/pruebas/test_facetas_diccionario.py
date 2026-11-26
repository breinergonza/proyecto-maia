"""Las facetas leen la marca «Usar como filtro» del Diccionario (D35) y, sin marcas, se comportan como siempre."""
from __future__ import annotations

import pandas as pd

from maia_api import poblacion as P


def _esquema(**marcas: bool) -> pd.DataFrame:
    filas = [('ern_sexo', 'categorical', 'basal'), ('ern_lubchencofenton', 'categorical', 'basal'),
             ('ern_peso', 'numeric', 'basal'), ('v276', 'numeric', 'medicion'), ('nota', 'text', 'medicion')]
    return pd.DataFrame([{'variable': v, 'tipo': t, 'rol': r, 'usar_como_filtro': marcas.get(v, False)}
                         for v, t, r in filas])


def test_sin_marcas_vale_lo_de_siempre():
    facetas = P.elegir_facetas(_esquema(), hay_sedes=True)
    assert facetas[:2] == ['sede', 'ern_sexo'] and 'ern_peso' in facetas, 'las basales siguen entrando'
    sin_columna = _esquema().drop(columns='usar_como_filtro')   # un corte anterior a la columna
    assert P.elegir_facetas(sin_columna, hay_sedes=True) == facetas


def test_con_marcas_el_diccionario_decide_y_la_sede_y_la_edad_gestacional_siguen():
    facetas = P.elegir_facetas(_esquema(ern_sexo=True, v276=True), hay_sedes=True)
    assert facetas == ['sede', 'eg_categoria', 'eg_semanas', 'ern_sexo', 'v276']
    assert 'ern_peso' not in facetas and 'ern_lubchencofenton' not in facetas


def test_la_sede_solo_si_hay_mas_de_una_y_lo_no_filtrable_no_se_ofrece():
    facetas = P.elegir_facetas(_esquema(ern_sexo=True, nota=True), hay_sedes=False)
    assert 'sede' not in facetas and 'nota' not in facetas and 'ern_sexo' in facetas


def test_lo_pedido_se_suma_a_lo_marcado():
    assert P.elegir_facetas(_esquema(ern_sexo=True), True, ['ern_peso'])[-1] == 'ern_peso'


def test_lubchenco_se_muestra_con_el_texto_completo_y_la_sigla_al_final():
    from maia_api import poblacion as P
    from maia_comun import perfiles as PF
    esq = pd.DataFrame([{'variable': PF.VARIABLE_LUBCHENCO, 'tipo': 'categorical', 'rol': 'basal',
                         'categorias': '1=PTAEG;2=PTPEG;4=ATPEG;5=ATBPN;7=PostTPEG;9=otra'}])
    et = P.etiquetas_de(esq)[PF.VARIABLE_LUBCHENCO]
    assert et[1] == 'Pretérmino, adecuado para la edad gestacional (PTAEG)'
    assert et[5] == 'A término, bajo peso al nacer (ATBPN)'
    assert et[7] == 'Postérmino, pequeño para la edad gestacional (PostTPEG)'
    assert et[9] == 'otra'   # lo que no es una sigla conocida queda como lo escribió el Diccionario
    assert P.etiqueta_de({}, PF.VARIABLE_LUBCHENCO).startswith('Clasificación de Lubchenco')
