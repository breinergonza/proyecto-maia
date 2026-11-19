"""The "Usar como filtro" mark travels from the dictionary into the SEVARTI schema, and a schema made before the column
reads as "no variable marked" (the platform then offers the filters it always did)."""
from sevarti import contrato as SV
from sevarti import diccionario as D
from sevarti import kmc as K


def test_la_marca_del_diccionario_llega_al_esquema(meta):
    esquema = D.esquema(K.borrador(meta))
    assert 'usar_como_filtro' in esquema and esquema.usar_como_filtro.dtype == bool
    assert set(esquema.variable[esquema.usar_como_filtro]) == set(K.FILTROS_POR_DEFECTO)


def test_un_esquema_anterior_a_la_columna_se_lee_sin_marcas(meta):
    anterior = D.esquema(K.borrador(meta)).drop(columns='usar_como_filtro')
    leido = SV.normalizar_esquema(anterior)
    assert not leido.usar_como_filtro.any() and leido.usar_como_filtro.dtype == bool
