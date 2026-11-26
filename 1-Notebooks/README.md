# Notebooks

El contenido de esta carpeta es **una copia de [`insumo-datos/informes/`](../insumo-datos/informes/)**. Se duplica aquí para facilitar la revisión de la entrega.

Si hay alguna diferencia, la fuente de referencia es `insumo-datos/informes/`.

Incluye los informes (`.ipynb` y su versión `.html`):

- `informe_analisis_datos`
- `modelo_anomalias`
- `alertas_clinicas`

y los scripts que los generan (`construir_notebook.py`, `construir_modelo.py`, `construir_clinico.py`, `graficos.py`), junto con `diccionario_snapshot.csv`.

Para solo leer, abra los `.html` en el navegador. Los textos se editan en `construir_*.py` y luego se ejecuta el notebook (ver [`insumo-datos/README.md`](../insumo-datos/README.md#notebooks)).

> La plataforma KMCPred tiene su propia copia en [`proyecto-codigo/nucleo/informes/`](../proyecto-codigo/nucleo/informes/), con los parches de `proyecto-codigo/nucleo/parches/`: allí `construir_clinico.py`, `construir_modelo.py`, `alertas_clinicas` y `modelo_anomalias` difieren de los de esta carpeta.
