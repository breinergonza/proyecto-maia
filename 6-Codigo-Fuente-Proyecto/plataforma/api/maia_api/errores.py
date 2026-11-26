"""Errores en español para quien usa la web.

* Validación (422): los mensajes de Pydantic llegan en inglés («Field required»). Aquí se traducen por tipo de error y
  con el nombre visible del campo; ``detail`` queda como una sola frase y ``errores`` guarda la lista por campo.
* Error inesperado (500): se registra la traza en el servidor y la web recibe un mensaje sin detalles internos.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger('maia_api')

# nombre visible de los campos que llegan desde los formularios; el resto se muestra con espacios en lugar de «_»
CAMPOS = {
    'email': 'el correo', 'clave': 'la contraseña', 'nombre': 'el nombre', 'rol': 'el perfil',
    'host': 'el servidor', 'puerto': 'el puerto', 'base': 'la base de datos', 'usuario': 'el usuario',
    'esquema': 'el esquema', 'sslmode': 'el modo SSL', 'timeout': 'el tiempo de espera', 'cron': 'la frecuencia',
    'zona': 'la zona horaria', 'fuente': 'la fuente', 'modelos': 'los modelos', 'parametros': 'los parámetros',
    'hiperparametros': 'los hiperparámetros', 'valores': 'los valores', 'sujetos': 'el número de niños',
    'percentil_minimo': 'la posición mínima', 'destinatarios': 'los destinatarios', 'comentario': 'el comentario',
    'es_error': 'la respuesta', 'preocupa': 'la respuesta', 'anio_desde': 'el año desde', 'anio_hasta': 'el año hasta',
    'ventana_meses': 'la ventana en meses', 'orden': 'el orden', 'dir': 'la dirección del orden',
    'pagina': 'la página', 'tamano': 'el tamaño de página', 'limite': 'el límite', 'archivo': 'el archivo',
}
_FUERA = {'body', 'query', 'path', 'header', 'cookie'}


def _campo(loc: tuple | list) -> str:
    partes = [p for p in loc if p not in _FUERA and not isinstance(p, int)]
    if not partes:
        return 'el dato'
    ultimo = str(partes[-1])
    return CAMPOS.get(ultimo, ultimo.replace('_', ' '))


def _mayuscula(t: str) -> str:
    return t[:1].upper() + t[1:]


def mensaje(e: dict[str, Any]) -> str:
    """Un error de Pydantic en una frase en español."""
    tipo, ctx, c = e.get('type', ''), e.get('ctx') or {}, _campo(e.get('loc') or ())
    texto = str(e.get('msg', ''))
    if tipo == 'missing':
        return f'Falta {c}.'
    if tipo == 'string_too_short':
        return _mayuscula(f'{c} debe tener al menos {ctx.get("min_length")} caracteres.')
    if tipo == 'string_too_long':
        return _mayuscula(f'{c} admite como máximo {ctx.get("max_length")} caracteres.')
    if tipo == 'string_pattern_mismatch':
        return _mayuscula(f'{c} no tiene el formato esperado.')
    if tipo in ('greater_than_equal', 'greater_than', 'less_than_equal', 'less_than'):
        limite = ctx.get('ge', ctx.get('gt', ctx.get('le', ctx.get('lt'))))
        cual = {'greater_than_equal': 'al menos', 'greater_than': 'mayor que',
                'less_than_equal': 'como máximo', 'less_than': 'menor que'}[tipo]
        return _mayuscula(f'{c} debe ser {cual} {limite}.')
    if tipo in ('int_parsing', 'int_type', 'int_from_float', 'float_parsing', 'float_type', 'decimal_parsing'):
        return _mayuscula(f'{c} debe ser un número{" entero" if tipo.startswith("int") else ""}.')
    if tipo in ('bool_parsing', 'bool_type'):
        return _mayuscula(f'{c} debe ser sí o no.')
    if tipo in ('literal_error', 'enum'):
        opciones = ctx.get('expected')
        return _mayuscula(f'{c}: elija una de las opciones' + (f' ({opciones}).' if opciones else '.'))
    if tipo.startswith(('date_', 'datetime_', 'time_')):
        return _mayuscula(f'{c} no es una fecha válida.')
    if tipo == 'json_invalid':
        return 'Lo enviado no es un JSON válido.'
    if tipo in ('too_short', 'too_long'):
        n = ctx.get('min_length' if tipo == 'too_short' else 'max_length')
        return _mayuscula(f'{c} debe tener {"al menos" if tipo == "too_short" else "como máximo"} {n} elementos.')
    if tipo == 'extra_forbidden':
        return _mayuscula(f'{c} no es un dato que se reconozca.')
    if tipo == 'value_error':
        if 'email' in texto.lower():
            return _mayuscula(f'{c}: el correo no es válido.')
        # los validadores propios ya escriben en español; Pydantic les antepone «Value error, »
        return _mayuscula(texto.removeprefix('Value error, ').strip())
    if tipo in ('list_type', 'dict_type', 'model_type', 'model_attributes_type', 'string_type'):
        return _mayuscula(f'{c} no tiene el tipo de dato esperado.')
    return _mayuscula(f'{c}: el valor no es válido.')


async def _validacion(_: Request, exc: RequestValidationError) -> JSONResponse:
    errores = [{'campo': _campo(e.get('loc') or ()), 'mensaje': mensaje(e)} for e in exc.errors()]
    unicos = list(dict.fromkeys(e['mensaje'] for e in errores))
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        content={'detail': ' '.join(unicos) or 'Los datos enviados no son válidos.', 'errores': errores})


async def _inesperado(request: Request, exc: Exception) -> JSONResponse:
    referencia = uuid4().hex
    log.exception('Error inesperado en %s %s. Referencia: %s', request.method, request.url.path, referencia, exc_info=exc)
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        content={'detail': 'Ocurrió un error inesperado en el servidor. Si se repite, comparta esta '
                                           f'referencia con administración: {referencia}.',
                                 'referencia': referencia})


def registrar(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validacion)
    app.add_exception_handler(Exception, _inesperado)
