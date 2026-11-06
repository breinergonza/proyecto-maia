"""El programador y el diccionario con versiones, con un lanzador falso en lugar de ``maia``: baja la vigente antes de
la corrida, guarda un borrador si la corrida agregó variables (inventadas, ``var_simulada_*``) y no rompe nada si la
tabla está vacía."""
from datetime import date

import pandas as pd
import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from maia_comun import diccionarios as DIC
from maia_comun import ejecuciones as EJ
from maia_comun.config import Configuracion
from maia_comun.modelos_db import Ejecucion, VersionDiccionario
from maia_entrenamiento.programador import Programador
from sevarti import diccionario as D

pytestmark = pytest.mark.integracion

CFG = Configuracion(_env_file=None, maia_cifrado_clave='p' * 40, kmc_pw=None)


@pytest.fixture
def motor(url_db):
    m = create_engine(url_db)
    yield m
    with Session(m) as s:
        for t in (Ejecucion, VersionDiccionario):
            s.execute(delete(t))
        s.commit()


def _con_nueva(variable: str) -> bytes:
    sugeridas = pd.DataFrame([{'variable': variable, 'etiqueta': 'Variable simulada', 'tipo': 'numeric',
                               'rol': 'medicion', 'etapa': '3 m EC'}], columns=list(D.COLUMNAS['variables']))
    nuevo, _, _ = D.conciliar(D.leer(DIC.SEMILLA), sugeridas, date(2026, 10, 30))
    return DIC.escribir(nuevo)


class LanzadorQueAgrega:
    """Hace de ``maia corrida``: mira qué diccionario encontró y, como ``sevarti.diccionario.sincronizar``, le agrega
    una variable nueva."""

    def __init__(self, ruta, agregar: bytes | None, codigo: int = 0):
        self.ruta, self.agregar, self.codigo, self.visto = ruta, agregar, codigo, None

    def __call__(self, args, env, al_linea):
        self.visto = self.ruta.read_bytes() if self.ruta.exists() else None
        if self.agregar is not None:
            self.ruta.write_bytes(self.agregar)
        al_linea('Corrida 3 terminada en 1 min.')
        return self.codigo


def _ultima(motor) -> Ejecucion:
    with Session(motor) as s:
        return s.scalars(select(Ejecucion).order_by(Ejecucion.id.desc())).first()


def test_baja_la_vigente_y_guarda_el_borrador_con_las_variables_nuevas(motor, tmp_path):
    ruta = tmp_path / 'entradas' / 'diccionario.xlsx'
    prog = Programador(motor=motor, lanzar=None, cfg=CFG, diccionario=ruta)
    assert prog.sembrar_diccionario() and not prog.sembrar_diccionario()
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    prog.lanzar = lanzador = LanzadorQueAgrega(ruta, _con_nueva('var_simulada_p'))
    prog.ciclo()
    assert lanzador.visto == DIC.SEMILLA.read_bytes()   # la corrida leyó la vigente
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado == {'corrida': 3, 'variables_nuevas': ['var_simulada_p']}
    assert 'Diccionario' in e.mensaje and 'versión 2' in e.registro
    with Session(motor) as s:
        b = DIC.borrador_pendiente(s)
        assert b.origen == 'corrida' and b.version == 2 and '1 variable nueva' in b.nota
        assert DIC.vigente(s).version == 1   # la vigente no cambia sola


def test_si_la_corrida_falla_las_variables_nuevas_no_se_pierden(motor, tmp_path):
    ruta = tmp_path / 'diccionario.xlsx'
    with Session(motor) as s:
        DIC.sembrar(s)
        EJ.encolar(s, 'entrenamiento', 'kmc', 'manual', {'modelos': ['clinico'], 'extraer': False})
        s.commit()
    Programador(motor=motor, lanzar=LanzadorQueAgrega(ruta, _con_nueva('var_simulada_q'), codigo=1), cfg=CFG,
                diccionario=ruta).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error'
    with Session(motor) as s:
        assert DIC.borrador_pendiente(s) is not None


def test_sin_versiones_no_toca_el_archivo_ni_rompe(motor, tmp_path):
    ruta = tmp_path / 'diccionario.xlsx'
    ruta.write_bytes(b'el que haya en disco')
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    lanzador = LanzadorQueAgrega(ruta, None)
    Programador(motor=motor, lanzar=lanzador, cfg=CFG, diccionario=ruta).ciclo()
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado == {'corrida': 3} and lanzador.visto == b'el que haya en disco'
    with Session(motor) as s:
        assert s.scalars(select(VersionDiccionario)).first() is None
