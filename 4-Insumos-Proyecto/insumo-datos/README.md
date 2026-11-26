# Análisis de datos del Observatorio Canguro

> **Relación con la plataforma.** La plataforma web KMCPred (`6-Codigo-Fuente-Proyecto/` en la raíz del repositorio) no usa esta carpeta (`4-Insumos-Proyecto/insumo-datos/`) directamente: usa una copia en `6-Codigo-Fuente-Proyecto/nucleo/`, que `make sincronizar-nucleo` trae de aquí y a la que le vuelve a aplicar los parches de `6-Codigo-Fuente-Proyecto/nucleo/parches/`. La sincronización no pisa el diccionario semilla de la plataforma (`6-Codigo-Fuente-Proyecto/nucleo/entradas/diccionario.xlsx`), que deja por defecto solo dos desenlaces a los 12 meses, desarrollo psicomotor y talla baja (decisión D68 de `6-Codigo-Fuente-Proyecto/docs/decisiones.md`); el de `entradas/` de esta carpeta trae los 14 «En uso» que se describen abajo.

Tres notebooks y dos herramientas de uso diario:

- `informes/informe_analisis_datos.ipynb`: el mapa de los datos (qué hay, qué tan confiable es, qué cosas raras aparecen).
- `informes/modelo_anomalias.ipynb` y `python -m anomalias`: el modelo de anomalías, **genérico**. Pregunta si un dato está bien anotado (cinco capas, LightGBM, entrada SEVARTI). No sabe nada de la Fundación.
- `informes/alertas_clinicas.ipynb` y `python -m clinico`: las alertas clínicas tempranas, **específicas del programa canguro**. Preguntan si un niño va hacia un problema: crecimiento contra la curva de la OMS y riesgo de readmisión, de no volver, de oxigenodependencia y de desarrollo bajo. Usan los datos que el modelo de anomalías ya revisó.
- `entradas/diccionario.xlsx` y `python -m sevarti diccionario`: el diccionario de variables que mantienen los expertos. Es la única fuente de qué es cada variable de la base y en qué visita se mide, y de la configuración de las alertas clínicas: qué desenlaces se predicen y cómo se leen, y qué medidas se comparan con la curva de la OMS. El sistema solo pone el modelo que se adapta a lo que el diccionario dice.
- `pipeline.py`: la corrida completa, en orden, cada vez que la Fundación actualiza la base.
- `python -m retroalimentacion`: las hojas ciegas para expertos y médicos. Es **opcional y queda fuera de la corrida**: se usa cuando se les va a preguntar.

Los modelos entregan el riesgo y la prioridad de cada dato y de cada niño, con su porqué. A cuántos se les muestra y desde qué punto lo decide la app que lo presenta, no el modelo.

**Para solo leer:** abran los `.html` de `informes/` en el navegador. Traen todos los resultados y gráficos.

## La carpeta

```
README.md, requirements.txt
pipeline.py                 la corrida completa del semestre
entradas/                   lo que se le da al sistema: el diccionario de variables y las hojas de retroalimentación
salidas/                    lo que el sistema entrega: la revisión de datos y los riesgos
interno/                    lo que solo usa el sistema (modelos, estado, claves)
sevarti/                    el contrato SEVARTI (contrato.py), el diccionario de variables (diccionario.py) y el adaptador de la base de KMC (kmc.py): python -m sevarti diccionario
anomalias/                  el modelo de anomalías: python -m anomalias entrenar | revisar | modelos
clinico/                    las alertas clínicas: python -m clinico entrenar | riesgos | silencio
retroalimentacion/          las hojas para expertos y médicos (opcional): python -m retroalimentacion expertos | precision | medicos | revision
archivos/                   lo que comparten los demás: archivos Excel de la Fundación, dónde va cada archivo, periodo de cada entrega
informes/                   notebooks con resultados, sus .html y los scripts que los generan
pruebas/                    pruebas automáticas
```

Los comandos se corren desde esta carpeta. `entradas/`, `salidas/` e `interno/` los crea el sistema cuando hacen falta.

**Datos por niño.** `entradas/retroalimentacion/`, `salidas/` e `interno/` tienen datos por niño. Se quedan en el equipo: no se mandan por correo ni van en el zip del proyecto. `entradas/diccionario.xlsx` no tiene datos de pacientes y se puede compartir. El código y los notebooks solo tienen resultados agregados.

## Preparación

1. `pip install -r requirements.txt` (probado con Python 3.14)
2. Definir las variables de entorno `KMC_HOST`, `KMC_USUARIO` y `KMC_PW` con el servidor, el usuario de solo lectura
   y la clave que entregó el Observatorio (ninguno está en un archivo).
   - PowerShell: `$env:KMC_HOST = "..."; $env:KMC_USUARIO = "..."; $env:KMC_PW = "..."`
   - bash: `export KMC_HOST="..." KMC_USUARIO="..." KMC_PW="..."`

## La corrida

La base no se actualiza sola: la Fundación la carga cada 6 meses, y cada vez se corre

| Orden | Qué hace |
|---|---|
| `python pipeline.py` | 1) valida, entrena y guarda el modelo de anomalías; 2) arma su cola de revisión; 3) valida, entrena y guarda el modelo clínico; 4) si hay riesgos guardados en silencio, los compara con lo que pasó; 5) calcula los riesgos de los niños que esperan su siguiente visita |
| `python pipeline.py --silencio` | Lo mismo, pero los riesgos se guardan sin entregarlos (periodo en silencio) |
| `python pipeline.py --sevarti CARPETA` | Lo mismo, con las tablas SEVARTI en Parquet de una carpeta en lugar de la base |

La corrida no genera las hojas para expertos y médicos: es la retroalimentación, que es opcional y se hace aparte (sección de abajo).

Tarda alrededor de una hora, casi toda en validar y entrenar el modelo de anomalías. Si un paso falla, la corrida se detiene ahí y lo anterior queda guardado. Cada paso también se puede correr solo, con las órdenes de abajo.

Estado al 19 de octubre de 2026: la última corrida usó el corte del 24 de julio de 2026.

## El diccionario de variables

`entradas/diccionario.xlsx` dice qué es cada variable de la base, en qué visita se mide y qué reglas tiene, y configura las alertas clínicas (hojas Desenlaces, Crecimiento y Curva OMS). Lo mantienen los expertos; el sistema solo lo lee, y no hay otro lugar donde se definan las variables ni los desenlaces. No tiene datos de pacientes. Si no existe, la primera corrida lo crea con las reglas de `sevarti/kmc.py` (todas las variables en estado "Lista"); desde entonces mandan los expertos.

**Cómo se trabaja**

1. Cada corrida compara el diccionario con la base. `python -m sevarti diccionario` hace solo esa comparación, sin entrenar nada (necesita `KMC_PW`): sirve para que los expertos trabajen el archivo antes de una corrida.
2. Una variable que la base trae y el diccionario no conoce se agrega al final de la hoja Variables con estado **Por clasificar**, una clasificación sugerida y una nota con la fecha en que apareció. **No se usa** hasta que un experto la revisa, corrige lo que haga falta y cambia el estado a **Lista**.
3. Una variable en estado "Lista" que la base ya no trae se avisa en la corrida (cuántas y cuáles). No se borra.
4. Las filas que ya están nunca se modifican por el sistema. Si el archivo está abierto en Excel, la corrida sigue y dice qué variables no pudo agregar; se cierra el archivo y se vuelve a correr `python -m sevarti diccionario`.
5. Un error en el archivo (un estado que no existe, una visita que no está en la hoja Visitas...) detiene la corrida con un mensaje que dice la hoja, la fila de Excel y el valor.
6. Una fila de Desenlaces o Crecimiento que no se puede usar (le falta lo que su regla necesita, nombra una variable, visita o quiebre que no está, o su variable pasa a "No usar") queda sin modelo y la corrida dice cuál y por qué; las demás siguen. La hoja Curva OMS es la excepción: sin la variable del sexo no hay crecimiento y la corrida se detiene con ese mensaje.
7. Un diccionario hecho antes de las hojas Desenlaces, Crecimiento y Curva OMS las recibe en la siguiente corrida (o con `python -m sevarti diccionario`), llenas con la configuración que traía el sistema. Lo demás no se toca.

No cambien los encabezados ni los nombres de las hojas, ni agreguen hojas: el sistema reescribe el archivo al agregar variables u hojas nuevas. Las columnas con lista de respuestas están en amarillo.

**Hoja Variables** (una fila por variable)

| Columna | Qué significa |
|---|---|
| Variable | Código en la base. No se cambia |
| Estado | **Lista**: se usa. **Por clasificar**: apareció en la base y falta revisarla; no se usa. **No usar**: se descarta |
| Nombre, Tema, Unidad | Cómo se muestra la variable en los informes |
| Tipo | Número, Categoría o Sí/No |
| Rol | **Medición** (se mide en una visita), **Basal** (del nacimiento o anterior) o **Contexto** (entorno social, sin visita). Obligatorio en las "Lista" |
| Visita | La visita en que se mide, de las de la hoja Visitas. Vacío si no depende de una visita |
| Qué mide | Lo que mide. El mismo texto en varias visitas es una sola trayectoria (por ejemplo "peso") |
| Se mide en su visita | Sí: se espera dentro de las edades de su visita. No: se tomó a su propia edad (ver Edad tomada de). Vacío es Sí |
| No puede bajar / Cuánto puede bajar | Medidas que solo crecen (talla, perímetro cefálico) y cuánto puede bajar por error de medición. Vacío es No / 0 |
| Edad tomada de | Opcional: variable con la edad, en días de vida, a la que se tomó este dato |
| Códigos de "no se hizo" | Códigos que no son una medida (por ejemplo 99), separados por `;` |
| Etiquetas de los códigos | Qué significa cada código de una categoría: `1=buena;2=regular` |
| Rango desde / hasta | Rango esperado. Solo informa, no descarta datos |
| Nota | Lo que quieran anotar; el sistema escribe aquí el aviso de las variables nuevas |

**Hoja Visitas** (las visitas del seguimiento, como ventanas de edad)

| Columna | Qué significa |
|---|---|
| Visita, Nombre, Orden | Nombre corto (lo usa la columna Visita de Variables), nombre en los informes y posición en el tiempo |
| Edad desde / hasta (días) | Ventana de edad en que se espera la visita. Vacío si no tiene edad propia (lo prenatal) |
| Edad contada desde | **Nacimiento** (días de vida) o **40 semanas** (edad corregida, descuenta lo que el niño nació antes de término) |
| Variables con la fecha | Variables de la base con la fecha de la visita, separadas por `;`. Se usa la primera que tenga dato |
| Variable con la edad | Variable con la edad anotada en la visita |
| Edad fija (días) | Para una visita sin fecha ni edad anotadas: la edad de todos sus datos (0 para el nacimiento) |

**Hoja Episodios** (estancias): Episodio y las variables con su duración en días, separadas por `;` (se usa la primera con dato); empiezan en el nacimiento. **Hoja Quiebres**: cambios conocidos en cómo se registran los datos, con la fecha desde la que rigen.

**Hoja Desenlaces** (una fila por desenlace de las alertas clínicas)

| Columna | Qué significa |
|---|---|
| Clave, Alerta | Nombre corto y único (va en los archivos de riesgos) y lo que dice la alerta |
| Estado | **En uso**: el modelo lo aprende con `python -m clinico entrenar`. **En prueba**: solo se valida con `python -m clinico experimento`. **No usar**: no se usa |
| Cómo se lee | **Códigos** (la variable tiene un código de sí o de no), **Conteo mayor que cero**, **Entre los más bajos** (el porcentaje más bajo de los niños), **No vuelve a la visita siguiente** o **Crecimiento bajo** (bajo la curva OMS en una visita) |
| Se predice en | Visita en la que se calcula el riesgo, solo con lo que se sabe hasta ella |
| Variable | La variable que dice si pasó (no hace falta en No vuelve ni en Crecimiento bajo) |
| Códigos de sí / de no | Solo en Códigos, separados por `;`. Cualquier otro código, como "No hay dato", deja el desenlace sin conocer para ese niño. Los de sí tienen que estar en las etiquetas de la variable |
| Porcentaje más bajo | Solo en Entre los más bajos. Vacío es 10 |
| Medida de crecimiento, Visita del desenlace | Solo en Crecimiento bajo: el indicador de la hoja Crecimiento y la visita en que se mira |
| Solo nacidos desde | Opcional: un quiebre de la hoja Quiebres, si antes el desenlace se anotaba distinto |
| Comparar con | Las variables de la regla simple contra la que se mide el modelo, separadas por `;` (`eg_semanas` es la edad gestacional) |

**Hoja Crecimiento** (una fila por indicador de la OMS): el indicador (peso, talla o perímetro cefálico para la edad, o peso para la talla), el "Qué mide" de sus variables, la unidad en que la base lo anota (g, kg, cm o mm), para el peso para la talla el "Qué mide" de la talla, el puntaje z bajo el cual es bajo (vacío es -2) y la caída entre visitas que alerta (vacío es 1), y su estado. **Hoja Curva OMS** (una fila): la variable del sexo, sus códigos de niño y de niña, y las visitas en que se compara con la curva.

Para agregar un desenlace: una fila nueva en Desenlaces con estado "En prueba", `python -m clinico experimento` para ver cómo predice, y si convence, estado "En uso" y `python -m clinico entrenar`.

## Notebooks

Abrir el notebook en `informes/` y ejecutar todas las celdas. El del modelo tarda alrededor de una hora: entrena un modelo por variable, mete errores en tres rondas y revisa toda la base.

El de análisis se calculó entre el 12 y el 14 de octubre de 2026. El 15 la Fundación restringió la fecha exacta de nacimiento, la sede, la llave del paciente y las fechas de hospitalización; después volvió a habilitar todo salvo la llave (`iden_codigo`, que nunca se usa). El código sigue trabajando sin sede ni fecha de parto, y las secciones del análisis que las usan no corren tal cual: volver a usarlas es la decisión abierta b de *Decisiones abiertas del Observatorio* (`4-Insumos-Proyecto/insumo-plan/2-Decisiones_abiertas_del_Observatorio.docx`, en la raíz del repositorio).

Los textos de los notebooks se editan en `informes/construir_*.py`: se corre el script y luego se ejecuta el notebook.

## Uso diario del modelo de anomalías

| Orden | Qué hace |
|---|---|
| `python -m anomalias entrenar` | Valida, entrena con todos los datos y guarda el modelo en `interno/anomalias/modelos/<versión>/` con su ficha |
| `python -m anomalias revisar` | Cola de revisión de lo que entró desde la revisión anterior, en `salidas/revision_de_datos/<fecha>.xlsx` (hojas Datos, Grupos y No usados). Avisa si una capa alerta muy distinto de la validación |
| `python -m anomalias revisar --desde 2026-01-01` | Lo mismo, desde una fecha |
| `python -m anomalias modelos` | Los modelos guardados, el más reciente primero |

Opciones:

- `--sevarti CARPETA` (antes de la orden) lee las seis tablas SEVARTI en Parquet en lugar de la base: así se conecta otra fuente, como la app, sin tocar el modelo.
- `--modelo CARPETA` (antes de la orden) usa un modelo guardado en particular en lugar del más reciente.
- `entrenar --config archivo.json` cambia parámetros sin tocar código, por ejemplo `{"alpha": 0.002}` para que la capa 2 sea más exigente. `alpha` se elige con la precisión que midan los expertos.
- `entrenar --sin-validacion` solo entrena (más rápido; la ficha queda sin métricas).

Cada entrega (`revisar` aquí y `riesgos` abajo) cubre lo que entró desde el corte de la anterior; la primera cubre toda la historia. Si se vuelve a correr con el mismo corte, repite el mismo periodo.

## Uso diario de las alertas clínicas

| Orden | Qué hace |
|---|---|
| `python -m clinico entrenar` | Valida, entrena con todos los datos y guarda en `interno/clinico/modelos/<versión>/` con su ficha |
| `python -m clinico riesgos` | Riesgo de cada desenlace de los niños con visita desde la entrega anterior cuya siguiente visita todavía no pasa (a los demás ya es tarde), con su percentil y su porqué, y el crecimiento fuera de la curva de lo medido en ese periodo (`salidas/riesgos/<fecha>.xlsx`) |
| `python -m clinico riesgos --desde 2026-01-01` | Lo mismo, desde una fecha |
| `python -m clinico riesgos --silencio` | Calcula y guarda los riesgos sin entregarlos (periodo en silencio) |
| `python -m clinico silencio` | Compara lo guardado en silencio con lo que pasó después |
| `python -m clinico experimento` | Valida los desenlaces en prueba (abajo) sin tocar el modelo en uso ni las entregas. La tabla, solo con agregados, queda en `interno/clinico/experimentos/<fecha>.csv` |

Tienen las mismas opciones `--sevarti CARPETA` y `--modelo CARPETA` (antes de la orden). En `salidas/riesgos/<fecha>.xlsx` va cada niño pendiente con la probabilidad de cada desenlace (Riesgo %), su posición frente a los niños con que se calibró el modelo (de 0 a 100) y los datos que más le suben el riesgo (Por qué). La ficha del modelo (`interno/clinico/modelos/<versión>/ficha.json`) trae el AUC de cada desenlace frente a la regla simple, para saber cuánto vale cada riesgo. Los desenlaces y las medidas de crecimiento los configuran los expertos en el diccionario.

**Desenlaces en prueba.** El diccionario trae 14 desenlaces "En uso" (readmisión, no volver a la siguiente visita, oxígeno y desarrollo) y 38 "En prueba", para probarlos antes de usarlos:

- Eventos anotados en cada visita, con el riesgo calculado en la visita anterior: enfermedad infecciosa, ictericia, apnea e infección pulmonar antes de las 40 semanas; enfermedad respiratoria aguda antes de los 3, 6, 9 y 12 meses; oxígeno ambulatorio a los 6 y 9 meses.
- Eventos cuya forma de anotarse cambió con el sistema de 2022, contados solo desde entonces porque la proporción de "sí" cayó entre 4 y 30 veces (displasia de caderas, de 11,7% a 1,3%): tono anormal, falla en el crecimiento, enfermedad gastrointestinal aguda, examen neurológico anormal, displasia de caderas y riesgo de parálisis cerebral. Varios tienen muy pocos casos; si no alcanzan, quedan sin modelo y la tabla dice por qué.
- Crecimiento a los 12 meses por debajo de -2 DE de la OMS, la pregunta de la propuesta de la Fundación: talla baja para la edad, peso bajo para la edad, desnutrición aguda (peso bajo para la talla) y perímetro cefálico bajo, cada uno con el riesgo calculado a las 40 semanas y a los 3, 6 y 9 meses.

En los eventos solo cuentan "sí" y "no": un "No hay dato" (9) deja ese desenlace sin conocer para ese niño, no lo cuenta como "no". Uno pasa al modelo en uso cuando su estado cambia a "En uso" y se vuelve a entrenar.

## Retroalimentación de expertos y médicos (opcional)

No es parte de la corrida del semestre (`pipeline.py` no la hace). Se usa cuando se les va a preguntar a los expertos o a los médicos, con los modelos que la corrida ya guardó.

| Orden | Qué hace |
|---|---|
| `python -m retroalimentacion expertos` | Archivo ciego para que los expertos digan qué datos son errores (`entradas/retroalimentacion/expertos_<versión>.xlsx`). Opciones: `--por-capa`, `--control`, `--semilla`, `--modelo` |
| `python -m retroalimentacion precision [HOJA]` | Con el archivo respondido: qué tanto acierta cada capa y cuántos errores se escapan. Sin `HOJA`, usa la del modelo en uso |
| `python -m retroalimentacion medicos` | Archivo ciego para que los médicos digan qué niños les preocupan (`entradas/retroalimentacion/medicos_<versión>.xlsx`). Opciones: `--por-grupo`, `--semilla`, `--modelo` |
| `python -m retroalimentacion revision [HOJA]` | Con el archivo respondido: si los niños de riesgo alto les preocuparon más que el resto |

Como en los demás, `--sevarti CARPETA` va antes de la orden.

## Los archivos que recibe la Fundación

El diccionario, la cola de revisión, los riesgos y los dos archivos para responder abren con una hoja de instrucciones: qué es el archivo, qué hacer y qué significa cada columna. Los encabezados están escritos para quien lo lee. Los códigos se muestran con su etiqueta, tomada de la tabla de categorías de la base (`consumo.categoria`), y los números grandes con separador de miles.

En los dos archivos para responder, la columna a llenar está en amarillo y solo acepta Sí, No o No sé:

- `entradas/retroalimentacion/expertos_<versión>.xlsx`: "¿Es un error?" para cada dato.
- `entradas/retroalimentacion/medicos_<versión>.xlsx`: "¿Le preocupa?" para cada niño y pregunta.

Se devuelven a la misma carpeta con el mismo nombre, sin cambiar encabezados ni la columna N°: de ahí los leen `precision` y `revision`. La clave de cada uno, que dice cuáles tienen alerta, queda aparte en `interno/claves/`: no se abre ni se le pasa a quien responde.

## Pruebas

`python -m pytest pruebas` (unos cinco minutos). Usan datos simulados con los mismos problemas que tiene la base. Los datos simulados son solo para las pruebas.

## Qué hay en cada carpeta

| Archivo | Qué es |
|---|---|
| `pipeline.py` | La corrida completa, en orden |
| `sevarti/contrato.py` | El contrato de entrada: las seis tablas SEVARTI, sus reglas y el traspaso en Parquet |
| `sevarti/diccionario.py` | El diccionario de variables en Excel: leerlo y validarlo, escribirlo, y separar las variables nuevas y las que faltan. No conoce ninguna base |
| `sevarti/kmc.py` | Lo único específico de esta base: conexión, el primer borrador del diccionario (las reglas de KMC) y el paso a SEVARTI según el diccionario |
| `sevarti/__main__.py` | `python -m sevarti diccionario` |
| `anomalias/` | Los pasos del modelo de anomalías (`python -m anomalias`, en `__main__.py`) |
| `anomalias/modelo.py` | El modelo: capas 0 a 4, entrenamiento con datos sucios y evaluación. No nombra ninguna variable |
| `anomalias/operacion.py` | Validar, guardar y cargar modelos, cola de revisión y puntajes guardados |
| `anomalias/motor.py` | Chequeos genéricos guiados por el diccionario (los usa el notebook de análisis). No depende de la Fundación |
| `clinico/` | Los pasos de las alertas clínicas (`python -m clinico`, en `__main__.py`) |
| `clinico/modelo.py` | El motor clínico: desenlaces, corte en el tiempo, modelos de riesgo calibrados, porqué de cada riesgo y periodo en silencio |
| `clinico/configuracion.py` | Lee la configuración clínica de las hojas Desenlaces, Crecimiento y Curva OMS del diccionario y dice qué filas no se pueden usar y por qué |
| `clinico/crecimiento.py` | Puntaje z contra la curva de la OMS y alertas de crecimiento |
| `clinico/oms_lms.csv` | Estándares de crecimiento de la OMS (2006), tablas LMS de 0 a 24 meses |
| `clinico/oms_peso_talla.csv` | Estándar de la OMS (2006) de peso para la longitud, de 45 a 110 cm (solo lo usan los desenlaces en prueba) |
| `retroalimentacion/` | Las hojas ciegas y su medición (`python -m retroalimentacion`, en `__main__.py`): `expertos.py` para los expertos, `medicos.py` para los médicos y `respuestas.py` con lo que comparten (cómo se lee una respuesta) |
| `archivos/libros.py` | Los archivos Excel que recibe la Fundación: instrucciones, encabezados y columnas para responder |
| `archivos/carpetas.py` | Dónde va cada archivo de `entradas/`, `salidas/` e `interno/` |
| `archivos/entregas.py` | Qué periodo cubre cada entrega |
| `archivos/pantalla.py` | Cómo imprimen sus tablas las herramientas de la línea de comandos |
| `informes/informe_analisis_datos.ipynb` / `.html` | El notebook de análisis, con resultados |
| `informes/modelo_anomalias.ipynb` / `.html` | La validación del modelo, con resultados |
| `informes/alertas_clinicas.ipynb` / `.html` | La validación de las alertas clínicas, con resultados |
| `informes/construir_notebook.py` / `construir_modelo.py` / `construir_clinico.py` | Generan los notebooks. Si cambian textos, editen aquí y vuelvan a correr el script |
| `informes/graficos.py` | Estilo y funciones de gráficos de los notebooks |
| `informes/diccionario_snapshot.csv` | Copia del diccionario de la última ejecución, para detectar variables nuevas o cambiadas |
| `pruebas/` | Pruebas automáticas, con datos SEVARTI inventados (`pruebas/simulador_sevarti.py`), una base KMC simulada (`pruebas/base_kmc.py`) y las tablas SEVARTI que se esperan de ella (`pruebas/esperado_kmc/`) |

### Entradas, por tipo

| Archivo | Qué es |
|---|---|
| `entradas/diccionario.xlsx` | El diccionario de variables que mantienen los expertos (sin datos de pacientes). Lo crea la primera corrida o `python -m sevarti diccionario`, y las variables nuevas de la base entran como "Por clasificar" (ver "El diccionario de variables") |
| `entradas/retroalimentacion/expertos_<versión>.xlsx` | La hoja ciega de los expertos. Respondida, vuelve aquí y el sistema la lee |
| `entradas/retroalimentacion/medicos_<versión>.xlsx` | La hoja ciega de los médicos. Respondida, vuelve aquí y el sistema la lee |

### Salidas, por tipo

| Archivo | Qué es |
|---|---|
| `salidas/revision_de_datos/<fecha>.xlsx` | La cola de revisión: los datos que el modelo de anomalías manda a revisar |
| `salidas/riesgos/<fecha>.xlsx` | Los riesgos de cada niño, con su porqué y el crecimiento fuera de la curva |

`interno/` es solo para el sistema (modelos guardados, último corte, puntajes, claves de las hojas, riesgos guardados en silencio, tablas de los experimentos): nadie lo abre.

Los módulos se importan por el nombre del paquete (`anomalias.modelo`), y así quedan guardados dentro de los modelos. Si se mueve o se renombra un módulo, los modelos guardados dejan de cargar y hay que reentrenar.

El anexo B del notebook de análisis explica cómo agregar variables, medidas repetidas u otra fuente de datos. En el modelo, una variable nueva es una fila más en el esquema SEVARTI (sección 10 del notebook del modelo); con la base de KMC esa fila sale del diccionario de variables.

## Lo que no viene de la Fundación

Todo lo demás sale de la base, del diccionario, de `consumo.categoria` o de lo que indicó la Fundación (estancias desde `hd_diasurn` y `hd_totaldiashospital`, `EG_Semanas` para la edad corregida, variables restringidas, carga cada 6 meses). Las filas marcadas con una letra siguen abiertas y por ahora quedan como están; cada una se explica en *Decisiones abiertas del Observatorio* (`4-Insumos-Proyecto/insumo-plan/2-Decisiones_abiertas_del_Observatorio.docx`, en la raíz del repositorio).

| Qué | De dónde | Dónde se usa |
|---|---|---|
| Curvas de crecimiento | Estándares de la OMS (2006), tablas LMS de 0 a 24 meses, tomadas de `pygrowup` 0.8.2 (licencia BSD) y verificadas contra las medianas publicadas | `clinico/oms_lms.csv`, crecimiento desde las 40 semanas, sin curva de prematuros (d) |
| Peso para la longitud | Estándar de la OMS (2006), de `pygrowup` 0.8.2 (BSD), idéntico en cada punto a las tablas del paquete `anthro` de la OMS | Desenlaces en prueba: desnutrición aguda a los 12 meses |
| Por debajo de -2 DE | Definición de la OMS de bajo peso, talla o perímetro para la edad | Crecimiento |
| Primer contenido de las hojas Desenlaces, Crecimiento y Curva OMS (qué desenlaces, desde qué visita, sus códigos y la regla simple) | Nuestro; la propuesta de la Fundación pide el crecimiento a los 12 meses, los eventos los elegimos de la base. Desde ahí los cambian los expertos en el diccionario | Alertas clínicas |
| Cae más de 1 DE entre visitas | Criterio clínico usual de falla de crecimiento; no es de la OMS (f) | Crecimiento |
| Más de 6 DE = dato improbable | Regla de limpieza de la OMS, simplificada a ±6 DE para los tres indicadores (la OMS usa límites algo distintos por indicador, por ejemplo -6/+5 en peso para la edad) (f) | Crecimiento: se manda a revisar el dato |
| Edad corregida = edad − (40 − semanas de gestación) × 7 días | Convención clínica estándar | Los dos modelos |
| Desarrollo "bajo" = 10% inferior | Definición nuestra, relativa a los niños de entrenamiento (c) | Modelo clínico |
| Ventanas de cada visita | Nuestras, con márgenes alrededor de la edad de cada visita (a); quedan en la hoja Visitas del diccionario, donde los expertos las pueden cambiar | Los dos modelos |
| Pesos extra con campo "días" sin encadenar | Nuestro: ese campo no es la edad y no está documentado (e); en el diccionario esos pesos tienen la columna "Qué mide" vacía | Modelo de anomalías |
| Primer borrador del diccionario (visita, rol y trayectoria de cada variable) | Nuestro, a partir de cómo numera el formulario sus visitas; es solo el punto de partida de los expertos | `entradas/diccionario.xlsx` |
| Umbrales estadísticos (6 MAD, 3,5, `alpha`, CUSUM) | Parámetros nuestros, validados en los notebooks | Los dos modelos |

## Datos por niño

Los notebooks solo muestran agregados. Todo lo que tiene datos por niño (la máscara de entrenamiento, la cola de revisión, las hojas de expertos y médicos con sus claves, los riesgos guardados en silencio) queda en `entradas/retroalimentacion/`, `salidas/` e `interno/`, con el `paciente_id` de la base y nunca con `iden_codigo`. Esas carpetas se quedan en el equipo que revisa: no se suben a ningún lado, no se mandan por correo y no van en el zip del proyecto.
