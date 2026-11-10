"""La columna «Usar como filtro» del Diccionario llega a la pantalla (previsualización y formularios de edición) y un
diccionario anterior a la columna se sigue leyendo, sin variables marcadas."""
from __future__ import annotations

from dataclasses import replace

from maia_comun import diccionarios as DIC


def test_la_columna_se_ve_y_se_edita_como_sí_o_no():
    dic = DIC.leer(DIC.SEMILLA.read_bytes())          # el diccionario de semilla es anterior a la columna
    variables = next(h for h in DIC.vista(dic) if h['nombre'] == 'Variables')
    col = next(c for c in variables['columnas'] if c['clave'] == 'usar_como_filtro')
    assert col['titulo'] == 'Usar como filtro' and col['opciones'] == ['Sí', 'No'] and not col['obligatoria']
    i = [c['clave'] for c in variables['columnas']].index('usar_como_filtro')
    assert {f[i] for f in variables['filas']} == {'No'}, 'sin marcar, vale No'


def test_marcar_una_variable_sobrevive_al_guardar_y_leer():
    # ``leer`` guarda el diccionario en una caché por huella: se edita una copia, nunca el objeto cacheado
    leido = DIC.leer(DIC.SEMILLA.read_bytes())
    variables = leido.variables.copy()
    sexo = variables.variable[variables.variable.str.contains('sexo')].iloc[0]
    variables.loc[variables.variable == sexo, 'usar_como_filtro'] = True
    dic = replace(leido, variables=variables)
    otra = DIC.leer(DIC.escribir(dic))
    assert otra.variables.set_index('variable').usar_como_filtro[sexo]
    assert int(otra.variables.usar_como_filtro.sum()) == 1
