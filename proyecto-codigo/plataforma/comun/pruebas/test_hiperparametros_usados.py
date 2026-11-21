"""Los hiperparámetros con que se entrenó quedan en la analítica del entrenamiento, y se leen con su nombre."""
from types import SimpleNamespace

from maia_comun import hiperparametros as HP


def test_usados_son_los_valores_de_la_configuracion_del_entrenamiento():
    cfg = SimpleNamespace(**{**HP.por_defecto('clinico'), 'tasa': 0.1, 'desenlaces': ()})
    assert HP.usados('clinico', cfg) == {**HP.por_defecto('clinico'), 'tasa': 0.1}


def test_rotulados_siguen_el_orden_de_administracion_y_omiten_lo_no_guardado():
    assert HP.rotulados('clinico', {'semilla': 7, 'rondas': 400, 'otro': 1}) == [
        {'nombre': 'rondas', 'etiqueta': 'Rondas de boosting (máximo)', 'valor': 400},
        {'nombre': 'semilla', 'etiqueta': 'Semilla', 'valor': 7}]
    assert HP.rotulados('clinico', None) == [] and HP.rotulados(None, {'rondas': 1}) == []
