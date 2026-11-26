# Datos

El contenido de esta carpeta es **una copia de [`insumo-datos/entradas/`](../insumo-datos/entradas/)**. Se duplica aquí para facilitar la revisión de la entrega.

Si hay alguna diferencia, la fuente de referencia es `insumo-datos/entradas/`.

Incluye:

- `diccionario.xlsx`: diccionario de datos (hojas Instrucciones, Variables, Visitas, Episodios, Quiebres, Desenlaces, Crecimiento y Curva OMS). Trae 318 variables en estado «Lista» y 52 desenlaces: 14 «En uso» y 38 «En prueba». No tiene datos de pacientes.

> La plataforma KMCPred no arranca con este archivo sino con su propio diccionario semilla, [`proyecto-codigo/nucleo/entradas/diccionario.xlsx`](../proyecto-codigo/nucleo/entradas/diccionario.xlsx), que tiene las mismas 318 variables pero deja por defecto solo dos desenlaces a los 12 meses: desarrollo psicomotor bajo («En uso») y talla baja calculada a las 40 semanas y a los 3, 6 y 9 meses («En prueba»); los otros 47 quedan en «No usar» (decisión D68 de [`proyecto-codigo/docs/decisiones.md`](../proyecto-codigo/docs/decisiones.md)).
