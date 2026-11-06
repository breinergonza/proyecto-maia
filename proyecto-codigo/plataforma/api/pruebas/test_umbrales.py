"""Los umbrales de riesgo se definen una vez en cada lado (API y web) y esta prueba los mantiene iguales."""
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from maia_api.esquemas import ConfigNotificacionEntrada
from maia_comun.modelos_db import PERCENTIL_ALTO, PERCENTIL_MUY_ALTO, ConfigNotificacion

WEB = Path(__file__).resolve().parents[2] / 'web' / 'src' / 'lib'


def _constante(archivo: str, nombre: str) -> int:
    texto = (WEB / archivo).read_text(encoding='utf-8')
    m = re.search(rf'export const {nombre} = (\d+)', texto)
    assert m, f'{nombre} no está en {archivo}'
    return int(m[1])


def test_la_web_usa_los_mismos_umbrales_de_riesgo_que_la_api():
    assert _constante('formato.ts', 'RIESGO_ALTO') == PERCENTIL_ALTO == 90
    assert _constante('lenguaje.ts', 'RIESGO_MUY_ALTO') == PERCENTIL_MUY_ALTO == 95


def test_el_aviso_por_correo_parte_del_riesgo_muy_alto():
    assert ConfigNotificacionEntrada(desenlace='x').percentil_minimo == PERCENTIL_MUY_ALTO
    assert ConfigNotificacion.__table__.c.percentil_minimo.server_default.arg.text == str(PERCENTIL_MUY_ALTO)


def test_el_minimo_de_los_avisos_es_una_posicion_entera_de_0_a_100():
    """0,95 no es «el 5 % con más riesgo»: avisaría de casi todos los niños."""
    assert ConfigNotificacionEntrada(desenlace='x', percentil_minimo=90).percentil_minimo == 90
    for malo in (0.95, 99.5, -1, 101):
        with pytest.raises(ValidationError):
            ConfigNotificacionEntrada(desenlace='x', percentil_minimo=malo)
