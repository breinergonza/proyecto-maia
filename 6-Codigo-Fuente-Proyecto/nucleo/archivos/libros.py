"""The workbooks the Fundación receives, written for the people who read and fill them.

Each workbook opens on an instructions sheet: what it is, what to do, which sheets it has and
what every column means. Data sheets have readable headers, frozen and filterable. The columns
to fill are highlighted and only accept their listed answers. ``leer`` maps a filled sheet back
to the internal column names, so the analysis never depends on how a header is worded.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HOJA_INSTRUCCIONES = 'Instrucciones'
RESPUESTAS_SI_NO = ('Sí', 'No', 'No sé')
VACIA = 'No hay filas en esta corrida.'

_NEGRITA = Font(bold=True)
_TITULO = Font(bold=True, size=14)
_ENCABEZADO = PatternFill('solid', fgColor='D9E1F2')
_PARA_LLENAR = PatternFill('solid', fgColor='FFF2CC')
_ARRIBA = Alignment(vertical='top')
_AJUSTAR = Alignment(vertical='top', wrap_text=True)


@dataclass(frozen=True)
class Columna:
    clave: str                       # internal column name
    titulo: str                      # header the reader sees
    explica: str                     # what it means, on the instructions sheet
    ancho: int = 14
    opciones: tuple[str, ...] = ()   # the answers it accepts; only columns to fill have them
    largo: bool = False              # long text, wrapped
    formato: str | None = None       # Excel number format
    solo_si_varia: bool = False      # left out when every row has the same value
    numero: bool = False             # values stored as text (a datum as recorded) shown as numbers when they are
    lista: str = ''                  # the answers are the cells of this range (e.g. another sheet's first column)
    texto: bool = False              # read back as text even if it is not a column to fill (codes such as '9')
    opcional: bool = False           # a file made before the column was added may lack it

    @property
    def para_llenar(self) -> bool:
        return bool(self.opciones) or bool(self.lista) or self.clave == 'comentario'


@dataclass(frozen=True)
class Hoja:
    nombre: str
    describe: str
    columnas: tuple[Columna, ...]
    filas_extra: int = 0   # blank rows under the data that also take the answers, for sheets people add rows to


@dataclass(frozen=True)
class Libro:
    titulo: str
    instrucciones: tuple[str, ...]
    hojas: tuple[Hoja, ...]

    def hoja(self, nombre: str) -> Hoja:
        return next(h for h in self.hojas if h.nombre == nombre)


def decimal(v: float, cifras: int = 1) -> str:
    """A number inside a sentence, with a decimal comma."""
    return f'{v:.{cifras}f}'.replace('.', ',')


def valor_legible(v: object, etiquetas: dict[float, str] | None = None) -> str:
    """A child's value inside a sentence: 'sin dato', the label of a code, a whole number with
    thousands separators, or one decimal with a comma."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return 'sin dato'
    if isinstance(v, bool):
        return str(v)
    try:
        x = float(v)   # a categorical value arrives as text ('9.0')
    except (TypeError, ValueError):
        return str(v)
    if etiquetas and x in etiquetas:
        return etiquetas[x]
    return _miles(int(round(x))) if x.is_integer() or abs(x) >= 100 else decimal(x)


def _miles(n: int) -> str:
    return f'{n:,}'.replace(',', '.')


def _celdas(tabla: pd.DataFrame, c: Columna) -> list:
    col = tabla[c.clave]
    if c.numero:
        x = pd.to_numeric(col, errors='coerce')
        col = x.astype(object).where(x.notna(), col)
    col = col.astype(object)
    return col.where(col.notna(), None).tolist()


_ANCHO_A, _ANCHO_B = 34, 100


def _hoja_instrucciones(wb: Workbook, libro: Libro, notas: tuple[str, ...], usadas: list[tuple[Hoja, list[Columna], int]]) -> None:
    ws = wb.create_sheet(HOJA_INSTRUCCIONES)
    ws.column_dimensions['A'].width = _ANCHO_A
    ws.column_dimensions['B'].width = _ANCHO_B
    numero = 0

    def fila(*valores: object, fuente: Font | None = None) -> None:
        nonlocal numero
        numero += 1
        celdas = []
        for v in valores:
            c = WriteOnlyCell(ws, value=v)
            if fuente:
                c.font = fuente
            c.alignment = _AJUSTAR
            celdas.append(c)
        ws.append(celdas)

    def parrafo(texto: str, fuente: Font | None = None, alto: float = 15) -> None:
        # a paragraph spans both columns; Excel does not grow a merged row by itself, and a
        # streamed sheet takes the height before the row is written
        lineas = -(-len(texto) // int(0.9 * (_ANCHO_A + _ANCHO_B)))
        ws.row_dimensions[numero + 1].height = alto * max(lineas, 1)
        fila(texto, fuente=fuente)
        ws.merged_cells.add(f'A{numero}:B{numero}')

    parrafo(libro.titulo, fuente=_TITULO, alto=22)
    for texto in (*notas, *libro.instrucciones):
        parrafo(texto)
    fila()
    fila('Hojas de este archivo', fuente=_NEGRITA)
    for hoja, _, n in usadas:
        fila(hoja.nombre, f'{hoja.describe} ({_miles(n)} filas)')
    for hoja, columnas, _ in usadas:
        fila()
        fila(f'Columnas de la hoja "{hoja.nombre}"', fuente=_NEGRITA)
        for c in columnas:
            extra = f' Respuestas: {", ".join(c.opciones)}.' if c.opciones else ''
            fila(c.titulo, c.explica + extra)


def _hoja_datos(wb: Workbook, hoja: Hoja, columnas: list[Columna], tabla: pd.DataFrame) -> None:
    ws = wb.create_sheet(hoja.nombre)
    for i, c in enumerate(columnas, start=1):
        ws.column_dimensions[get_column_letter(i)].width = c.ancho
    ws.freeze_panes = 'B2'
    ultima = get_column_letter(len(columnas))
    ws.auto_filter.ref = f'A1:{ultima}{max(len(tabla), 1) + 1}'
    for i, c in enumerate(columnas, start=1):
        if (c.opciones or c.lista) and len(tabla):
            letra = get_column_letter(i)
            dv = DataValidation(type='list', formula1=c.lista or '"' + ','.join(c.opciones) + '"', allow_blank=True,
                                showErrorMessage=True, errorTitle='Respuesta no válida',
                                error=f'Elija una de estas respuestas: {", ".join(c.opciones)}.' if c.opciones
                                else 'Elija un valor de la lista.',
                                showInputMessage=True, promptTitle=c.titulo, prompt=c.explica[:255])
            dv.add(f'{letra}2:{letra}{len(tabla) + 1 + hoja.filas_extra}')
            ws.data_validations.append(dv)

    encabezado = []
    for c in columnas:
        celda = WriteOnlyCell(ws, value=c.titulo)
        celda.font, celda.alignment = _NEGRITA, _AJUSTAR
        celda.fill = _PARA_LLENAR if c.para_llenar else _ENCABEZADO
        encabezado.append(celda)
    ws.append(encabezado)

    if tabla.empty:
        celda = WriteOnlyCell(ws, value=VACIA)
        celda.font = Font(italic=True)
        ws.append([celda])
        return
    valores = [_celdas(tabla, c) for c in columnas]
    for fila in zip(*valores):
        celdas = []
        for c, v in zip(columnas, fila):
            celda = WriteOnlyCell(ws, value=v)
            celda.alignment = _AJUSTAR if c.largo else _ARRIBA
            if c.formato:
                celda.number_format = c.formato
            if c.para_llenar:
                celda.fill = _PARA_LLENAR
            celdas.append(celda)
        ws.append(celdas)


def escribir(libro: Libro, ruta: Path, tablas: dict[str, pd.DataFrame], notas: tuple[str, ...] = ()) -> Path:
    """The workbook at ``ruta``: instructions first (``notas`` are lines of this run, such as
    the dates it covers), then one sheet per table, keyed by sheet name."""
    usadas = []
    for hoja in libro.hojas:
        tabla = tablas[hoja.nombre]
        columnas = [c for c in hoja.columnas if not (c.solo_si_varia and tabla[c.clave].nunique(dropna=False) <= 1)]
        faltan = [c.clave for c in columnas if c.clave not in tabla]
        if faltan:
            raise KeyError(f'A la tabla de la hoja "{hoja.nombre}" le faltan columnas: {faltan}')
        usadas.append((hoja, columnas, len(tabla)))
    wb = Workbook(write_only=True)
    _hoja_instrucciones(wb, libro, notas, usadas)
    for hoja, columnas, _ in usadas:
        _hoja_datos(wb, hoja, columnas, tablas[hoja.nombre])
    ruta.parent.mkdir(parents=True, exist_ok=True)
    wb.save(ruta)
    return ruta


def leer(libro: Libro, ruta: Path, nombre: str) -> pd.DataFrame:
    """A sheet as it came back, with the internal column names. The answer columns are read
    as text, as the person wrote them."""
    hoja = libro.hoja(nombre)
    titulos = {c.titulo: c.clave for c in hoja.columnas}
    with pd.ExcelFile(ruta) as archivo:
        if nombre not in archivo.sheet_names:
            raise ValueError(f'{ruta.name} no tiene la hoja "{nombre}": no es un archivo que haya generado '
                             'este sistema. Hay que generarlo de nuevo con "muestra".')
        tabla = archivo.parse(nombre, dtype={c.titulo: str for c in hoja.columnas if c.para_llenar or c.texto})
    faltan = [c.titulo for c in hoja.columnas
              if (c.para_llenar or c.texto or c.clave == 'id') and not c.opcional and c.titulo not in tabla]
    if faltan:
        raise ValueError(f'La hoja "{nombre}" de {ruta.name} no tiene las columnas {faltan}: '
                         'puede que hayan cambiado los encabezados.')
    return tabla.rename(columns=titulos)


# =================================================================== the workbooks

_N = Columna('id', 'N°', 'Número de la fila. No lo cambien: con él se juntan sus respuestas.', 6)
_PACIENTE = Columna('sujeto', 'Código del paciente', 'Código del paciente en la base de origen, por si necesitan '
                    'buscar su historia.', 16)
_NINO = Columna('sujeto', 'Código del niño', 'Código del niño en la base de origen, por si necesitan buscar su '
                'historia.', 16)
_QUE = Columna('etiqueta', 'Qué se midió', 'La pregunta del formulario.', 32, largo=True)
_CODIGO = Columna('variable', 'Código de la variable', 'Código de la pregunta en la base.', 14)
_UNIDAD = Columna('unidad', 'Unidad', 'Unidad del valor.', 10)
_VISITA = Columna('etapa', 'Visita', 'Visita o momento en que se anotó.', 24)
_COMENTARIO = Columna('comentario', 'Comentario', 'Opcional: lo que quieran agregar.', 40, largo=True)

EXPERTOS = Libro(
    titulo='Revisión de datos por expertos',
    instrucciones=(
        'Queremos saber qué tan seguido acierta el sistema cuando marca un dato como posible error de registro. '
        'Para eso necesitamos su criterio.',
        'Cada fila es un dato anotado en la historia de un paciente. Algunos los marcó el sistema y otros no; '
        'no decimos cuáles, para no influir en su respuesta.',
        'Qué hacer: en la hoja "Datos", lean cada fila (el valor, la edad del paciente y la misma medida en sus otras visitas) '
        'y respondan en la columna amarilla "¿Es un error?": Sí, No o No sé. Si quieren, dejen un comentario.',
        'No cambien las demás columnas ni borren filas. Cuando terminen, devuelvan este mismo archivo.',
    ),
    hojas=(Hoja('Datos', 'Los datos a revisar, en orden aleatorio', (
        _N, _QUE,
        Columna('valor', 'Valor anotado', 'El valor que quedó registrado.', 12, numero=True),
        _UNIDAD, _VISITA,
        Columna('edad_dias', 'Edad (días de vida)', 'Días desde el nacimiento hasta el dato.', 12),
        Columna('eg_semanas', 'Semanas de gestación al nacer', 'Edad gestacional del paciente al nacer.', 14),
        Columna('misma_medida_en_el_tiempo', 'La misma medida en sus visitas',
                'Los valores de esa medida en todas las visitas del paciente, en orden de edad.', 50, largo=True),
        Columna('es_error', '¿Es un error?', 'Su respuesta: ¿este dato está mal anotado?', 14, opciones=RESPUESTAS_SI_NO),
        _COMENTARIO, _PACIENTE,
        Columna('fecha', 'Fecha', 'Fecha del dato.', 12, formato='yyyy-mm-dd'),
        _CODIGO,
    )),),
)

MEDICOS = Libro(
    titulo='Revisión de niños por médicos del programa',
    instrucciones=(
        'Queremos saber si el sistema reconoce a los niños que más le preocupan a un médico del programa.',
        'Cada fila es un niño y una pregunta sobre algo que podría pasarle antes de su siguiente visita, por ejemplo '
        'una readmisión. Un niño puede aparecer en varias filas, una por pregunta. A algunos el sistema les da '
        'riesgo alto y a otros no; no decimos a cuáles.',
        'Qué hacer: en la hoja "Niños", lean la pregunta y los datos del niño (y su historia, si quieren) y respondan '
        'en la columna amarilla "¿Le preocupa?": Sí, No o No sé. Si quieren, dejen un comentario.',
        'No cambien las demás columnas ni borren filas. Cuando terminen, devuelvan este mismo archivo.',
    ),
    hojas=(Hoja('Niños', 'Los niños a revisar, en orden aleatorio', (
        _N,
        Columna('pregunta', 'Pregunta', 'Lo que podría pasarle al niño antes de su siguiente visita.', 40, largo=True),
        Columna('datos_del_nino', 'Datos del niño', 'Los mismos datos para todos los niños: los que más pesan '
                'en el sistema para esa pregunta.', 50, largo=True),
        Columna('le_preocupa', '¿Le preocupa?', 'Su respuesta: ¿le preocupa este niño por lo que dice la pregunta?',
                14, opciones=RESPUESTAS_SI_NO),
        _COMENTARIO,
        Columna('visita', 'Última visita', 'La última visita del niño.', 24),
        Columna('fecha_visita', 'Fecha de la visita', 'Fecha de esa visita.', 12, formato='yyyy-mm-dd'),
        _NINO,
    )),),
)

REVISION = Libro(
    titulo='Datos para revisar',
    instrucciones=(
        'El sistema revisó los datos de la base y marcó los que podrían estar mal anotados. Revisen la historia '
        'del paciente y corrijan en la base lo que sea un error.',
        'La hoja "Datos" va en orden de prioridad: primero los que marcaron más revisiones distintas y los que '
        'quedaron más lejos de lo esperado. Una visita con una edad que no corresponde a esa visita va en una sola '
        'fila, con la edad anotada y la ventana de edad de la visita.',
        'La hoja "Grupos" muestra cambios de un grupo completo en un periodo, por ejemplo más datos faltantes '
        'que de costumbre. La hoja "No usados" lista los datos que no se pudieron analizar y por qué.',
    ),
    hojas=(
        Hoja('Datos', 'Datos que podrían estar mal anotados, el más urgente primero', (
            Columna('prioridad', 'Prioridad', '1 es el más urgente.', 9),
            _QUE,
            Columna('valor', 'Valor anotado', 'El valor que quedó registrado.', 12, numero=True),
            _UNIDAD,
            Columna('esperado', 'Valor esperado', 'Lo que se esperaba según la revisión que lo marcó: los otros datos '
                    'del paciente, su dato anterior o lo usual de esa pregunta. Vacío si lo marcado no es el valor '
                    '(por ejemplo, visitas en desorden).', 12, formato='0.0'),
            Columna('rango_bajo', 'Esperado desde', 'Límite bajo de lo esperado. En una visita fuera de su ventana, '
                    'la edad más temprana de esa visita.', 12, formato='0.0'),
            Columna('rango_alto', 'Esperado hasta', 'Límite alto de lo esperado. En una visita fuera de su ventana, '
                    'la edad más tardía de esa visita.', 12, formato='0.0'),
            Columna('motivos', 'Por qué se marcó', 'Qué vio el sistema.', 44, largo=True),
            Columna('n_capas', 'Revisiones que lo marcaron (de 3)',
                    'El sistema revisa cada dato de tres formas: el valor solo, el valor frente al resto de los '
                    'datos del paciente y su trayectoria entre visitas.', 14),
            _VISITA,
            Columna('fecha', 'Fecha', 'Fecha del dato.', 12, formato='yyyy-mm-dd'),
            _PACIENTE,
            Columna('grupo', 'Grupo', 'Grupo del paciente (por ejemplo, la sede).', 16, solo_si_varia=True),
            _CODIGO,
        )),
        Hoja('Grupos', 'Cambios de un grupo completo en un periodo', (
            Columna('grupo', 'Grupo', 'Grupo de pacientes (por ejemplo, la sede).', 18),
            Columna('periodo', 'Periodo', 'Cuándo cambió (2024 T1 es el primer trimestre de 2024).', 10),
            _QUE,
            Columna('que_paso', 'Qué cambió', 'Lo que pasó en el periodo frente a lo habitual del mismo grupo.',
                    60, largo=True),
            _CODIGO,
        )),
        Hoja('No usados', 'Datos que no se pudieron analizar', (
            _PACIENTE, _QUE, _CODIGO,
            Columna('motivo', 'Por qué no se usó', 'Por ejemplo, un texto donde va un número o una fecha '
                    'después del corte.', 40, largo=True),
        )),
    ),
)

RIESGOS = Libro(
    titulo='Riesgo de los niños que esperan su siguiente visita',
    instrucciones=(
        'Para cada niño que todavía espera su siguiente visita, el riesgo de cada cosa que podría pasarle antes de '
        'esa visita (por ejemplo, una readmisión o no volver).',
        'Riesgo (%): la probabilidad estimada con niños parecidos de años anteriores. '
        'Posición: de 0 a 100; 90 quiere decir que su riesgo es más alto que el del 90% de los niños con que se '
        'calibró el sistema. Por qué: los datos del niño que más subieron su riesgo.',
        'El archivo trae a todos los niños. A cuántos se llama o se cita lo decide el equipo, no el sistema.',
        'La hoja "Crecimiento" lista las medidas por debajo de la curva de la OMS o que cayeron desde la visita '
        'anterior. "Revisar el dato" quiere decir que el valor es tan extremo, o la edad anotada tan lejos de la '
        'de esa visita, que probablemente está mal anotado.',
    ),
    hojas=(
        Hoja('Riesgo', 'Un niño por fila y por desenlace, el riesgo más alto primero', (
            Columna('desenlace', 'Qué podría pasar', 'El desenlace al que se refiere el riesgo.', 40, largo=True),
            Columna('riesgo', 'Riesgo (%)', 'Probabilidad estimada, de 0 a 100.', 10, formato='0.0'),
            Columna('percentil', 'Posición (0 a 100)', 'Cuántos de cada 100 niños tienen un riesgo menor.', 12,
                    formato='0'),
            Columna('motivos', 'Por qué', 'Los datos del niño que más subieron su riesgo.', 50, largo=True),
            Columna('momento', 'Última visita', 'La visita desde la que se calcula.', 24),
            Columna('fecha_visita', 'Fecha de la visita', 'Fecha de esa visita.', 12, formato='yyyy-mm-dd'),
            _NINO,
        )),
        Hoja('Crecimiento', 'Medidas fuera de la curva de la OMS', (
            _NINO, _VISITA,
            Columna('concepto', 'Medida', 'Peso, talla o perímetro cefálico.', 18),
            Columna('ec_dias', 'Edad corregida (días)', 'Edad descontando lo que nació antes de término.', 12,
                    formato='0'),
            Columna('z', 'Puntaje z', 'Desviaciones estándar frente a la curva de la OMS; -2 o menos es bajo.', 10,
                    formato='0.00'),
            Columna('z_previo', 'Puntaje z anterior', 'El de la visita anterior, para ver la caída.', 12,
                    formato='0.00'),
            Columna('motivo', 'Qué pasó', 'Por debajo de la curva, cayó desde la visita anterior, o revisar el dato '
                    '(valor extremo o edad que no es la de esa visita).',
                    44, largo=True),
        )),
        Hoja('Resumen', 'Cuántos niños hay y su riesgo promedio, por desenlace', (
            Columna('desenlace', 'Qué podría pasar', 'El desenlace.', 44, largo=True),
            Columna('niños', 'Niños', 'Niños con riesgo calculado.', 10),
            Columna('riesgo_medio', 'Riesgo promedio (%)', 'Promedio del riesgo de esos niños.', 14, formato='0.0'),
            Columna('riesgo_mediano', 'Riesgo mediano (%)', 'La mitad de los niños tiene un riesgo menor.', 14,
                    formato='0.0'),
        )),
    ),
)
