"""The clinical configuration, as the experts write it in the variable dictionary.

The sheets "Desenlaces", "Crecimiento" and "Curva OMS" of ``entradas/diccionario.xlsx`` say which
outcomes are predicted, at which visit, how each is read from the data and what it is compared with,
which growth measures are compared with the WHO curve, in which unit, and how the curve is chosen.
This module only turns them into the ``ConfigClinica`` the engine runs on. A row that cannot be used
is left out with the reason, in the experts' words; the rest go on.
"""
from __future__ import annotations

import pandas as pd

from archivos import carpetas as CA
from clinico import crecimiento as CR
from clinico.modelo import ConfigClinica, Desenlace
from sevarti import diccionario as D
from sevarti.contrato import etiquetas_categoria

DEL_NINO = ('eg_semanas',)   # what the model knows of every child besides the variables (SEVARTI ``sujetos``)
PERCENTIL = 10.0             # "Porcentaje más bajo" left blank
CON_VARIABLE = ('en_codigos', 'mayor_que_cero', 'percentil_bajo')


def cargar(prueba: bool = False) -> ConfigClinica:
    """The configuration in the project's dictionary: the outcomes and measures "En uso", and with
    ``prueba`` also those "En prueba"."""
    return leer(D.leer(CA.PROYECTO.diccionario), prueba)


def leer(dic: D.Diccionario, prueba: bool = False) -> ConfigClinica:
    estados = {D.EN_USO, D.EN_PRUEBA} if prueba else {D.EN_USO}
    sexo, codigos_sexo, etapas = _curva(dic)
    descartados: dict[str, str] = {}
    medidas: dict[str, CR.Medida] = {}
    for fila in dic.crecimiento[dic.crecimiento.estado.isin(estados)].itertuples():
        medida = _medida(fila, dic)
        if isinstance(medida, str):
            descartados[f'crecimiento: {D.mostrado("Crecimiento", "indicador", fila.indicador)}'] = medida
        else:
            medidas[fila.indicador] = medida
    desenlaces = []
    for fila in dic.desenlaces[dic.desenlaces.estado.isin(estados)].itertuples():
        des = _desenlace(fila, dic, medidas, etapas)
        if isinstance(des, str):
            descartados[fila.clave] = des
        else:
            desenlaces.append(des)
    return ConfigClinica(desenlaces=tuple(desenlaces), sexo=sexo, codigos_sexo=codigos_sexo,
                         medidas=tuple(medidas.values()), etapas_crecimiento=etapas,
                         descartados=tuple(descartados.items()))


def _texto(v: object) -> str | None:
    return (v.strip() or None) if isinstance(v, str) else None


def _curva(dic: D.Diccionario) -> tuple[str, tuple[tuple[str, int], ...], tuple[str, ...]]:
    """The sex variable, its codes for the WHO tables (1 boys, 2 girls) and the visits the curve
    applies to. Without them no growth can be read, so a problem here stops the run."""
    if dic.curva.empty:
        raise ValueError('La hoja "Curva OMS" del diccionario de variables está vacía: sin la variable del sexo y las '
                         'visitas no se puede comparar el crecimiento con la curva de la OMS.')
    fila = dic.curva.iloc[0]
    etapas = D.partes(fila.etapas)
    if fuera := [e for e in etapas if e not in set(dic.visitas.etapa)]:
        raise ValueError(f'La hoja "Curva OMS" del diccionario de variables nombra visitas que no están en la hoja '
                         f'"Visitas": {", ".join(fuera)}.')
    return fila.sexo, ((fila.codigo_nino, 1), (fila.codigo_nina, 2)), etapas


def _medida(fila: object, dic: D.Diccionario) -> CR.Medida | str:
    """The growth measure of one row of "Crecimiento", or why it cannot be used."""
    nombre = D.mostrado('Crecimiento', 'indicador', fila.indicador)
    magnitud, (de_la_unidad, factor) = CR.MAGNITUD[fila.indicador], CR.UNIDADES[fila.unidad]
    if de_la_unidad != magnitud:
        return f'la unidad {fila.unidad} no es de {magnitud}, que es lo que mide {nombre}'
    por_talla = _texto(fila.por_talla) if fila.indicador == 'peso_para_talla' else None
    if fila.indicador == 'peso_para_talla' and por_talla is None:
        return 'falta "Con la talla de": el peso para la talla necesita la talla tomada en la misma visita'
    conceptos = set(dic.variables.concepto.dropna())
    if faltan := [c for c in (fila.concepto, por_talla) if c and c not in conceptos]:
        return f'ninguna variable de la hoja "Variables" tiene "{faltan[0]}" en "Qué mide"'
    return CR.Medida(fila.concepto, fila.indicador, factor=factor, restringido=fila.indicador in CR.RESTRINGIDOS,
                     por_talla=por_talla, z_bajo=CR.Z_BAJO if pd.isna(fila.z_bajo) else float(fila.z_bajo),
                     caida=CR.CAIDA if pd.isna(fila.caida) else float(fila.caida))


def _codigos(texto: object) -> tuple[float, ...] | None:
    """The codes in a ';' separated cell, or None if one of them is not a number."""
    try:
        return tuple(float(p) for p in D.partes(texto))
    except ValueError:
        return None


def _desenlace(fila: object, dic: D.Diccionario, medidas: dict[str, CR.Medida],
               etapas_curva: tuple[str, ...]) -> Desenlace | str:
    """The outcome of one row of "Desenlaces", or why it cannot be used."""
    regla, como = fila.regla, D.mostrado('Desenlaces', 'regla', fila.regla)
    variables = dic.variables.set_index('variable')
    if fila.momento not in set(dic.visitas.etapa):
        return f'la visita "{fila.momento}" no está en la hoja "Visitas"'
    solo_desde = _texto(fila.solo_desde)
    if solo_desde and solo_desde not in set(dic.quiebres.quiebre):
        return f'el quiebre "{solo_desde}" no está en la hoja "Quiebres"'
    comparar = D.partes(fila.comparar)
    if fuera := [c for c in comparar if c not in variables.index and c not in DEL_NINO]:
        return f'"Comparar con" nombra {", ".join(fuera)}, que no está en la hoja "Variables"'
    variable = _texto(fila.variable) if regla in CON_VARIABLE else None
    if regla in CON_VARIABLE and variable is None:
        return f'falta la "Variable": "{como}" la necesita'
    if variable is not None and variable not in variables.index:
        return f'la variable {variable} no está en la hoja "Variables"'
    extra: dict = {}
    if regla == 'en_codigos':
        si, no = _codigos(fila.codigos), _codigos(fila.negativos)
        if not si:
            return 'faltan los "Códigos de sí"' if si == () else '"Códigos de sí" tiene algo que no es un código'
        if not no:
            return ('faltan los "Códigos de no": sin ellos un "No hay dato" contaría como que no pasó' if no == ()
                    else '"Códigos de no" tiene algo que no es un código')
        if set(si) & set(no):
            return 'un código está a la vez en "Códigos de sí" y en "Códigos de no"'
        # what "sí" means has to be a labelled code; "no" may include codes the labels leave out
        # (v275e has 9 "sin diagnóstico" in the data and not in its labels)
        etiquetas = etiquetas_categoria(dic.variables[dic.variables.variable == variable]).get(variable, {})
        if etiquetas and (fuera := [c for c in si if c not in etiquetas]):
            return (f'el código {fuera[0]:g} no está en las etiquetas de {variable} '
                    f'({variables.at[variable, "categorias"]})')
        extra = dict(codigos=si, negativos=no)
    elif regla == 'percentil_bajo':
        pct = PERCENTIL if pd.isna(fila.percentil) else float(fila.percentil)
        if not 0 < pct < 100:
            return f'"Porcentaje más bajo" es {pct:g}: tiene que estar entre 0 y 100'
        extra = dict(percentil=pct / 100)
    elif regla == 'z_bajo':
        medida, etapa = _texto(fila.medida), _texto(fila.etapa)
        if medida is None:
            return f'falta la "Medida de crecimiento": "{como}" la necesita'
        if medida not in medidas:
            return (f'la medida "{D.mostrado("Crecimiento", "indicador", medida)}" no está en uso en la hoja '
                    f'"Crecimiento" o no se pudo usar')
        if etapa is None:
            return f'falta la "Visita del desenlace": "{como}" la necesita'
        if etapa not in etapas_curva:
            return f'la visita "{etapa}" no está en "Visitas con curva" de la hoja "Curva OMS"'
        extra = dict(concepto=medidas[medida].nombre, etapa=etapa)
    return Desenlace(fila.clave, fila.nombre, fila.momento, regla, variable, solo_desde=solo_desde,
                     comparar=comparar, **extra)
