# Artículo del proyecto (LaTeX, IEEEtran)

**Alertas clínicas tempranas con IA interpretable en niños prematuros y de bajo peso**
Informe final tipo artículo del curso *Proyecto: despliegue de soluciones* (MAIA, Uniandes), (IEEEtran.cls v1.7a).

## Compilar

```bash
pdflatex articulo.tex && pdflatex articulo.tex      # dos pasadas para referencias cruzadas
# o bien
latexmk -pdf articulo.tex
```

Funciona también en Overleaf (subir la carpeta completa). Si el sistema tiene `babel-spanish`, el documento lo usa; si no, traduce a mano los rótulos (Figura, Tabla, Resumen, Referencias).

## Estructura

| Archivo | Contenido | Criterio de la rúbrica |
|---|---|---|
| `articulo.tex` | Preámbulo, formato del curso (secciones 1, 2, 3 en negrita), título y autores | Estructura y redacción (10) |
| `secciones/00_resumen.tex` | Resumen y palabras clave | Estructura y redacción |
| `secciones/01_introduccion.tex` | Contexto, problema en dos partes demostrado con datos, pregunta y aportes | Planteamiento del problema (10) |
| `secciones/02_estado_del_arte.tex` | Revisión crítica en cinco ejes y Tabla I comparativa | Estado del arte (10) |
| `secciones/03_metodologia.tex` | Enfoque, datos y SEVARTI, preprocesamiento, dos etapas, validación, herramientas y despliegue | Metodología (30) |
| `secciones/04_resultados.tex` | Calidad y cobertura, anomalías, alertas clínicas, OMS, validación retrospectiva, despliegue | Resultados (15) |
| `secciones/05_discusion.tex` | Interpretación, aportes, aplicaciones (Tabla V), limitaciones y ética | Discusión y aportes (15) |
| `secciones/06_conclusiones.tex` | Conclusiones y trabajo futuro | Conclusiones (10) |
| `figuras/*.tex` | Figuras en TikZ/pgfplots (arquitectura, cobertura, errores), legibles en escala de grises | — |
| `figuras/sevarti.jpg` | Modelo SEVARTI de la Fundación Canguro | — |
| `referencias.tex` | Bibliografía IEEE, **generada** (no editar a mano) | — |
| `herramientas/ordenar_referencias.py` | Ordena la bibliografía por primera cita | — |

Hoy el PDF tiene 9 páginas; el límite es 12.

## Pendientes antes de entregar

El texto marca en **rojo** con `\pendiente{...}` lo que depende de resultados que todavía no existen. Buscar `\pendiente` y reemplazar:

1. Cifras de crecimiento con los límites exactos de la OMS para dato improbable (sección 3.5 y Tabla IV).
2. PR-AUC y días de anticipación por desenlace (sección 4.3).
3. Tabla de los cuatro desenlaces de crecimiento a 12 meses (sección 4.4).
4. Periodo en silencio retrospectivo (sección 4.5).
5. Plausibilidad de las explicaciones TreeSHAP y casos ilustrativos (sección 4.5).
6. Resultados del despliegue y captura del tablero (sección 4.6).
7. Cierre de las conclusiones con esos hallazgos (sección 6).

Las cifras actuales son del corte del 24/07/2026 y salen de los informes de `insumo-datos/informes/`. Si se vuelve a correr el pipeline, hay que actualizarlas.

## Referencias

Las referencias viven en `herramientas/ordenar_referencias.py` (diccionario `REFS`, texto en formato IEEE). Para agregar una: añadirla a `REFS`, citarla con `\cite{clave}` y correr

```bash
python herramientas/ordenar_referencias.py
```

El script reescribe `referencias.tex` con solo las citadas y en orden de primera aparición, como pide el estilo IEEE, y avisa si hay claves sin referencia.
