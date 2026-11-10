# Evaluación de Analítica frente al plan (v3.7, sección 6)

Fecha: 2026-11-09. Base: capturas a 1440 px de la pila local (5.000 niños simulados, entrenamiento `1000000`,
desenlace readmisión 40 sem–3 m, usuario admin) comparadas con las maquetas del plan (`a01`–`a10`, `b01`–`b03`).
No se revisó el teléfono.

Escala: ✅ como el plan · 🟡 parcial · ❌ falta o se ve mal.

## Marco común

| Punto | Plan | Hoy | Estado |
| --- | --- | --- | --- |
| Título | «Analítica › Submódulo» con la pregunta debajo | «Analítica de los modelos» fijo en las 11 páginas | ❌ |
| Navegación | Menú lateral desplegable con los 11 | Menú lateral **y** una fila de píldoras que repite lo mismo y se corta (Comparar no cabe a 1440 px) | ❌ |
| Contexto | 4 selectores (entrenamiento, modelo y versión, desenlace, evaluación) + línea de muestra | Modelo y Evaluación son texto fijo; el selector de entrenamiento se corta («Entrenamiento 1000000 · 9 de»); sin línea de muestra | 🟡 |
| Guía de lectura y modo técnico | Arriba a la derecha, junto al título | Guía en una fila propia; el modo técnico no está a la vista | 🟡 |
| Gráficas de bosque (Resumen, Equidad) | Etiquetas legibles | El texto del SVG crece con el ancho: etiquetas de ~22 px y cortadas por la izquierda («o psicomotor bajo…») | ❌ |
| Títulos de eje | Fuera de las marcas | «Casos detectados», «Lo que ocurre en realidad», «Beneficio» se montan sobre las marcas del eje Y | ❌ |
| Nombres de variables | Del Diccionario, en lenguaje clínico | Códigos crudos: `ingreso_hogar`, `z_talla_40_sem`, `quiebre_cambio_de_sistema_2022` | ❌ |
| Mensajes | Lenguaje claro | Se filtra «el paquete shap no está instalado» | ❌ |

## Submódulos

| # | Submódulo | Lo que pide el plan | Lo que se ve | Estado |
| --- | --- | --- | --- | --- |
| 1 | Resumen | 5 cifras clave, revisión rápida (6 semáforos de una línea), ficha de la muestra, miniaturas (ROC, aciertos y errores 2×2, calibración, variables) que llevan al submódulo | Un bosque por desenlace y 4 tarjetas largas de semáforos con el texto de la regla repetido (≈2.000 px). Sin cifras clave, sin ficha de muestra, sin miniaturas | ❌ |
| 2 | Rendimiento | ROC por desenlace, PR, deslizador con **Fijar como regla de alerta**, matriz 2×2 (conteos / % por fila / % total), tabla top 5–40 % con la fila vigente resaltada, bosque por desenlace con «En prueba» | ROC y PR de un solo desenlace; deslizador sin botón de fijar; aciertos y errores como tabla, no 2×2; el bosque se volvió una cifra; además trae tablas que el plan pone en Calibración y decisión | 🟡 |
| 3 | Anticipación | Ventaja en visitas, detección por visita de cálculo, riesgo visita a visita con la estrella, precio de avisar antes | Estado vacío «disponible pronto» | ❌ (falta el artefacto) |
| 4 | Calibración y decisión | Calibración con histograma debajo, beneficio **según % alertado**, curva de casos capturados, ¿a cuántos revisar? con capacidad del equipo, costo de equivocarse con % sugerido | Curva suavizada (inventa subidas y bajadas entre puntos), no cuadrada; beneficio según umbral de riesgo; sin capacidad, sin costo de equivocarse; la curva de casos capturados está como tabla en Rendimiento | 🟡 |
| 5 | Interpretabilidad («Qué datos pesan») | SHAP por deciles, dependencia parcial con cortes clínicos, motivos frecuentes, interacción, lectura clínica | Solo barras de importancia con códigos crudos; el resto, estado vacío con mensaje técnico | 🟡 |
| 6 | Población | Embudo, muestra frente al universo, datos faltantes con barra coral sobre el umbral, eventos **por desenlace** con aviso de pocos eventos | Embudo bien; muestra vs universo ausente; faltantes como tabla plana sin umbral; eventos solo del desenlace elegido | 🟡 |
| 7 | Equidad | Selector «Subgrupo por», bosque, diferencias (marca < −0,05), mapa **grupo × desenlace** | Sin selector (mezcla sede, sexo y EG); mapa grupo × medida; «Sexo masculino −0,1» no se marca | 🟡 |
| 8 | Estabilidad temporal | AUC por trimestre con banda y mínimo 0,80, casos reales vs esperado, PSI con semáforo, alertas por 1.000 | Sin banda ni línea de mínimo; el salto 2021-T4 → 2025-T2 se dibuja como continuo; falta reales vs esperado; PSI con códigos crudos | 🟡 |
| 9 | Trayectorias | Media y banda por grupo, 30 niños, diferencia vs OMS por etapa, resumen | Estado vacío «ningún grupo reúne 5 niños» aunque hay crecimiento de 5.000 niños: **sospecha de error de datos** | ❌ |
| 10 | Perfiles | Perfiles con tasa del desenlace, qué los distingue, mapa de puntos, confianza | Tarjetas con 4 cifras; «Con riesgo alto: n menor que 5» en todos (sospechoso con 2.815 niños); sin tasa del desenlace ni «qué los distingue» | 🟡 |
| 11 | Comparar | A vs B con ROC superpuestas, métricas con diferencia e intervalo, mejora por grupo, diferencias de muestra, Aprobar/Mantener | A y B arrancan iguales y la página muestra todo con diferencia 0 y «Sin intervalo»; **Aprobar B** visible sin nada que comparar; sin mejora por grupo | 🟡 |

## Prioridades

1. **Marco común** (afecta a las 11): título con la pregunta, quitar las píldoras duplicadas, contexto completo,
   etiquetas del bosque y títulos de eje, nombres del Diccionario, mensajes claros.
2. **Resumen y Rendimiento** como en el plan (son la puerta de entrada).
3. **Calibración y decisión**: mover lift y «a cuántos revisar» desde Rendimiento, agregar capacidad y costo de equivocarse.
4. Revisar los datos de **Trayectorias** y **Perfiles** (vacíos o «n < 5» que no cuadran con 5.000 niños).
5. Equidad (selector y mapa por desenlace), Estabilidad (banda, mínimo, cortes de tiempo), Población (faltantes y eventos).
6. Anticipación y la interpretabilidad completa dependen de artefactos que el entrenamiento aún no produce.

La propuesta visual de cada submódulo está en el lienzo de Claude Design «Analítica · Observatorio Canguro».

## Avance (2026-11-09, primera tanda)

Hecho, verificado con capturas a 1440 px y 213 pruebas web en verde:

- **Marco común:** encabezado «Analítica › Submódulo» con su pregunta; «Guía de lectura» (desplegable) y el interruptor
  «Modo técnico» arriba a la derecha; contexto con cuatro selectores y chips de datos y fuente; las píldoras de
  submódulos solo en el teléfono.
- **Bosque** (Resumen, Rendimiento, Equidad): hecho en HTML, etiquetas legibles a cualquier ancho.
- **Ejes:** el título del eje vertical ya no se monta sobre las marcas; las curvas unen los puntos con rectas.
- **Nombres de variables** en lenguaje clínico (`nombreVariable` en `lib/lenguaje.ts`; el modo técnico muestra el código)
  y el aviso de «shap no instalado» dicho en lenguaje claro.
- **Resumen:** 5 cifras clave, revisión rápida (un semáforo de una línea por área, con forma además de color), bosque por
  desenlace, ficha de la muestra y miniaturas (aciertos y errores 2×2, calibración, datos que pesan) con enlace.
- **Rendimiento:** curvas y control deslizante en una fila; aciertos y errores en 2×2 con conteos / % por fila / % del
  total; tabla con la fila vigente resaltada; bosque por desenlace con «En prueba».
- **Calibración y decisión:** beneficio según % alertado; casos capturados (curva), a cuántos revisar con la capacidad
  del equipo y costo de equivocarse con % sugerido (movidos desde Rendimiento).

Pendiente: «Fijar como regla de alerta» (no hay servicio que la guarde, D30); ROC de todos los desenlaces superpuestas;
Equidad (selector «Subgrupo por», marca < −0,05, mapa grupo × desenlace); Estabilidad (banda, mínimo 0,80, cortes de
tiempo, reales vs esperado); Población (barras de faltantes, eventos por desenlace); revisar los datos de Trayectorias y
Perfiles; Anticipación e interpretabilidad completa (faltan artefactos); el teléfono.

## Avance (2026-11-09, segunda tanda)

- **Equidad:** selector «Subgrupo por» (sexo, edad gestacional, sede…); bosque y tabla del corte elegido; las
  diferencias menores que −0,05 se marcan en coral con «▼ revisar»; mapa **grupo × desenlace**; las sedes se nombran
  «Sede 1», «Sede 2»…
- **Estabilidad temporal:** aviso arriba («Reentrenar recomendado» o «Vigilar») según el cambio de la población y el
  mínimo; gráfica por trimestre con banda de incertidumbre, raya del mínimo 0,80 y corte «…» entre años sin niños
  (`SerieTrimestral` en `components/graficos`); cambio de la población ordenado de más a menos con leyenda de colores.
- **Población:** cifras de la muestra con «datos que faltan en más de la mitad»; datos faltantes como barras con el
  límite del 30 % y coral por encima (los 8 primeros, «Ver los N datos»); casos por desenlace con aviso de menos de 100
  y la nota de psicomotor «por definición».

Sigue pendiente: casos reales frente a riesgo esperado por trimestre (el artefacto no trae el riesgo esperado),
«Fijar como regla de alerta», revisar los datos de Trayectorias y Perfiles, Anticipación e interpretabilidad completa
(faltan artefactos) y el teléfono.

## Trayectorias y Perfiles (2026-11-09)

- **Causa de los vacíos:** la corrida solo calcula el riesgo de los niños que siguen en seguimiento (en los datos
  simulados, 47 niños y un desenlace: psicomotor). Trayectorias «por riesgo» y la tasa de riesgo alto de Perfiles
  dependen de ese riesgo; para readmisión no existe. No era «n menor que 5».
- **Error corregido:** `_ninos` buscaba el sexo solo en `ern_sexo` (base de la Fundación); los datos simulados lo
  traen como `sexo` con M/F. Ahora lee las dos (`VARIABLES_SEXO`) con `sexo_legible`. «Agrupar por sexo» ya funciona.
- **Mensajes claros:** la API responde `motivo: 'sin_riesgo'` (Trayectorias) y `riesgo_disponible: false` con
  `mensaje_riesgo` (Perfiles); la web lo explica y ofrece agrupar por perfil o sexo. Pruebas nuevas en
  `test_analitica_trayectorias_api.py` y `analitica.test.tsx`.
- **Hecho:** el entrenamiento guarda, con los niños de validación, dos artefactos agregados por desenlace (D7: nunca
  el riesgo por niño): `trayectorias_riesgo` (z por visita del 10 % con más riesgo frente al resto, por indicador) y
  `perfiles` (por perfil: niños, **tasa observada del desenlace** y proporción en riesgo alto). La API los usa cuando
  existen (Trayectorias por riesgo con edad corregida; Perfiles) y si no, calcula en vivo con la corrida y explica la
  falta. Pruebas: `entrenamiento/pruebas/test_analitica_vivos.py` y `test_usa_lo_guardado_por_el_entrenamiento`.
  Los entrenamientos anteriores no traen estos artefactos: hay que reentrenar para verlos.
