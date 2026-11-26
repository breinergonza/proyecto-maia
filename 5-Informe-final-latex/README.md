# Informe final KMCPred (LaTeX, IEEEtran)

Conversión de `informe.docx` a LaTeX con la misma estructura de [`4-Insumos-Proyecto/insumo-proyecto-latex/`](../4-Insumos-Proyecto/insumo-proyecto-latex/README.md).

## Compilar

```bash
latexmk -pdf articulo.tex      # o: pdflatex articulo.tex (dos veces)
```

## Estructura

- `articulo.tex`: preámbulo, título, autores, agradecimientos y declaración de uso de IA.
- `articulo.pdf`: el informe compilado (11 páginas). `informe.docx`: el original en Word. `IEEEtran.cls`: la clase del documento.
- `secciones/00_resumen.tex` … `06_conclusiones.tex`: una sección del informe por archivo.
- `figuras/image1…12`: imágenes extraídas del .docx (Fig. 1 = `image1.jpeg`, etc.).
- `referencias.tex`: 34 referencias en orden de primera cita (IEEE: orden de primera cita; claves `r1`…`r34` = número).
- Figuras, tablas, ecuaciones y secciones usan `\label` (`fig:N`, `tab:N`, `eq:N`, `sec:N.M`).
