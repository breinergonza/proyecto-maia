"""The LightGBM device: chosen by MAIA_LGBM_DEVICE, with a CPU fallback for whatever the device cannot train.

``test_paridad_gpu_cpu`` needs an NVIDIA GPU and a CUDA build of LightGBM; it is skipped elsewhere."""
import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest
from anomalias import modelo as MA
from clinico import modelo as AC


def _datos(n=400, semilla=0):
    rng = np.random.default_rng(semilla)
    X = pd.DataFrame({'a': rng.normal(size=n), 'b': rng.normal(size=n)})
    y = (X.a + 0.5 * X.b + rng.normal(scale=0.5, size=n) > 0).astype(float)
    return X, y


def _cuda_disponible() -> bool:
    X, y = _datos(60)
    try:
        lgb.train(dict(objective='binary', device_type='cuda', verbose=-1), lgb.Dataset(X, y), num_boost_round=2)
        return True
    except lgb.basic.LightGBMError:
        return False


def test_dispositivo_por_variable_de_entorno(monkeypatch):
    monkeypatch.delenv('MAIA_LGBM_DEVICE', raising=False)
    assert MA.Config().dispositivo == 'cpu'
    monkeypatch.setenv('MAIA_LGBM_DEVICE', 'CUDA')
    assert MA.Config().dispositivo == 'cuda'
    cfg = AC.ConfigClinica(desenlaces=(), sexo='sexo', codigos_sexo=(), medidas=(), etapas_crecimiento=())
    assert cfg.dispositivo == 'cuda'


def test_sin_cuda_entrena_en_cpu_y_avisa_una_vez(capsys):
    if _cuda_disponible():
        pytest.skip('esta máquina sí entrena en CUDA')
    MA.DISPOSITIVOS_USADOS.clear()   # clean record of devices and warnings
    MA._AVISADOS.clear()
    X, y = _datos()
    params = dict(objective='binary', device_type='cuda', verbose=-1, seed=1)
    m1 = MA.entrenar_lgb(params, X[:300], y[:300], X[300:], y[300:], [], num_boost_round=20)
    m2 = MA.entrenar_lgb(params, X[:300], y[:300], X[300:], y[300:], [], num_boost_round=20)
    assert isinstance(m1, lgb.Booster) and isinstance(m2, lgb.Booster)
    assert MA.DISPOSITIVOS_USADOS['binary'] == {'cpu'}
    assert capsys.readouterr().err.count('se entrenan en CPU') == 1
    cpu = MA.entrenar_lgb({**params, 'device_type': 'cpu'}, X[:300], y[:300], X[300:], y[300:], [], num_boost_round=20)
    np.testing.assert_allclose(m1.predict(X), cpu.predict(X))


@pytest.mark.gpu
def test_paridad_gpu_cpu():
    """A model trained on the GPU predicts on CPU (the API) like one trained on CPU: on average within
    0.02 and with mostly the same children in the top decile."""
    if not _cuda_disponible():
        pytest.skip('sin GPU NVIDIA o sin LightGBM compilado con CUDA')
    X, y = _datos(5000, semilla=3)
    base = dict(objective='binary', verbose=-1, seed=1, learning_rate=0.05, num_leaves=31, max_bin=63)
    gpu = MA.entrenar_lgb({**base, 'device_type': 'cuda'}, X[:4000], y[:4000], X[4000:], y[4000:], [],
                          num_boost_round=100)
    cpu = MA.entrenar_lgb({**base, 'device_type': 'cpu'}, X[:4000], y[:4000], X[4000:], y[4000:], [],
                          num_boost_round=100)
    pg, pc = gpu.predict(X), cpu.predict(X)
    assert np.mean(np.abs(pg - pc)) < 0.02
    k = len(X) // 10
    arriba_g, arriba_c = set(np.argsort(-pg)[:k]), set(np.argsort(-pc)[:k])
    assert len(arriba_g & arriba_c) / k > 0.8
