# Modelos

Esta carpeta contiene los modelos entrenados de MAIA, organizados como `<modelo>/<versión>/`:

| Modelo | Versión | Contenido |
|---|---|---|
| `maia-anomalias/` | `v8/` | `ficha.json`, `mascara_9eea708fbf.csv.gz`, `modelo.pkl.txt` |
| `maia-clinico/` | `v9/` | `ficha.json`, `modelo.pkl.txt` |

## Sobre los archivos `modelo.pkl.txt`

Los modelos serializados (`modelo.pkl`) son demasiado pesados para subirlos al repositorio. Por eso, en lugar del `.pkl` real, cada versión incluye un archivo **`modelo.pkl.txt`**: un archivo de texto cuyo único contenido es la **URL de descarga** del `modelo.pkl` correspondiente (alojado en SharePoint).

### Cómo obtener un modelo

1. Abra el `modelo.pkl.txt` de la versión que quiere revisar y copie la URL.
2. Descargue el archivo desde esa URL.
3. Guárdelo en la misma carpeta con el nombre `modelo.pkl` (sin el `.txt`), por ejemplo `Modelos/maia-clinico/v9/modelo.pkl`.

### Otros archivos

- `ficha.json`: metadatos del entrenamiento (versión, fecha, corte de datos, configuración y métricas de validación). Se puede revisar sin descargar el `.pkl`.
- `mascara_*.csv.gz`: máscara usada por el modelo de anomalías.

> Nota: los `.pkl` son archivos de `pickle`; descárguelos solo desde las URL indicadas aquí.
