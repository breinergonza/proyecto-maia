"""Feedback from the experts and the clinicians: blinded sheets, answers read back, what they measure.
Outside the semester run; each part is also tested end to end through ``python -m retroalimentacion``."""
import numpy as np
import pandas as pd
from openpyxl import load_workbook

from anomalias import operacion as OP
from archivos import libros as LB
from clinico import modelo as AC
from retroalimentacion import __main__ as CLI
from retroalimentacion import expertos, medicos
from sevarti import contrato as SV


def _responder(ruta, hoja, encabezado, respuestas):
    wb = load_workbook(ruta)
    ws = wb[hoja]
    col = next(c.column for c in ws[1] if c.value == encabezado)
    for fila, r in enumerate(respuestas, start=2):
        ws.cell(fila, col, str(r))
    wb.save(ruta)


# ---------------------------------------------------------------- experts

def test_muestra_ciega_y_precision_por_capa(puntuado):
    te, res = puntuado
    hoja, clave = expertos.muestra_expertos(res.datos, te.esquema, por_capa=20, control=30, semilla=1)
    assert len(hoja) == len(clave) == 90 and hoja.id.is_unique
    assert not {'alerta1', 'alerta2', 'alerta3', 'z1', 'z2', 'esperado', 'estrato', 'capas'} & set(hoja)
    assert clave.estrato.value_counts().to_dict() == {'1. Valor': 20, '2. Contexto': 20, '3. Trayectoria': 20,
                                                      'sin alerta': 30}
    assert hoja.misma_medida_en_el_tiempo.str.contains(':').any()
    # experts mark every layer-1 datum as an error and nothing else; "no sé" is left out
    marcada = hoja.assign(es_error=np.where(clave.estrato == '1. Valor', 'Sí', 'no'))
    marcada.loc[marcada.index[:5], 'es_error'] = 'no sé'
    tabla = expertos.medir_precision(marcada, clave)
    assert tabla.loc['1. Valor', 'pct_error'] == 100 and tabla.loc['sin alerta', 'pct_error'] == 0
    assert tabla.revisados.sum() == 85
    assert tabla.loc['2. Contexto', 'ic95_alto'] > 0


def test_muestra_con_puntajes_guardados_es_igual_a_puntuar_de_nuevo(puntuado, tmp_path):
    te, res = puntuado
    OP.guardar_puntajes(res, tmp_path, 'v', te.corte)
    assert OP.leer_puntajes(tmp_path, 'otra', te.corte) is None  # another model: score again
    guardados = OP.leer_puntajes(tmp_path, 'v', te.corte)
    a, _ = expertos.muestra_expertos(res.datos, te.esquema, por_capa=10, control=10, semilla=3)
    b, _ = expertos.muestra_expertos(guardados, te.esquema, por_capa=10, control=10, semilla=3)
    pd.testing.assert_frame_equal(a.astype(str), b.astype(str))


def test_expertos_de_punta_a_punta(sev, modelo, proyecto, tmp_path, capsys):
    s = sev.subconjunto(sev.sujetos.sujeto[:2000])
    base = ['--sevarti', str(SV.guardar(s, tmp_path / 'sev'))]
    OP.guardar(modelo, proyecto.modelos_anomalias, s, None)

    CLI.main([*base, 'expertos', '--por-capa', '5', '--control', '5'])
    assert 'No hay puntajes' in capsys.readouterr().out
    proyecto.interno_anomalias.mkdir(parents=True, exist_ok=True)
    OP.guardar_puntajes(modelo.puntuar(s), proyecto.interno_anomalias, modelo.version, s.corte)
    CLI.main([*base, 'expertos', '--por-capa', '5', '--control', '5'])
    assert 'Usando los puntajes de la última revisión' in capsys.readouterr().out

    hoja = next(proyecto.para_llenar.glob('expertos_*.xlsx'))
    assert [r.name for r in proyecto.para_llenar.iterdir()] == [hoja.name]        # the key is not next to the sheet
    assert len(list(proyecto.claves.glob('expertos_*.csv'))) == 1
    _responder(hoja, 'Datos', '¿Es un error?', ['No'] * (len(pd.read_excel(hoja, sheet_name='Datos'))))
    CLI.main(['precision', str(hoja)])
    con_ruta = capsys.readouterr().out
    assert 'sin alerta' in con_ruta
    CLI.main(['precision'])                                  # the answered sheet is read from where it was left
    assert capsys.readouterr().out == con_ruta


# ------------------------------------------------------------- clinicians

def test_medicos_de_punta_a_punta(clinico, proyecto, tmp_path, capsys):
    sev, *_, modelo = clinico
    base = ['--sevarti', str(SV.guardar(sev, tmp_path / 'sev'))]
    AC.guardar(modelo, proyecto.modelos_clinicos, sev, None)

    CLI.main([*base, 'medicos', '--por-grupo', '5'])
    capsys.readouterr()
    hoja_ruta = next(proyecto.para_llenar.glob('medicos_*.xlsx'))
    assert [r.name for r in proyecto.para_llenar.iterdir()] == [hoja_ruta.name]   # the key is not next to the sheet
    hoja = LB.leer(LB.MEDICOS, hoja_ruta, 'Niños')
    assert not {'alerta', 'riesgo', 'percentil', 'estrato'} & set(hoja)          # blinded
    clave = pd.read_csv(next(proyecto.claves.glob('medicos_*.csv')))
    respuestas = np.where(hoja.id.map(clave.set_index('id').estrato) == 'riesgo alto', 'Sí', 'No')
    _responder(hoja_ruta, 'Niños', '¿Le preocupa?', respuestas)
    marcada = LB.leer(LB.MEDICOS, hoja_ruta, 'Niños')
    CLI.main(['revision', str(hoja_ruta)])
    con_ruta = capsys.readouterr().out
    assert 'preocuparon' in con_ruta
    CLI.main(['revision'])                                   # the answered sheet is read from where it was left
    assert capsys.readouterr().out == con_ruta
    tabla = medicos.medir_revision(marcada, clave)
    assert (tabla.xs('riesgo alto', level='estrato').pct == 100).all()
    assert (tabla.xs('resto', level='estrato').pct == 0).all()
