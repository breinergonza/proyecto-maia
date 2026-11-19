"""The variable dictionary: an Excel the experts own and the only source of variable definitions.

It has seven sheets: ``Variables`` (what each variable is, its visit and its rules), ``Visitas``
(the visits as age windows and where their date and age come from), ``Episodios`` (stays with
their duration) and ``Quiebres`` (known changes in how data were recorded), which the run turns
into the SEVARTI ``esquema``, ``etapas`` and ``quiebres``; and the clinical configuration:
``Desenlaces`` (each outcome, how it is read and at which visit it is predicted), ``Crecimiento``
(the WHO indicators and the measures and units they use) and ``Curva OMS`` (the sex variable and
the visits the curve applies to), which ``clinico.configuracion`` reads. A dictionary made before
those three existed gets them from the adapter's draft.

Nothing here knows the source. An adapter proposes a first draft and, on every run, a suggestion
for each variable the source brings; ``conciliar`` adds the ones the dictionary does not know as
"Por clasificar" and reports the "Lista" ones the source no longer brings. A variable is used only
when its state is "Lista".
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from archivos import carpetas as CA
from archivos import libros as LB
from sevarti import contrato as SV

LISTA, POR_CLASIFICAR, NO_USAR = 'Lista', 'Por clasificar', 'No usar'
ESTADOS = (LISTA, POR_CLASIFICAR, NO_USAR)

COLUMNAS = dict(
    variables=('variable', 'estado', 'etiqueta', 'tema', 'tipo', 'unidad', 'rol', 'etapa', 'concepto', 'ventana',
               'no_decreciente', 'tolerancia', 'edad_variable', 'codigos_especiales', 'categorias', 'rango_min',
               'rango_max', 'usar_como_filtro', 'nota'),
    visitas=('etapa', 'nombre', 'orden', 'edad_min', 'edad_max', 'base', 'fecha_variables', 'edad_variable',
             'edad_fija'),
    episodios=('tipo', 'duracion_variables'),
    quiebres=('quiebre', 'fecha'),
    desenlaces=('clave', 'nombre', 'estado', 'regla', 'momento', 'variable', 'codigos', 'negativos', 'percentil',
                'medida', 'etapa', 'solo_desde', 'comparar', 'nota'),
    crecimiento=('indicador', 'concepto', 'unidad', 'por_talla', 'z_bajo', 'caida', 'z_improbable_min',
                 'z_improbable_max', 'estado'),
    curva=('sexo', 'codigo_nino', 'codigo_nina', 'etapas'),
)
_FLOTANTES = {'variables': ('tolerancia', 'rango_min', 'rango_max'),
              'visitas': ('edad_min', 'edad_max', 'edad_fija'),
              'desenlaces': ('percentil',), 'crecimiento': ('z_bajo', 'caida', 'z_improbable_min', 'z_improbable_max')}
# Numbers that mean something else on the wrong scale (a fraction where a percentage goes, a z with its
# sign flipped): each column's accepted values, with what the message tells the person to write.
_ESCALAS = {
    'Desenlaces': {'percentil': (lambda x: x.between(1, 50),
                                 'tiene que estar entre 1 y 50. Escríbalo como porcentaje: 10 para el 10 % más bajo '
                                 '(0.05 no vale).')},
    'Crecimiento': {'z_bajo': (lambda x: x < 0, 'tiene que ser negativo, por ejemplo -2.'),
                    'caida': (lambda x: x > 0, 'tiene que ser positiva, por ejemplo 1.'),
                    'z_improbable_min': (lambda x: x < 0, 'tiene que ser negativo, por ejemplo -6.'),
                    'z_improbable_max': (lambda x: x > 0, 'tiene que ser positivo, por ejemplo 6.')},
    'Variables': {'tolerancia': (lambda x: x >= 0, 'no puede ser negativa: es lo que puede bajar, 0 si no puede.')},
}
_TEXTOS_VACIOS = ('codigos_especiales', 'categorias')   # "no codes" is the empty text, as in the SEVARTI schema

# What the Excel shows for each internal value of the closed columns.
_SI_NO = {True: 'Sí', False: 'No'}
_TIPO = {'numeric': 'Número', 'categorical': 'Categoría', 'boolean': 'Sí/No'}
_ROL = {'medicion': 'Medición', 'basal': 'Basal', 'contexto': 'Contexto'}
_BASE = {'cronologica': 'Nacimiento', 'corregida': '40 semanas'}
_ESTADO = {e: e for e in ESTADOS}
# the clinical sheets: an outcome or a measure is trained, only validated, or left out
EN_USO, EN_PRUEBA, APAGADO = 'en_uso', 'en_prueba', 'no_usar'
_ESTADO_CLINICO = {EN_USO: 'En uso', EN_PRUEBA: 'En prueba', APAGADO: 'No usar'}
# internal values are clinico.modelo.REGLAS and clinico.crecimiento's INDICADORES and UNIDADES
_REGLA = {'en_codigos': 'Códigos', 'mayor_que_cero': 'Conteo mayor que cero', 'percentil_bajo': 'Entre los más bajos',
          'no_vuelve': 'No vuelve a la visita siguiente', 'z_bajo': 'Crecimiento bajo'}
_INDICADOR = {'peso': 'Peso para la edad', 'talla': 'Talla para la edad',
              'perimetro_cefalico': 'Perímetro cefálico para la edad', 'peso_para_talla': 'Peso para la talla'}
_UNIDAD = {'g': 'g', 'kg': 'kg', 'cm': 'cm', 'mm': 'mm'}
_CERRADAS = {
    'Variables': {'estado': _ESTADO, 'tipo': _TIPO, 'rol': _ROL, 'ventana': _SI_NO, 'no_decreciente': _SI_NO,
                  'usar_como_filtro': _SI_NO},
    'Visitas': {'base': _BASE},
    'Desenlaces': {'estado': _ESTADO_CLINICO, 'regla': _REGLA, 'medida': _INDICADOR},
    'Crecimiento': {'indicador': _INDICADOR, 'unidad': _UNIDAD, 'estado': _ESTADO_CLINICO},
}
_DEFECTO_SI_NO = {'ventana': True, 'no_decreciente': False, 'usar_como_filtro': False}   # a blank answer
_OBLIGATORIAS = {'Variables': ('variable', 'estado', 'tipo'), 'Visitas': ('etapa', 'orden', 'base'),
                 'Episodios': ('tipo', 'duracion_variables'), 'Quiebres': ('quiebre', 'fecha'),
                 'Desenlaces': ('clave', 'nombre', 'estado', 'regla', 'momento'),
                 'Crecimiento': ('indicador', 'concepto', 'unidad', 'estado'),
                 'Curva OMS': ('sexo', 'codigo_nino', 'codigo_nina', 'etapas')}
_NUMEROS = {'Variables': ('tolerancia', 'rango_min', 'rango_max'),
            'Visitas': ('orden', 'edad_min', 'edad_max', 'edad_fija'),
            'Desenlaces': ('percentil',), 'Crecimiento': ('z_bajo', 'caida', 'z_improbable_min', 'z_improbable_max')}
# columns added after the first dictionaries: a file without them reads them as empty (the default)
_OPCIONALES = {'Crecimiento': ('z_improbable_min', 'z_improbable_max'), 'Variables': ('usar_como_filtro',)}
_FECHAS = {'Quiebres': ('fecha',)}

# ---------------------------------------------------------------- the workbook

_VISITAS = 'Visitas!$A$2:$A$200'   # the dropdown of the visit columns
_VARIABLES = 'Variables!$A$2:$A$5000'
_QUIEBRES = 'Quiebres!$A$2:$A$200'


def _t(clave: str, titulo: str, explica: str, ancho: int = 14, *, opciones: tuple[str, ...] = (), largo: bool = False,
       lista: str = '') -> LB.Columna:
    """A text column: read back as text, so a code such as '9' is not turned into a number."""
    return LB.Columna(clave, titulo, explica, ancho, opciones=opciones, largo=largo, lista=lista, texto=True)


def _opciones(mapa: dict) -> tuple[str, ...]:
    return tuple(mapa.values())


LIBRO = LB.Libro(
    titulo='Diccionario de variables',
    instrucciones=(
        'Este archivo define las variables de la base que usa el sistema: qué es cada una, en qué visita se mide y '
        'qué reglas tiene. Lo mantienen los expertos; el sistema solo lo lee.',
        'Cada corrida compara este archivo con la base. Una variable nueva de la base se agrega al final de la hoja '
        '"Variables" con el estado "Por clasificar" y una visita sugerida. No se usa hasta que un experto la revise, '
        'corrija lo que haga falta y cambie el estado a "Lista".',
        'Las variables en estado "Lista" que la base ya no trae se avisan en la corrida; no se borran. Para '
        'dejar de usar una variable, cambien su estado a "No usar".',
        'Las hojas "Desenlaces", "Crecimiento" y "Curva OMS" configuran las alertas clínicas: qué desenlaces se '
        'predicen, en qué visita y cómo se leen de los datos, y qué medidas se comparan con la curva de la OMS. '
        'Para agregar un desenlace, agreguen una fila en "Desenlaces" con el estado "En prueba" y corran '
        '"python -m clinico experimento": valida todos los desenlaces en prueba sin tocar el modelo en uso. Si el '
        'resultado convence, cambien el estado a "En uso" y corran "python -m clinico entrenar".',
        'Una fila de "Desenlaces" o "Crecimiento" a la que le falte lo que su regla necesita no se usa: la corrida '
        'dice cuál y por qué, y sigue con las demás.',
        'Las celdas amarillas tienen una lista de respuestas. No cambien los encabezados ni los nombres de las '
        'hojas, y cierren el archivo antes de correr el sistema: si está abierto, el sistema no puede agregar las '
        'variables nuevas.',
    ),
    hojas=(
        LB.Hoja('Variables', 'Una fila por variable de la base', (
            _t('variable', 'Variable', 'Código de la variable en la base. No lo cambien.', 16),
            _t('estado', 'Estado', 'Lista: el sistema la usa. Por clasificar: apareció en la base y falta revisarla; '
               'el sistema no la usa. No usar: el sistema la descarta.', 14, opciones=ESTADOS),
            _t('etiqueta', 'Nombre', 'Cómo se llama la variable para quien lee los informes.', 34, largo=True),
            _t('tema', 'Tema', 'Grupo temático al que pertenece, por ejemplo el módulo del formulario.', 18),
            _t('tipo', 'Tipo', 'Número: una medida. Categoría: un código con significado (1 = sí, 2 = no). Sí/No: '
               'dos valores.', 12, opciones=_opciones(_TIPO)),
            _t('unidad', 'Unidad', 'Unidad de la medida, por ejemplo g, cm o días.', 10),
            _t('rol', 'Rol', 'Medición: se mide en una visita. Basal: dato del nacimiento o anterior a él. Contexto: '
               'entorno social de la familia, sin visita. Es obligatorio en las "Lista".', 12, opciones=_opciones(_ROL)),
            _t('etapa', 'Visita', 'Visita o momento en que se mide, de las de la hoja "Visitas". Vacío si no depende '
               'de una visita.', 22, lista=_VISITAS),
            _t('concepto', 'Qué mide', 'Lo que se mide. Si el mismo texto aparece en varias visitas, el sistema lo '
               'sigue como una sola trayectoria, por ejemplo "peso" en todas las visitas.', 18),
            _t('ventana', 'Se mide en su visita', 'Sí: se espera que el dato se tome dentro de las edades de su '
               'visita. No: se tomó a su propia edad (ver "Edad tomada de"). Vacío es Sí.', 14, opciones=_opciones(_SI_NO)),
            _t('no_decreciente', 'No puede bajar', 'Sí: la medida solo crece con el tiempo, por ejemplo la talla. '
               'Vacío es No.', 12, opciones=_opciones(_SI_NO)),
            LB.Columna('tolerancia', 'Cuánto puede bajar', 'Si no puede bajar: lo que puede bajar entre visitas por '
                       'error de medición, en la unidad de la variable. No puede ser negativo. Vacío es 0.', 12),
            _t('edad_variable', 'Edad tomada de', 'Opcional: variable de la base con la edad, en días de vida, a la '
               'que se tomó este dato.', 16),
            _t('codigos_especiales', 'Códigos de "no se hizo"', 'Códigos que no son una medida sino que no se hizo o '
               'no se sabe (por ejemplo 99), separados por ";".', 16),
            _t('categorias', 'Etiquetas de los códigos', 'Qué significa cada código de una categoría, por ejemplo '
               '1=buena;2=regular.', 34, largo=True),
            LB.Columna('rango_min', 'Rango desde', 'Valor más bajo esperado. Solo informa: no descarta datos.', 10),
            LB.Columna('rango_max', 'Rango hasta', 'Valor más alto esperado. Solo informa: no descarta datos.', 10),
            LB.Columna('usar_como_filtro', 'Usar como filtro', 'Sí: la variable se ofrece como filtro al armar una '
                       'muestra y en Explorar, por ejemplo sexo al nacer, edad gestacional o Lubchenco. Vacío es No. '
                       'Si ninguna variable lo tiene, se ofrecen las de siempre.', 12, opciones=_opciones(_SI_NO),
                       texto=True, opcional=True),
            _t('nota', 'Nota', 'Lo que quieran anotar. El sistema escribe aquí el aviso de las variables nuevas.', 44,
               largo=True),
        )),
        LB.Hoja('Visitas', 'Las visitas del seguimiento, como ventanas de edad', (
            _t('etapa', 'Visita', 'Nombre corto de la visita. Las variables lo usan en su columna "Visita".', 18),
            _t('nombre', 'Nombre', 'Cómo se llama la visita en los informes.', 30),
            LB.Columna('orden', 'Orden', 'Posición de la visita en el tiempo (0, 1, 2...).', 8),
            LB.Columna('edad_min', 'Edad desde (días)', 'Edad más baja a la que se espera la visita. Vacío si no tiene '
                       'edad propia, por ejemplo lo prenatal.', 12),
            LB.Columna('edad_max', 'Edad hasta (días)', 'Edad más alta a la que se espera la visita.', 12),
            _t('base', 'Edad contada desde', 'Nacimiento: días de vida. 40 semanas: edad corregida, que descuenta '
               'lo que el niño nació antes de término.', 16, opciones=_opciones(_BASE)),
            _t('fecha_variables', 'Variables con la fecha', 'Variables de la base con la fecha de la visita, separadas '
               'por ";". Si hay varias, se usa la primera que tenga dato.', 22),
            _t('edad_variable', 'Variable con la edad', 'Variable de la base con la edad, en días de vida, que se '
               'anotó en la visita.', 18),
            LB.Columna('edad_fija', 'Edad fija (días)', 'Para una visita sin fecha ni edad anotadas: la edad que se '
                       'da a todos sus datos, por ejemplo 0 para el nacimiento.', 12),
        ), filas_extra=20),
        LB.Hoja('Episodios', 'Periodos con su duración, como las hospitalizaciones', (
            _t('tipo', 'Episodio', 'Nombre del periodo.', 28),
            _t('duracion_variables', 'Variables con la duración', 'Variables de la base con la duración en días, '
               'separadas por ";". Si hay varias, se usa la primera que tenga dato. El periodo empieza en el '
               'nacimiento.', 36),
        )),
        LB.Hoja('Quiebres', 'Cambios conocidos en la forma de registrar los datos', (
            _t('quiebre', 'Quiebre', 'Qué cambió, por ejemplo un cambio de sistema.', 34),
            LB.Columna('fecha', 'Fecha', 'Desde cuándo.', 12, formato='yyyy-mm-dd'),
        )),
        LB.Hoja('Desenlaces', 'Los desenlaces de las alertas clínicas: uno por fila', (
            _t('clave', 'Clave', 'Nombre corto y único del desenlace, sin espacios, por ejemplo readm_3m. Va en los '
               'archivos de riesgos: no lo cambien una vez en uso.', 24),
            _t('nombre', 'Alerta', 'Lo que dice la alerta, por ejemplo "readmisión entre las 40 semanas y los 3 '
               'meses".', 40, largo=True),
            _t('estado', 'Estado', 'En uso: el modelo lo aprende con "python -m clinico entrenar". En prueba: solo se '
               'valida con "python -m clinico experimento". No usar: no se usa.', 12,
               opciones=_opciones(_ESTADO_CLINICO)),
            _t('regla', 'Cómo se lee', 'Códigos: la variable tiene uno de los "Códigos de sí" o de los "Códigos de no". '
               'Conteo mayor que cero: la variable es un número mayor que 0. Entre los más bajos: la variable cae en el '
               '"Porcentaje más bajo" de los niños. No vuelve a la visita siguiente: el niño no vino a la visita que '
               'sigue a "Se predice en" y su ventana ya cerró. Crecimiento bajo: la "Medida de crecimiento" queda bajo '
               'la curva OMS en la "Visita del desenlace".', 22, opciones=_opciones(_REGLA)),
            _t('momento', 'Se predice en', 'Visita en la que se calcula el riesgo, solo con lo que se sabe hasta '
               'ella.', 16, lista=_VISITAS),
            _t('variable', 'Variable', 'Variable de la base que dice si pasó. No hace falta en "No vuelve a la visita '
               'siguiente" ni en "Crecimiento bajo".', 14, lista=_VARIABLES),
            _t('codigos', 'Códigos de sí', 'Solo en "Códigos": los códigos que dicen que pasó, separados por ";", por '
               'ejemplo 1 o 1;2. Deben estar en las etiquetas de la variable.', 12),
            _t('negativos', 'Códigos de no', 'Solo en "Códigos": los que dicen que no pasó. Cualquier otro, como "No hay '
               'dato", deja el desenlace sin conocer para ese niño.', 12),
            LB.Columna('percentil', 'Porcentaje más bajo', 'Solo en "Entre los más bajos": por ejemplo 10 para el 10% '
                       'más bajo de los niños de entrenamiento. De 1 a 50. Vacío es 10.', 12),
            _t('medida', 'Medida de crecimiento', 'Solo en "Crecimiento bajo": el indicador de la hoja "Crecimiento".',
               22, opciones=_opciones(_INDICADOR)),
            _t('etapa', 'Visita del desenlace', 'Solo en "Crecimiento bajo": la visita en que se mira la medida, '
               'posterior a "Se predice en".', 16, lista=_VISITAS),
            _t('solo_desde', 'Solo nacidos desde', 'Opcional: un quiebre de la hoja "Quiebres". Si antes se anotaba '
               'distinto, el desenlace se aprende solo con los nacidos desde entonces.', 22, lista=_QUIEBRES),
            _t('comparar', 'Comparar con', 'Variables de la regla simple contra la que se mide el modelo, separadas '
               'por ";", por ejemplo eg_semanas;ern_peso. eg_semanas es la edad gestacional.', 24),
            _t('nota', 'Nota', 'Lo que quieran anotar.', 40, largo=True),
        ), filas_extra=30),
        LB.Hoja('Crecimiento', 'Las medidas que se comparan con la curva de la OMS', (
            _t('indicador', 'Indicador OMS', 'La curva de la OMS con que se compara la medida.', 26,
               opciones=_opciones(_INDICADOR)),
            _t('concepto', 'Qué mide', 'El texto de la columna "Qué mide" de las variables con esta medida, por '
               'ejemplo peso.', 18),
            _t('unidad', 'Unidad', 'Unidad en que la base anota la medida.', 8, opciones=_opciones(_UNIDAD)),
            _t('por_talla', 'Con la talla de', 'Solo en "Peso para la talla": el "Qué mide" de la talla tomada en la '
               'misma visita.', 16),
            LB.Columna('z_bajo', 'Bajo si z menor que', 'Puntaje z bajo el cual la medida es baja, para la alerta y '
                       'para el desenlace "Crecimiento bajo". Debe ser negativo. Vacío es -2, el corte de la OMS.', 12),
            LB.Columna('caida', 'Caída que alerta', 'Cuántas desviaciones estándar tiene que bajar desde la visita '
                       'anterior para alertar. Debe ser positiva. Vacío es 1.', 12),
            LB.Columna('z_improbable_min', 'Dato improbable si z menor que', 'Puntaje z bajo el cual la medida no '
                       'es un hallazgo sino un dato para revisar. Debe ser negativo. Vacío es el límite de la OMS: -6 en peso y talla, -5 '
                       'en perímetro cefálico y peso para la talla.', 12),
            LB.Columna('z_improbable_max', 'Dato improbable si z mayor que', 'Puntaje z sobre el cual la medida no '
                       'es un hallazgo sino un dato para revisar. Debe ser positivo. Vacío es el límite de la OMS: +6 en talla, +5 en '
                       'peso, perímetro cefálico y peso para la talla.', 12),
            _t('estado', 'Estado', 'En uso: el modelo la usa. En prueba: solo en "python -m clinico experimento". No '
               'usar: no se calcula.', 12, opciones=_opciones(_ESTADO_CLINICO)),
        ), filas_extra=5),
        LB.Hoja('Curva OMS', 'Cómo se elige la curva de la OMS: una sola fila', (
            _t('sexo', 'Variable del sexo', 'Variable con el sexo del niño, para usar la curva de niños o la de '
               'niñas.', 16, lista=_VARIABLES),
            _t('codigo_nino', 'Código de niño', 'El código de esa variable que es niño.', 10),
            _t('codigo_nina', 'Código de niña', 'El código de esa variable que es niña.', 10),
            _t('etapas', 'Visitas con curva', 'Visitas en que se compara el crecimiento con la curva, separadas por '
               '";". La curva vale desde el término del embarazo: en prematuros, las visitas por edad corregida.', 44),
        )),
    ),
)
_TABLA = {'Variables': 'variables', 'Visitas': 'visitas', 'Episodios': 'episodios', 'Quiebres': 'quiebres',
          'Desenlaces': 'desenlaces', 'Crecimiento': 'crecimiento', 'Curva OMS': 'curva'}
# sheets added after the first dictionaries: a file without them takes them from the adapter's draft
COMPLETABLES = ('Desenlaces', 'Crecimiento', 'Curva OMS')


# ---------------------------------------------------------------- the tables

@dataclass(frozen=True)
class Diccionario:
    variables: pd.DataFrame = field(default_factory=pd.DataFrame)
    visitas: pd.DataFrame = field(default_factory=pd.DataFrame)
    episodios: pd.DataFrame = field(default_factory=pd.DataFrame)
    quiebres: pd.DataFrame = field(default_factory=pd.DataFrame)
    desenlaces: pd.DataFrame = field(default_factory=pd.DataFrame)
    crecimiento: pd.DataFrame = field(default_factory=pd.DataFrame)
    curva: pd.DataFrame = field(default_factory=pd.DataFrame)

    def __post_init__(self) -> None:
        for tabla, columnas in COLUMNAS.items():
            df = getattr(self, tabla).copy()
            for c in columnas:
                if c not in df:
                    df[c] = '' if c in _TEXTOS_VACIOS else np.nan
            df = df[list(columnas)].reset_index(drop=True)
            for c in _FLOTANTES.get(tabla, ()):
                df[c] = pd.to_numeric(df[c], errors='coerce').astype(float)
            for c in df.columns.difference(_FLOTANTES.get(tabla, ())):
                if pd.api.types.is_float_dtype(df[c]):   # a text column still empty: it will hold text
                    df[c] = df[c].astype(object)
            object.__setattr__(self, tabla, df)
        v = self.variables
        for c in _TEXTOS_VACIOS:
            v[c] = v[c].fillna('')
        for c, defecto in _DEFECTO_SI_NO.items():
            v[c] = v[c].fillna(defecto).astype(bool)
        self.visitas['orden'] = pd.to_numeric(self.visitas.orden).astype('int64')


def reglas(hoja: str) -> dict[str, tuple[str, ...]]:
    """What reading a sheet checks besides its closed answers (those are each column's ``opciones``):
    the columns it requires, and those that must be numbers or dates. For forms that fill the
    dictionary outside Excel. A variable marked "Lista" also needs its "Rol"."""
    return {'obligatorias': _OBLIGATORIAS[hoja], 'numeros': _NUMEROS.get(hoja, ()), 'fechas': _FECHAS.get(hoja, ())}


def mostrado(hoja: str, clave: str, valor: str) -> str:
    """How the Excel shows an internal value of a closed column, to name it in a message."""
    return _CERRADAS[hoja][clave].get(valor, valor)


def partes(texto: object) -> tuple[str, ...]:
    """The names in a ';' separated cell, in order. An empty or missing cell has none."""
    return tuple(p.strip() for p in texto.split(';') if p.strip()) if isinstance(texto, str) else ()


def en_uso(dic: Diccionario) -> pd.DataFrame:
    """The variables the run uses: only those marked "Lista"."""
    return dic.variables[dic.variables.estado == LISTA].reset_index(drop=True)


def esquema(dic: Diccionario) -> pd.DataFrame:
    """The SEVARTI ``esquema`` of the variables in use."""
    return SV.normalizar_esquema(en_uso(dic)[list(SV.COLUMNAS['esquema'])])


def etapas(dic: Diccionario) -> pd.DataFrame:
    """The SEVARTI ``etapas`` (visits in time order, with their readable name)."""
    return dic.visitas.sort_values('orden', kind='stable')[['etapa', 'orden', 'edad_min', 'edad_max', 'base', 'nombre']] \
        .reset_index(drop=True)


def quiebres(dic: Diccionario) -> pd.DataFrame:
    return dic.quiebres.reset_index(drop=True)


# ---------------------------------------------------------------- new and missing variables

def conciliar(dic: Diccionario, sugeridas: pd.DataFrame, fecha: date) -> tuple[Diccionario, list[str], list[str]]:
    """Compares the dictionary with the variables the source brings (``sugeridas``: one draft row each).

    Returns the dictionary with the unknown ones appended as "Por clasificar" with the suggested
    classification, their names, and the names of the "Lista" variables the source no longer brings.
    Existing rows are never modified."""
    nuevas = sugeridas[~sugeridas.variable.isin(dic.variables.variable)].copy()
    ausentes = dic.variables.variable[(dic.variables.estado == LISTA)
                                      & ~dic.variables.variable.isin(sugeridas.variable)].tolist()
    if nuevas.empty:
        return dic, [], ausentes
    sin_visita = nuevas.etapa.notna() & ~nuevas.etapa.isin(dic.visitas.etapa)
    aviso = f'Apareció en la base el {fecha:%Y-%m-%d}: revisarla y marcarla "{LISTA}".'
    nuevas['nota'] = [aviso + f' La visita sugerida ({e}) no está en la hoja "Visitas".' if falta else aviso
                      for e, falta in zip(nuevas.etapa, sin_visita)]
    nuevas.loc[sin_visita, 'etapa'] = np.nan
    nuevas['estado'] = POR_CLASIFICAR
    variables = pd.concat([dic.variables, nuevas[list(COLUMNAS['variables'])]], ignore_index=True)
    return replace(dic, variables=variables), nuevas.variable.tolist(), ausentes


# ---------------------------------------------------------------- the file

def _mostrada(tabla: str, df: pd.DataFrame) -> pd.DataFrame:
    """A table as the Excel shows it: the closed answers in Spanish, empty text as an empty cell."""
    out = df.copy()
    for clave, mapa in _CERRADAS.get(tabla, {}).items():
        out[clave] = out[clave].map(mapa)
    for c in out.columns:
        if pd.api.types.is_string_dtype(out[c]):
            out[c] = out[c].where(out[c].astype(object) != '', np.nan)
    return out


def mostradas(dic: Diccionario) -> dict[str, pd.DataFrame]:
    """Each sheet of the workbook, in order, as the Excel shows it."""
    return {h.nombre: _mostrada(h.nombre, getattr(dic, _TABLA[h.nombre])) for h in LIBRO.hojas}


def escribir(dic: Diccionario, ruta: Path) -> Path:
    """Writes the workbook through a temporary file, so a file that is open or a failure half way
    never leaves the experts' dictionary damaged."""
    ruta = Path(ruta)
    tablas = mostradas(dic)
    temporal = ruta.with_name(f'{ruta.stem}.tmp{ruta.suffix}')
    try:
        LB.escribir(LIBRO, temporal, tablas)
        os.replace(temporal, ruta)
    finally:
        temporal.unlink(missing_ok=True)
    return ruta


def _clave(texto: object) -> str:
    return ' '.join(str(texto).split()).casefold()


class _Errores:
    """The problems found in the file, each with its sheet, Excel row and value."""

    def __init__(self, ruta: Path) -> None:
        self.ruta, self.lineas = ruta, []

    def agregar(self, hoja: str, fila: int, texto: str) -> None:
        self.lineas.append(f'hoja "{hoja}", fila {fila}: {texto}')

    def levantar(self) -> None:
        if self.lineas:
            raise ValueError(f'El diccionario {self.ruta.name} tiene {len(self.lineas)} problema(s) por corregir:\n- '
                             + '\n- '.join(self.lineas))


def _leer_hoja(ruta: Path, nombre: str, errores: _Errores) -> pd.DataFrame:
    """One sheet with the internal column names and its values checked. A wrong value is reported
    and left empty. The Excel row of a line is its position plus the header."""
    hoja = LIBRO.hoja(nombre)
    t = LB.leer(LIBRO, ruta, nombre)
    titulos = {c.clave: c.titulo for c in hoja.columnas}
    for c in _OPCIONALES.get(nombre, ()):
        if c not in t:
            t[c] = np.nan
    faltan = [titulos[c] for c in titulos if c not in t]
    if faltan:
        raise ValueError(f'La hoja "{nombre}" de {ruta.name} no tiene las columnas {faltan}: puede que hayan '
                         'cambiado los encabezados.')
    t = t[list(titulos)]
    t = t[~t.iloc[:, 0].eq(LB.VACIA)]
    for c in hoja.columnas:
        if c.texto:
            t[c.clave] = t[c.clave].map(lambda v: (v.strip() or np.nan) if isinstance(v, str) else v).astype('str')
    t = t.dropna(how='all')
    malas: set[tuple[str, int]] = set()   # wrong values: reported once, not again as missing

    def mala(clave: str, i: int, texto: str) -> None:
        malas.add((clave, i))
        errores.agregar(nombre, i + 2, f'{titulos[clave]} "{t.at[i, clave]}" {texto}')

    for clave, mapa in _CERRADAS.get(nombre, {}).items():
        buscar = {_clave(mostrado): interno for interno, mostrado in mapa.items()}
        for i, v in t[clave].items():
            if not pd.isna(v) and _clave(v) not in buscar:
                mala(clave, i, f'no es válido. Use: {", ".join(mapa.values())}.')
        t[clave] = t[clave].map(lambda v: buscar.get(_clave(v), np.nan) if not pd.isna(v) else np.nan)
        if clave in _DEFECTO_SI_NO:
            t[clave] = t[clave].fillna(_DEFECTO_SI_NO[clave]).astype(bool)
    for clave in _NUMEROS.get(nombre, ()):
        numero = pd.to_numeric(t[clave], errors='coerce')
        for i in t.index[t[clave].notna() & numero.isna()]:
            mala(clave, i, 'no es un número.')
        t[clave] = numero
    for clave, (vale, texto) in _ESCALAS.get(nombre, {}).items():
        for i in t.index[t[clave].notna() & ~vale(t[clave])]:
            if (clave, i) not in malas:
                mala(clave, i, texto)
    if nombre == 'Visitas':   # a visit's window runs forward in time
        for i in t.index[t.edad_min.notna() & t.edad_max.notna() & (t.edad_min > t.edad_max)]:
            mala('edad_min', i, f'es mayor que {titulos["edad_max"]} "{t.at[i, "edad_max"]:g}": la visita va de la '
                 'edad menor a la mayor.')
    for clave in _FECHAS.get(nombre, ()):
        fecha = pd.to_datetime(t[clave], errors='coerce')
        for i in t.index[t[clave].notna() & fecha.isna()]:
            mala(clave, i, 'no es una fecha (use AAAA-MM-DD).')
        t[clave] = fecha
    obligatorias = [(c, None) for c in _OBLIGATORIAS[nombre]]
    if nombre == 'Variables':
        obligatorias.append(('rol', t.estado == LISTA))   # a variable in use needs its role
    for clave, cuando in obligatorias:
        falta = t[clave].isna() if cuando is None else t[clave].isna() & cuando
        for i in t.index[falta]:
            if (clave, i) not in malas:
                errores.agregar(nombre, i + 2, f'falta {titulos[clave]}' + ('' if cuando is None else f' (obligatorio si el estado es "{LISTA}")') + '.')
    return t


def hojas_faltantes(ruta: Path) -> list[str]:
    with pd.ExcelFile(ruta) as archivo:
        return [h.nombre for h in LIBRO.hojas if h.nombre not in archivo.sheet_names]


def leer(ruta: Path, completar_con: Diccionario | None = None) -> Diccionario:
    """The dictionary in the Excel, checked. Raises ``ValueError`` in Spanish naming every problem
    with its sheet, row and value. A sheet added after the first dictionaries (``COMPLETABLES``)
    that the file lacks is taken from ``completar_con``, when given."""
    ruta = Path(ruta)
    faltan = hojas_faltantes(ruta)
    completadas = [h for h in faltan if completar_con is not None and h in COMPLETABLES]
    if sin_hoja := [h for h in faltan if h not in completadas]:
        raise ValueError(f'{ruta.name} no tiene las hojas {sin_hoja}. Si es un diccionario anterior a esas hojas, '
                         '"python -m sevarti diccionario" las agrega; si no es un diccionario de este sistema, '
                         'bórrenlo y corran lo mismo para crear uno nuevo.')
    errores = _Errores(ruta)
    hojas = {h.nombre: getattr(completar_con, _TABLA[h.nombre]) if h.nombre in completadas
             else _leer_hoja(ruta, h.nombre, errores) for h in LIBRO.hojas}
    variables, visitas = hojas['Variables'], hojas['Visitas']
    for nombre, clave in (('Variables', 'variable'), ('Visitas', 'etapa'), ('Desenlaces', 'clave'),
                          ('Crecimiento', 'indicador')):
        tabla = hojas[nombre]
        for i in tabla.index[tabla[clave].duplicated(keep='first') & tabla[clave].notna()]:
            errores.agregar(nombre, int(i) + 2, f'{LIBRO.hoja(nombre).columnas[0].titulo} "{tabla.at[i, clave]}" está repetida.')
    for i in variables.index[variables.etapa.notna() & ~variables.etapa.isin(visitas.etapa)]:
        errores.agregar('Variables', int(i) + 2, f'Visita "{variables.at[i, "etapa"]}" no está en la hoja "Visitas".')
    for i in hojas['Curva OMS'].index[1:]:
        errores.agregar('Curva OMS', int(i) + 2, 'esta hoja lleva una sola fila.')
    errores.levantar()
    return Diccionario(**{_TABLA[nombre]: tabla for nombre, tabla in hojas.items()})


# ---------------------------------------------------------------- one run

def _donde(ruta: Path) -> str:
    try:
        return str(CA.PROYECTO.relativa(ruta))
    except ValueError:
        return str(ruta)


def _nombres(variables: list[str], maximo: int = 20) -> str:
    resto = len(variables) - maximo
    return ', '.join(variables[:maximo]) + (f' y {resto} más' if resto > 0 else '')


def _plural(n: int, uno: str, varios: str) -> str:
    return f'{n} {uno if n == 1 else varios}'


def sincronizar(ruta: Path, borrador: Diccionario, hoy: date | None = None) -> Diccionario:
    """The dictionary the run uses. Creates the file from ``borrador`` if there is none; otherwise
    reads it, appends the variables it does not know as "Por clasificar" (only when there are some,
    and without failing if the file is open) and says in plain Spanish what is new and what is missing.
    New variables are not used in this run."""
    ruta, donde = Path(ruta), _donde(Path(ruta))
    if not ruta.exists():
        escribir(borrador, ruta)
        print(f'No había diccionario: se creó {donde} con {_plural(len(borrador.variables), "variable", "variables")} '
              f'en estado "{LISTA}", a partir de las reglas del sistema. Los expertos pueden revisarlo y corregirlo.', flush=True)
        return borrador
    faltan = [h for h in hojas_faltantes(ruta) if h in COMPLETABLES]
    dic, nuevas, ausentes = conciliar(leer(ruta, completar_con=borrador), borrador.variables, hoy or date.today())
    cuantas = _plural(len(nuevas), 'variable nueva', 'variables nuevas')
    hojas = ', '.join(f'"{h}"' for h in faltan)
    if nuevas or faltan:
        try:
            escribir(dic, ruta)
        except PermissionError:
            if nuevas:
                print(f'Hay {cuantas} en la base: {_nombres(nuevas)}. No se pudieron agregar a {donde} porque el archivo '
                      f'está abierto. No se usan en esta corrida; cierren el archivo y corran "python -m sevarti diccionario".',
                      flush=True)
            if faltan:
                print(f'{donde} no tiene las hojas {hojas} y no se pudieron agregar porque el archivo está abierto. Esta '
                      f'corrida usa la configuración que trae el sistema; cierren el archivo y corran "python -m sevarti '
                      f'diccionario".', flush=True)
        else:
            if nuevas:
                print(f'Hay {cuantas} en la base: {_nombres(nuevas)}. Se agregaron a {donde} como "{POR_CLASIFICAR}" y no '
                      f'se usan en esta corrida. Los expertos deben revisarlas y marcarlas "{LISTA}".', flush=True)
            if faltan:
                print(f'{donde} no tenía las hojas {hojas}: se agregaron con la configuración que trae el sistema. Los '
                      f'expertos pueden revisarlas y corregirlas.', flush=True)
    if ausentes:
        print(f'{_plural(len(ausentes), "variable", "variables")} en estado "{LISTA}" que la base ya no trae: '
              f'{_nombres(ausentes)}. Siguen en el diccionario; esta corrida no tiene datos de ellas.', flush=True)
    usadas = int((dic.variables.estado == LISTA).sum())
    print(f'Diccionario {donde}: {usadas} de {len(dic.variables)} variables en uso ("{LISTA}").', flush=True)
    return dic
