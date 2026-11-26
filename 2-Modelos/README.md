# Modelos

Esta carpeta contiene los modelos entrenados de MAIA, organizados como `<modelo>/<versión>/`:

| Modelo | Versión | Contenido |
|---|---|---|
| `maia-anomalias/` | `v8/` | `ficha.json`, `mascara_9eea708fbf.csv.gz`, `modelo.pkl.txt` |
| `maia-clinico/` | `v9/` | `ficha.json`, `modelo.pkl.txt` |

Los nombres de las carpetas son los de los modelos registrados en MLflow por la plataforma KMCPred. Según sus fichas, las dos versiones se entrenaron el 23/11/2026 con el corte del 24/07/2026 (62.043 niños):

- `maia-anomalias/v8` (versión `9eea708fbf`): modelo de anomalías con `alpha` = 0,05 y 132 modelos contextuales (capa 2).
- `maia-clinico/v9` (versión `c299096a71`): los dos desenlaces por defecto (D68), con el AUC de validación frente a la regla simple que trae la ficha:

| Desenlace (a los 12 meses) | Riesgo calculado a | AUC | AUC regla simple |
|---|---|---|---|
| Desarrollo psicomotor bajo | 6 meses EC | 0,77 | 0,62 |
| Talla baja para la edad | 40 semanas | 0,79 | 0,61 |
| Talla baja para la edad | 3 meses EC | 0,86 | 0,60 |
| Talla baja para la edad | 6 meses EC | 0,91 | 0,59 |
| Talla baja para la edad | 9 meses EC | 0,93 | 0,60 |

## Sobre los archivos `modelo.pkl.txt`

Los modelos serializados (`modelo.pkl`) son demasiado pesados para subirlos al repositorio. Por eso, en lugar del `.pkl` real, cada versión incluye un archivo **`modelo.pkl.txt`**: un archivo de texto cuyo único contenido es la **URL de descarga** del `modelo.pkl` correspondiente (alojado en SharePoint).

### Cómo obtener un modelo

1. Abra el `modelo.pkl.txt` de la versión que quiere revisar y copie la URL.
2. Descargue el archivo desde esa URL.
3. Guárdelo en la misma carpeta con el nombre `modelo.pkl` (sin el `.txt`), por ejemplo `2-Modelos/maia-clinico/v9/modelo.pkl`.

### Otros archivos

- `ficha.json`: metadatos del entrenamiento (versión, fecha, corte de datos, configuración y métricas de validación). Se puede revisar sin descargar el `.pkl`.
- `mascara_*.csv.gz`: máscara usada por el modelo de anomalías.

> Nota: los `.pkl` son archivos de `pickle`; descárguelos solo desde las URL indicadas aquí.
