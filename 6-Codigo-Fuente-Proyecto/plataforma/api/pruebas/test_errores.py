"""Los errores llegan a la web en español: validación con el nombre visible del campo y 500 sin detalles internos."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator

from maia_api import errores
from maia_api.esquemas import _email


class Nuevo(BaseModel):
    email: str
    clave: str = Field(min_length=10)
    puerto: int = Field(default=5432, ge=1, le=65535)
    cron: str = '0 2 * * *'
    _v = field_validator('email')(_email)

    @field_validator('cron')
    @classmethod
    def _cron(cls, v: str) -> str:
        if len(v.split()) != 5:
            raise ValueError('La frecuencia debe tener cinco campos.')
        return v


def _cliente() -> TestClient:
    app = FastAPI()
    errores.registrar(app)

    @app.post('/nuevo')
    def nuevo(datos: Nuevo) -> dict:
        return {'ok': True}

    @app.get('/falla')
    def falla() -> dict:
        raise RuntimeError('psycopg.OperationalError: detalle interno')

    return TestClient(app, raise_server_exceptions=False)


def test_validacion_en_espanol_con_el_nombre_del_campo():
    r = _cliente().post('/nuevo', json={'email': 'no-es-correo', 'clave': 'corta', 'puerto': 0, 'cron': 'cada lunes'})
    assert r.status_code == 422
    d = r.json()['detail']
    assert 'Correo no válido' in d                              # el validador propio del esquema
    assert 'La contraseña debe tener al menos 10 caracteres.' in d
    assert 'El puerto debe ser al menos 1.' in d
    assert 'La frecuencia debe tener cinco campos.' in d       # el mensaje propio, sin «Value error,»
    assert 'Field required' not in d and 'Value error' not in d
    assert {e['campo'] for e in r.json()['errores']} == {'el correo', 'la contraseña', 'el puerto', 'la frecuencia'}


def test_falta_un_campo():
    r = _cliente().post('/nuevo', json={'clave': 'una-clave-larga'})
    assert r.status_code == 422 and r.json()['detail'] == 'Falta el correo.'


def test_un_error_inesperado_no_muestra_la_traza(caplog):
    r = _cliente().get('/falla')
    assert r.status_code == 500
    assert 'error inesperado' in r.json()['detail'] and 'psycopg' not in r.text
    referencia = r.json()['referencia']
    assert referencia in r.json()['detail']
    assert referencia in caplog.text
