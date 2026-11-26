"""The semestral run: order of the steps and what is passed to each one. Each step on its own
is tested end to end in test_operacion.py and test_alertas.py; the feedback sheets are not part of it."""
import pytest

import pipeline
from anomalias import __main__ as anomalias
from clinico import __main__ as clinico


@pytest.fixture
def llamadas(monkeypatch, proyecto):
    hechas = []
    monkeypatch.setattr(anomalias, 'main', lambda argv: hechas.append(('anomalias', argv)))
    monkeypatch.setattr(clinico, 'main', lambda argv: hechas.append(('clinico', argv)))
    return hechas


def test_anomalias_primero_y_riesgos_al_final(llamadas):
    pipeline.main([])
    assert llamadas == [('anomalias', ['entrenar']), ('anomalias', ['revisar']),
                        ('clinico', ['entrenar']), ('clinico', ['riesgos'])]


def test_compara_el_silencio_si_hay_riesgos_guardados(llamadas, proyecto):
    (proyecto.silencio).mkdir(parents=True)
    pipeline.main(['--silencio'])
    assert llamadas[-2:] == [('clinico', ['silencio']), ('clinico', ['riesgos', '--silencio'])]


def test_fuente_sevarti_y_sin_hojas_de_retroalimentacion(llamadas, proyecto, capsys):
    pipeline.main(['--sevarti', 'tablas'])
    assert all(argv[:2] == ['--sevarti', 'tablas'] for _, argv in llamadas)
    assert not {'muestra', 'expertos', 'medicos'} & {a for _, argv in llamadas for a in argv}
    assert not proyecto.para_llenar.exists()                                    # no feedback sheet is made
    assert 'python -m retroalimentacion expertos | medicos' in capsys.readouterr().out


def test_un_paso_que_falla_detiene_la_corrida(monkeypatch, llamadas):
    def falla(argv):
        raise RuntimeError('sin conexión')
    monkeypatch.setattr(clinico, 'main', falla)
    with pytest.raises(RuntimeError):
        pipeline.main([])
    assert [argv for _, argv in llamadas] == [['entrenar'], ['revisar']]


def test_sin_umbral_de_avisos():
    with pytest.raises(SystemExit):
        pipeline.main(['--tasa', '0.1'])


def test_las_hojas_de_retroalimentacion_ya_no_son_de_la_corrida():
    with pytest.raises(SystemExit):
        pipeline.main(['--muestras'])
