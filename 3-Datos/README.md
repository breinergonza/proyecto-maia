# Datos

Esta carpeta tiene dos cosas:

- [`Modelo-Datos-Solucion/`](Modelo-Datos-Solucion/README.md): el modelo de datos de la base PostgreSQL de la solución. En `DDL/`, los scripts que crean las bases, los esquemas, las 37 tablas, las llaves y los índices; en `DML/`, los datos iniciales, una cohorte de 30 niños inventados, las operaciones de la aplicación y consultas frecuentes. Generado desde las migraciones del código y probado en PostgreSQL 16.
- `diccionario.xlsx`: el diccionario de variables, **una copia de [`4-Insumos-Proyecto/insumo-datos/entradas/`](../4-Insumos-Proyecto/insumo-datos/entradas/)** que se duplica aquí para facilitar la revisión de la entrega. Si hay alguna diferencia, la fuente de referencia es `4-Insumos-Proyecto/insumo-datos/entradas/`.

Sobre el diccionario:

- `diccionario.xlsx`: diccionario de datos (hojas Instrucciones, Variables, Visitas, Episodios, Quiebres, Desenlaces, Crecimiento y Curva OMS). Trae 318 variables en estado «Lista» y 52 desenlaces: 14 «En uso» y 38 «En prueba». No tiene datos de pacientes.

> La plataforma KMCPred no arranca con este archivo sino con su propio diccionario semilla, [`6-Codigo-Fuente-Proyecto/nucleo/entradas/diccionario.xlsx`](../6-Codigo-Fuente-Proyecto/nucleo/entradas/diccionario.xlsx), que tiene las mismas 318 variables pero deja por defecto solo dos desenlaces a los 12 meses: desarrollo psicomotor bajo («En uso») y talla baja calculada a las 40 semanas y a los 3, 6 y 9 meses («En prueba»); los otros 47 quedan en «No usar» (decisión D68 de [`6-Codigo-Fuente-Proyecto/docs/decisiones.md`](../6-Codigo-Fuente-Proyecto/docs/decisiones.md)).
