# Manual de uso · KMCPred

**KMCPred** es el «Sistema interpretable de alertas y predicción temprana de riesgos en niños prematuros y de bajo peso
del Programa Madre Canguro». «Observatorio Canguro» sigue siendo el nombre de la cohorte y de la base de datos de la
Fundación de donde salen los datos (D78).

Guía para quienes usan la aplicación desde el navegador: administración, expertos clínicos, expertos en datos y
personas de consulta. No hace falta saber de programación. Los nombres en **negrita** son los mismos que aparecen en la
pantalla.

> **Apoyo a la decisión clínica.** KMCPred ordena a los niños por riesgo y señala datos que conviene revisar. La
> decisión clínica siempre es del equipo de la Fundación. Al pie de cada pantalla se lee: «Apoyo a la decisión clínica.
> El riesgo estimado ayuda a priorizar la revisión. El equipo clínico toma la decisión.»

**Contenido:** [Antes de empezar](#antes-de-empezar) · [Ingresar](#cómo-ingresar) · [La pantalla](#cómo-está-organizada-la-pantalla) ·
[Consulta](#perfil-consulta) · [Experto clínico](#perfil-experto-clínico) · [Experto en datos](#perfil-experto-en-datos) ·
[Administración](#perfil-administración) ·
[Glosario](#glosario-de-indicadores-y-columnas) · [Privacidad](#privacidad) · [Preguntas frecuentes](#preguntas-frecuentes)

---

## Antes de empezar

### Qué hace KMCPred

Trabaja con los datos del Programa Madre Canguro y usa dos modelos:

* **Anomalías.** Busca datos raros en la historia de cada niño (un peso que no cuadra con su edad, una talla que
  baja de una visita a otra, etc.). Esos datos forman la lista de **Mediciones por revisar**, que responden los
  expertos en datos y la administración.
* **Alertas clínicas.** Calcula el riesgo de desenlaces que se pueden prevenir, ordena a los niños de mayor a menor
  riesgo y dice qué fue lo que más pesó en cada caso. También compara el crecimiento con el estándar de la OMS.

Los resultados se actualizan cada vez que la administración o el experto en datos ejecutan una **corrida** (normalmente una vez por corte de
la base de la Fundación).

### Los cuatro perfiles

| Perfil (como aparece en pantalla) | Qué puede hacer |
|---|---|
| **Consulta** | Ver cifras de grupo: **Seguimiento clínico**, **Comparar grupos de niños**, **Explorar grupos de niños**, **Evaluación de modelos** y el **Resumen de riesgos y calidad de datos**. No ve niños uno por uno |
| **Experto clínico** | Lo clínico: **Seguimiento clínico**, **Comparar grupos de niños**, el **Listado de niños** y la ficha clínica de cada niño, **Revisión clínica de casos** y **Estimar riesgo**. No ve la sección **Datos y modelos** (tampoco el Resumen ni la Evaluación de modelos) |
| **Experto en datos** | Lo de Consulta, más la sección **Datos y modelos** completa: **Evaluación de modelos** (con **Entrenamientos propios**), **Operación de modelos** (**Entrenar y aprobar modelos**, **Modelos disponibles**, **Recalcular riesgos**), **Mediciones por revisar**, **Guía de variables y unidades**, **Resumen de riesgos y calidad de datos** y **Configuración** (sistema, entrenamiento y ejecuciones automáticas). No ve niños uno por uno |
| **Administración** | Todo lo anterior, más **Usuarios y permisos** y la sección **Notificaciones** |

Si una opción del menú no aparece, su perfil no la incluye. Pida el cambio a la administración.

### Demostración con niños simulados

Si arriba de la pantalla ve el aviso «Demostración con niños simulados. Ningún dato corresponde a un niño real.»,
está en la versión de demostración. Todo funciona igual, pero los niños son inventados.

---

## Cómo ingresar

1. Abra en el navegador la dirección que le dio la administración (en el equipo de la Fundación suele ser
   `http://localhost:8080` o una dirección de la red interna).
2. En **Iniciar sesión en KMCPred**, escriba su **Correo electrónico** y su **Contraseña**. El ícono del ojo junto a
   la contraseña la muestra u oculta.
3. Pulse **Iniciar sesión**.

La pestaña del navegador lleva el nombre de la pantalla seguido de «· KMCPred» (por ejemplo «Seguimiento clínico ·
KMCPred»).

Mensajes posibles:

| Mensaje | Qué hacer |
|---|---|
| «Correo o contraseña incorrectos.» | Revise lo que escribió. Si su usuario fue desactivado verá el mismo mensaje: consulte a la administración |
| «Demasiados intentos. Espere un minuto.» | Tras cinco intentos seguidos, espere un minuto y vuelva a probar |
| «La sesión terminó. Ingrese de nuevo.» | Su sesión venció o se cerró (por ejemplo, porque le cambiaron la contraseña). Ingrese otra vez |
| «No hubo respuesta de la API. Revise su conexión.» | El servidor no responde. Avise a la administración |

**Salir.** Abajo a la izquierda aparecen sus iniciales, su nombre y su perfil. El botón de la puerta (**Cerrar sesión**)
termina la sesión. Ciérrela siempre en computadores compartidos. Aunque no la cierre, vence sola a los pocos días.

**Aviso de sesión por vencer.** Cuando la sesión está por vencer, arriba de la pantalla aparece una franja coral que dice
«Su sesión está por vencer. Guarde su trabajo e ingrese de nuevo.»; si ya venció, dice «Su sesión venció.». La franja no
lo saca de la pantalla ni borra lo que está haciendo: termine o guarde su trabajo y, cuando quiera, pulse **Ingresar de
nuevo**. Al ingresar, la aplicación lo devuelve a la misma pantalla en que estaba, con sus filtros.

**¿Olvidó la contraseña?** La aplicación no la recupera sola. El enlace **¿Olvidó su contraseña?**, junto al campo de
la contraseña, solo explica que la administración le pone una nueva y se la comparte por un canal seguro (ver
[Usuarios y permisos](#usuarios-y-permisos)).

---

## Cómo está organizada la pantalla

* **Marca.** Arriba del menú dice «KMCPred · Alertas y predicción temprana».
* **Menú lateral** (en el teléfono se abre con el botón de las tres rayas, arriba a la derecha) con cuatro secciones.
  Cada perfil ve solo las opciones que le corresponden:
  * **Clínica:** **Seguimiento clínico** (la pantalla de inicio, todos los perfiles), **Listado de niños** (Experto
    clínico y Administración), **Comparar grupos de niños** (todos), **Revisión clínica de casos** y **Estimar riesgo**
    (Experto clínico y Administración).
  * **Datos y modelos:** **Evaluación de modelos** (Consulta, Experto en datos y Administración), **Operación de
    modelos**, **Mediciones por revisar**, **Guía de variables y unidades**, **Resumen de riesgos y calidad de datos**
    (también Consulta) y **Configuración** (Experto en datos y Administración).
  * **Notificaciones:** **Configuración del correo saliente** y **Reglas y envíos de alertas por correo** (solo
    Administración).
  * **Administración:** **Usuarios y permisos** (solo Administración).
* **Explorar grupos de niños** no está en el menú: se abre con **Explorar más variables** en Seguimiento clínico.
* **Grupos que se abren y se cierran.** **Evaluación de modelos**, **Operación de modelos** y **Configuración** son
  grupos: el nombre lleva a su primera pantalla y la flecha de al lado muestra u oculta las demás (los once análisis y
  **Entrenamientos propios** dentro de Evaluación de modelos; **Entrenar y aprobar modelos**, **Modelos disponibles** y
  **Recalcular riesgos** dentro de Operación de modelos; **Configuración del sistema y del entrenamiento** y **Programar
  ejecuciones automáticas** dentro de Configuración). El grupo en que está parado empieza abierto, pero puede cerrarlo
  con la flecha cuando quiera; al cambiar de pantalla vuelve a abrirse solo si la nueva pantalla es parte del grupo.
* **Buscar en el menú.** El campo de arriba filtra el propio menú mientras escribe: se ocultan las opciones que no
  coinciden y los grupos con coincidencias se abren mostrando solo esas (si coincide el nombre del grupo, se ven todas
  sus opciones). No distingue tildes ni mayúsculas. **Enter** va a la primera coincidencia; **Esc** o la **×** devuelven
  el menú completo. Se enfoca con **/** o **Ctrl+K** (**⌘K** en Mac). En el teléfono está dentro del menú. Con el menú
  plegado, la lupa lo despliega.
* **Plegar el menú (computador).** El botón de arriba del menú (**Plegar menú** / **Desplegar menú**) lo reduce a una
  tira de íconos, para dar más espacio al contenido; al pasar el mouse sobre un ícono se ve su nombre. Vuelva a pulsarlo
  para dejarlo completo. La aplicación recuerda su elección en ese navegador.
* **Contenido** en el centro. Al cambiar de pantalla, el teclado queda al inicio del contenido.
* **Pie de página:** «Apoyo a la decisión clínica. El riesgo estimado ayuda a priorizar la revisión. El equipo clínico
  toma la decisión.»

### Confirmaciones

Antes de una acción que cambia algo (por ejemplo desactivar un usuario, aprobar un modelo, borrar una programación o
guardar la conexión a la base), la aplicación abre su propia ventana de confirmación, no la del navegador. Dice qué va a
pasar, a quién afecta y si **se puede deshacer** o **no se puede deshacer**. El botón de acción lleva el nombre de lo que
hace (no «Aceptar»); en las acciones delicadas el foco queda en **Cancelar**. Para no seguir, pulse **Cancelar**, la
tecla Esc o haga clic fuera de la ventana: no se cambia nada y el cursor vuelve al botón con que empezó.

### Términos con «¿qué significa?»

Algunas palabras técnicas (por ejemplo **AUC**, **percentil**, **cron** o **falsas por 1.000**) se ven con un subrayado
de puntos. Al pasar el mouse, enfocarlas con el teclado o tocarlas aparece una explicación corta en palabras
corrientes; se cierra con Esc o al salir de la palabra. Las explicaciones están en el
[glosario](#glosario-de-indicadores-y-columnas).

---

## Perfil Consulta

Estas pantallas las ven todos los perfiles, salvo el **Listado de niños**, la ficha clínica de un niño y su perfil,
que son de Experto clínico y Administración: el perfil Consulta ve cifras de grupo, nunca un niño uno por uno. El
**Resumen de riesgos y calidad de datos** y la **Evaluación de modelos** los ven Consulta, Experto en datos y
Administración; el Experto clínico no (D77).

### Seguimiento clínico

Es la pantalla de inicio (dirección `/`) y la ven todos los perfiles. Responde qué pasó con los niños del **grupo
activo** a los 12 meses y a quién mirar primero. Debajo del título dice de qué fecha son los datos («Datos al …»).

* **Arriba a la derecha:** **Comparar con otro grupo** (abre Comparar grupos de niños con este grupo como A),
  **Explorar más variables** (abre Explorar grupos de niños con el mismo grupo) y **Exportar**, que descarga en CSV las
  cifras de la vista, cada una con su denominador, nunca niños uno por uno.
* **Grupo activo:** la barra dice cuántos niños hay en el grupo (o «Todos los niños» si no hay filtros). **Cambiar
  grupo** abre como cajón el mismo panel de filtros de Explorar. El grupo y el desenlace viajan en la dirección, así que
  un enlace copiado abre la misma vista. Con menos de 20 niños no se muestran cifras.
* **Desenlace a los 12 meses:** una pestaña por desenlace (por defecto, talla baja y desarrollo psicomotor bajo, D68).
  La vista abre en talla baja si el paquete la trae.
* **Resultados observados a los 12 meses:** el porcentaje del grupo que tuvo el desenlace, «x de n niños con dato a los
  12 meses · m sin dato» y, como referencia, toda la población. Una nota dice entre quiénes se cuenta («Se cuenta entre
  los niños que fueron a la visita de …»): por eso los «con dato» de aquí y los de la curva de crecimiento no coinciden
  (D76).
* **Crecimiento: talla para la edad** (o la medida del desenlace): una caja por visita, con dos pestañas (D79):
  * **Desviación estándar:** la caja va del promedio menos una desviación estándar (DE) al promedio más una, y los
    bigotes llegan a ±2 DE. La caja reúne cerca de 2 de cada 3 niños; los bigotes, cerca de 95 de cada 100.
  * **Varianza:** la caja de cuartiles, del 25 % al 75 % (la mitad central de los niños), con la raya en la mediana y
    los bigotes en el valor más bajo y el más alto que no son atípicos. Bajo cada visita va la varianza, porque está en
    unidades al cuadrado y no se puede dibujar en el eje.
  * Bajo cada visita dice cuántos niños tienen dato. Una visita con menos de 20 niños con dato no tiene caja: queda solo
    su mediana como punto, y la gráfica lo explica con «Sin caja: pide al menos 20 niños con dato en la visita.» (límite
    estadístico, D67). La línea gris es el promedio (o la mediana) de toda la población; la raya punteada coral es el
    umbral de talla baja de la OMS (−2).
  * Al lado, el panel **Cómo leerla** nombra cada parte de la caja, las líneas de referencia y los colores de los puntos.
  * **Puntos (solo Experto clínico y Administración):** en cada visita en que se calcula el riesgo, los 5 niños en
    alerta cuyo dato más se aleja del promedio del grupo. En coral lleno, los de riesgo «más de 99,9 %»; en coral claro,
    los de riesgo menor. El más alejado lleva su código. Al tocar un punto (o con Enter) se ve su resumen (visita, dato,
    riesgo estimado y cuánto se aleja) con **Abrir ficha del niño**. A los 12 meses no hay puntos, porque ahí se mide el
    desenlace. Los demás perfiles ven solo las cajas.
  * **Ver como tabla** y el CSV traen, por visita, los niños con dato, el promedio, la DE, la varianza, el mínimo y el
    máximo no atípicos, los cuartiles y la mediana (y los de toda la población), nunca los niños.
* **Riesgo estimado de …:** por cada visita en que se calcula, «x de n niños en alerta (p %)», contando solo a los niños
  del grupo que siguen en seguimiento. La marca **En prueba** dice qué cálculos aún no dan alertas.
* **Niños con mayor riesgo estimado (Experto clínico y Administración):** los niños del grupo con más riesgo, con su
  edad gestacional, su riesgo estimado en porcentaje y la visita del cálculo, y su último puntaje z de talla (D71). Al
  pasar el cursor se ve su lugar entre los niños de esa visita. Con todos los niños como grupo, un enlace lleva al
  **Listado de niños** con los que están en alerta.

### Comparar grupos de niños

Pone lado a lado dos grupos, **A** y **B**. El grupo A es el grupo activo del Seguimiento clínico (si lo cambia aquí,
también cambia allá); el B se elige con **Elegir grupo B** (o **Comparar con todos los niños**). El botón de las flechas
intercambia A y B. Dos grupos con los mismos criterios no se comparan. Tiene tres pestañas: **¿Crecen distinto?**, **¿Les
pasa algo distinto?** y **¿Faltan datos distintos?** (la completitud de la talla, contada sobre todos los niños del
corte, D70). El botón de exportar descarga las cifras de la comparación en CSV.

### Resumen de riesgos y calidad de datos

Está en **Datos y modelos** y lo ven Consulta, Experto en datos y Administración. Debajo del título dice que las cifras
son de **toda la población del programa** (el grupo que se arma en Explorar o en el Seguimiento clínico no llega aquí),
de qué fecha son los datos («Datos al …») y cuándo se actualizaron. Experto en datos y Administración ven además el
paquete de modelos.

Si aparece «Todavía no hay resultados», todavía no se ha hecho la primera actualización.

**Cifras de la franja superior:**

| Cifra | Qué significa |
|---|---|
| **niños con datos** | Niños con datos en la base en esa fecha |
| **datos por revisar · N por mil** | Datos que el modelo encontró raros y cuántos son por cada mil datos leídos (al pasar el mouse se ve el total de datos leídos). Para Experto en datos y Administración es un enlace a **Mediciones por revisar** |
| **datos ya respondidos por expertos** | Datos por revisar que ya tienen respuesta |
| **niños con algún riesgo alto** | Niños distintos con al menos un desenlace en riesgo alto (posición 90 o más: entre el 10 % de niños con más riesgo para ese desenlace). Un niño con riesgo alto en tres desenlaces cuenta una vez; al pasar el mouse se ve el total de riesgos altos. Para Administración lleva al **Listado de niños** ya filtrado, que muestra la misma cifra |

**Paneles:**

* **Riesgo por desenlace.** Una fila por desenlace (**Resultado clínico evaluado**, con la visita en que se calcula):
  **Niños** (cuántos tienen el riesgo calculado), **Niños con riesgo alto** (para Administración, al pulsar el número se
  abre la lista filtrada) y **Riesgo estimado promedio**.
  Si el panel dice que ningún niño tiene riesgo calculado, no es un error: el riesgo solo se calcula en la visita en
  que se mide cada desenlace, cuando la siguiente visita aún no ha pasado.
* **Crecimiento frente a la OMS.** Una línea por medida (**Peso para la edad**, **Talla para la edad**, **Perímetro
  cefálico**…) con el porcentaje de niños con crecimiento bajo en cada visita. Al pasar el cursor se ve también el
  porcentaje que **cayó desde el control anterior** y cuántos niños se evaluaron. «EC» quiere decir edad corregida. Los
  porcentajes son de **niños evaluados**, no de mediciones: un niño con dos medidas de la misma visita (el peso a las 40
  semanas viene en dos variables) cuenta una vez, con su última medida válida (D74). **Ver como tabla** trae además la
  caída y cuántas mediciones hubo.
* **Datos por revisar, por tipo de alerta.** Cuántos datos tiene cada tipo de alerta: **Valor fuera de lo esperado**,
  **No cuadra con el resto de sus datos**, **Cambio raro entre controles** y **Cambio en todo un grupo** (ver el
  [glosario](#tipos-de-alerta-capas-del-modelo-de-anomalías)). Un mismo dato puede tener varias alertas. Experto en
  datos y Administración ven el enlace **Revisar**.
* **Alarmas de grupo.** Panel propio, con desplazamiento: cambios de un trimestre a otro en todo un grupo, que casi
  siempre vienen de un cambio en la forma de medir y no de los niños. Las más recientes van primero. Arriba dice
  cuántas hay en total y, si son más de 100, que se muestran las 100 más recientes.

### Listado de niños (Experto y Administración)

La lista de todos los niños con datos. Por defecto los primeros son los de riesgo más alto.

**Filtros (arriba):**

* **Buscar por código del niño:** escriba el código del niño, o parte de él.
* **Todos los desenlaces:** elija un desenlace para ver solo ese.
* **Cualquier riesgo:** **Riesgo alto (el 10 % con más riesgo)**, **Riesgo muy alto (el 5 % con más riesgo)** o
  **Con algún riesgo calculado**.
* **Columnas:** cambia el orden de las columnas con flechas, o arrastre los encabezados. **Restablecer** vuelve al
  orden original. El orden se guarda solo en ese navegador.

Al pulsar el nombre de una columna, la lista se ordena por ella; un segundo clic invierte el orden. Abajo puede elegir
**Filas por página** (5, 10, 25 o 50) y cambiar de página.

**Columnas:**

| Columna | Qué muestra |
|---|---|
| **Niño** | Código seudonimizado. Al pulsarlo se abre su ficha clínica |
| **Edad gestacional** | Semanas de gestación al nacer |
| **Riesgo más alto** | El desenlace en que el niño tiene más riesgo y, si hay más, «y N más». «Sin riesgo calculado» si no hay ninguno |
| **Nivel de riesgo estimado** | **Muy alto** o **Alto** (en coral), o «Más que N de 10»: de cada 10 niños, cuántos tienen menos riesgo. Al pasar el mouse se ve la posición técnica |
| **Datos por revisar** | Cuántos datos raros tiene el niño |
| **Crecimiento** | «Bajo para la edad ×N»: cuántas medidas quedaron bajas para la edad. «Cayó ×N»: cuántas veces cayó desde el control anterior. «Sin alerta» si tiene medidas y ninguna quedó baja; «Sin dato» si no hay peso, talla ni perímetro |
| **Último control** | La última visita con algún dato y la edad corregida de ese día (o la fecha). «Sin controles» si no tiene ninguna |

### La ficha clínica de un niño (Experto y Administración)

Se abre al pulsar el código de un niño en el **Listado de niños**, en **Mediciones por revisar**, en un punto o en la
lista de niños con mayor riesgo del Seguimiento clínico, o en un correo de aviso. **Todos los niños** vuelve a la lista.

* **Encabezado:** «Ficha clínica · Niño …» (o «Niña …»), semanas de gestación al nacer, año de nacimiento, la sede («Sede 1») y fecha de los datos;
  lo que no se conoce no se menciona. A la derecha, el botón **Imprimir ficha** abre la impresión del navegador (o
  permite guardar en PDF). La hoja sale con el contenido de todas las pestañas del niño, en blanco y negro, sin menú ni
  botones y con un pie que dice la fecha de impresión, «KMCPred» y «Documento de apoyo clínico: no reemplaza el criterio
  médico». Imprima solo donde la Fundación lo autorice (ver
  [Privacidad](#privacidad)).
* **Pestañas:** **Resultados clínicos y riesgo estimado**, **Evolución del crecimiento**, **Comparación con otros
  niños** e **Historial de visitas** (solo aparecen las que tienen algo que mostrar). La ficha abre en **Resultados
  clínicos y riesgo estimado** si el niño tiene algún riesgo calculado; si no, en la primera pestaña con contenido. Las
  direcciones antiguas que abrían un desenlace (`?ver=riesgo-…` u `?ver=otros`) también llevan a esa pestaña.
* **Resultados clínicos y riesgo estimado:** todos los desenlaces del niño en una lista y, al lado, el detalle del que se elige (el de más riesgo
  abre elegido; el elegido queda en la dirección, `?desenlace=`). En el teléfono, la lista va sobre el detalle.
  * **La lista** dice, de cada desenlace, su riesgo más reciente, cómo queda frente a los demás niños («Más que N de
    10», y además «Alto» o «Muy alto» en coral cuando lo es), cuánto cambió frente a la visita anterior («Subió 13
    puntos») y **En prueba** si todavía no da alertas. Cada desenlace sale una sola vez. Los
    desenlaces sin riesgo calculado van aparte, bajo **Sin riesgo calculado**, con una línea que dice por qué (por
    ejemplo, «Aún no hay datos de la visita de 3 meses»).
  * **Los desenlaces a 12 meses** (talla baja y desarrollo psicomotor bajo) muestran el riesgo del niño con lo medido
    hasta cada visita (40 semanas, 3 meses, …), con el cambio de una visita a otra y, desde tres visitas, una gráfica de
    evolución. **Ver como tabla** y **CSV** traen los mismos datos. Al pie dice cómo se calculó (modelo, entrenamiento y
    con qué niños se calibró).
  * **Los demás desenlaces** muestran su tarjeta de riesgo y cómo cambió su posición en cada visita:
    * Grande, **«N de 10»**: de cada 10 niños, cuántos tienen menos riesgo. Si es alto, borde coral y la marca
      **Riesgo alto** o **Riesgo muy alto**. Al pasar el mouse se ve la posición técnica.
    * «Calculado con lo medido hasta …»: la visita cuyos datos se usaron.
    * **Probabilidad estimada:** la probabilidad que calcula el modelo, en porcentaje.
  * **Lo que más pesó** y **Datos que faltan:** los rótulos solo salen con algo debajo. **Lo que más pesó** lista los
    datos que subieron el riesgo (por ejemplo, «Días en UCI: 20»). **Datos que faltan** es una línea aparte: dice qué
    datos no se midieron, que también suben el riesgo, y que conviene registrarlos si se midieron. Si ningún dato subió el
    riesgo de forma notable, la ficha lo dice en una frase.
* **Evolución del crecimiento (frente a la OMS):** gráfica de cada medida frente a la OMS según la edad corregida. La línea en 0 es lo
  esperado para la edad; la franja ocre es la zona **baja para la edad**. Al pasar el mouse sobre un punto se ve cómo
  quedó («Bajo para la edad», «En el rango esperado») y su puntaje z. Los puntos que la OMS considera improbables no
  se dibujan.
* **Historial de visitas:** las visitas en orden, como estaciones de un recorrido. Bajo cada una está la edad corregida (o la fecha)
  y, si hay, las marcas **N por revisar** y **riesgo**. Un círculo coral indica que hay algo que mirar. Al pulsar una
  visita se ven sus detalles:
  * **…: lo que se midió:** tabla con **Dato**, **Valor** y **Revisión**. Las filas en coral son datos marcados como
    raros, con el motivo y el rango esperado («esperado A a B»).
  * **Frente a la OMS:** cada medida de esa visita: **Bajo para la edad** (en color), **En el rango esperado** o
    **Alto para la edad**. Al pasar el mouse se ve el puntaje z.
  * **Por qué se marcó:** cada dato raro con sus tipos de alerta.

### Explorar grupos de niños

Se abre con **Explorar más variables** en el Seguimiento clínico (no tiene entrada propia en el menú) y lo ven todos los
perfiles. Muestra las mismas cifras del Resumen de riesgos y calidad de datos, pero para el grupo de niños que usted
elija; el Resumen no cambia y sigue mostrando a todos.

* **Elija el grupo (panel de la izquierda):** casillas por variable (por ejemplo sexo, sede o edad gestacional), con
  cuántos niños tendría cada opción en la columna **Niños**; un clic en cualquier parte de la fila la marca, y las
  opciones se leen sin códigos («Sede 1», «Femenino», «Muy prematuro (28 a 31 sem)»). Lo elegido aparece como fichas
  que se quitan con la **x**. Con **Agregar otra característica** suma otras. Si una variable se mide muchas veces,
  elija si cuenta la primera, la última, en alguna visita o en una visita concreta. La **edad gestacional (categoría)**
  es una lista (extremo, muy prematuro, moderado o tardío, a término): cada casilla es su propio tramo. Un rango se
  escribe en dos campos cortos («de … a … semanas»); lo que se ve gris dentro de ellos («mín. 24», «máx. 41») es solo
  una pista de lo que hay, no un valor puesto. La sección **Período** dice por qué fecha se cuenta a los niños
  («Contar a los niños por: fecha de nacimiento») y si se toma todo el período, entre dos fechas o los últimos meses
  antes del corte; debajo dice entre qué años nacieron los niños del corte. Todo viaja en la dirección, así que un
  enlace copiado abre el mismo grupo. El mismo panel se abre como cajón al lado derecho con **Cambiar grupo**
  (Seguimiento clínico) y con **Editar** o **Elegir grupo B** (Comparar grupos de niños): los filtros se aplican al
  instante, abajo se ve cuántos niños quedan en el grupo, **Listo** o **Esc** lo cierran y la página de atrás no se mueve.
* **Grupo guardado y Guardar este grupo (Experto clínico, Experto en datos y Administración):** el grupo guardado se
  elige arriba del panel para volver a usarlo (por ejemplo en Estimar riesgo). Al guardar, el formulario ofrece el
  **Muestreo para entrenar** (todos los que cumplen o un tope por categoría): es propio de la muestra que se guarda para
  entrenar, así que no aparece en el Seguimiento clínico, en Comparar grupos ni en Explorar, y el grupo guardado
  conserva el que traiga la dirección.
* **Qué se ve:** niños en el grupo, datos registrados de los niños del grupo, niños con algún riesgo alto, el porcentaje de los niños evaluados que
  tuvo crecimiento bajo frente a la OMS en alguna visita (D74), y
  tres gráficas: riesgo del grupo, crecimiento del grupo (una línea por medida con el porcentaje de niños evaluados con
  crecimiento bajo en cada visita, como en el Resumen) y quiénes son los niños. La caja y bigotes por visita está en el
  Seguimiento clínico, no aquí.
* **Privacidad:** con menos de 20 niños no se muestran cifras; basta quitar algún filtro. Todos los perfiles ven las
  mismas cifras, exactas: nada se redondea ni se aproxima. Una opción con 1 a 4 niños dice su número.
* **Cómo leer los símbolos:** una opción sin niños se ve **0**; una opción con 1 a 4 niños dice cuántos son; **—** es un grupo
  de menos de 20 niños. Si ningún niño cumple, aparece «Ningún niño cumple estos filtros» con el botón para quitarlos.
  El muestreo de un grupo guardado no cambia las cifras de Explorar: solo dice con cuántos niños se entrenaría.

### Evaluación de modelos

Está en **Datos y modelos** y la ven Consulta, Experto en datos y Administración (el Experto clínico no, D77). Responde:
¿qué tan bien ordena el modelo a los niños, es fiable su riesgo y funciona igual para todos? Tiene once análisis,
dentro del grupo del menú (en el teléfono, como fichas que se deslizan arriba): **Ficha del modelo**, **Detección y
falsas alertas**, **Anticipación de las alertas**, **Calibración y umbrales de alerta**, **Variables que influyen en la
estimación**, **Niños incluidos y datos disponibles**, **Rendimiento por grupo de niños**, **Rendimiento del modelo en
el tiempo**, **Evolución del crecimiento**, **Perfiles de niños** y **Comparar entrenamientos**. El encabezado dice
«Analítica ›» con el nombre del análisis y la pregunta que responde. El grupo trae además **Entrenamientos propios**
(Experto en datos y Administración, ver [abajo](#entrenamientos-propios-experto-en-datos-y-administración)).

* **Contexto de análisis:** arriba se elige el **Entrenamiento**, el **Desenlace** y se ve el modelo, su versión y la
  fecha de los datos. Queda en la dirección, así que un enlace copiado abre la misma vista. En el teléfono se pliega.
  Además, la aplicación recuerda el último **desenlace** y la última **visita** que eligió: al volver a entrar a
  Evaluación de modelos en la misma pestaña del navegador no tiene que elegirlos de nuevo. Si abre un enlace con otros valores, mandan
  los del enlace.
* **Guía de lectura:** cada submódulo explica en pocas líneas cómo leerlo.
* **Una sola palabra:** las pantallas usan la palabra clínica («Casos detectados», «Alertas acertadas»). La palabra
  subrayada explica qué mide y da su nombre estadístico («En estadística: sensibilidad»); no hay un modo técnico aparte.
* **Ficha del modelo:** abre en **Cómo le fue**; **Cómo se entrenó** (configuración, trazabilidad e hiperparámetros) va al final.
* **En prueba:** un desenlace marcado así se ve, pero aún no es oficial ni genera correos.
* **Sin analítica / «Este análisis estará disponible pronto»:** si el entrenamiento es anterior y no guardó los
  resultados de analítica, aparece **Sin analítica** y la opción de reentrenar (no se recalcula en silencio). Una ficha con
  «pronto» o un análisis **pendiente** todavía no se calcula para ese modelo (por ejemplo Anticipación de las alertas,
  si no hay desenlaces entrenados desde varias visitas).
* Un grupo o una celda con 1 a 4 niños dice cuántos son. **sin cifra** es lo que no se puede calcular: un desvío, unos cuartiles o un AUC
  piden 20 niños o más, y el intervalo del AUC pide además 5 niños con el desenlace y 5 sin él (es un límite estadístico, no de
  privacidad).
* **Perfiles de niños** son provisionales: edad gestacional y clasificación de Lubchenco; ningún experto los ha aprobado todavía.
* **Anticipación de las alertas:** elija una familia de desenlaces y vea cuántos casos se avisaron antes, con qué
  ventaja, la primera visita con alerta y el costo de avisar antes. La administración ve además tres niños visita por
  visita (D77). Los entrenamientos la calculan por defecto (D68); los anteriores a esta versión pueden no traerla.
* **Calibración y umbrales de alerta, y Niños incluidos y datos disponibles:** la primera suma el riesgo de los niños con
  y sin el desenlace; la segunda, la muestra frente a todos los niños y sus cuantiles. Un entrenamiento anterior no trae
  estos dos paneles y lo explica.
* **Variables que influyen en la estimación (interpretabilidad):** importancia de cada dato, cómo cambia el riesgo al variar un dato, los motivos más
  frecuentes de alerta y cómo se combinan dos datos. Es **asociación, no causa**. Un entrenamiento anterior muestra solo la
  importancia general y pide reentrenar.
* **Comparar entrenamientos** pone dos entrenamientos (A y B) lado a lado, con intervalos del 95 % (aproximados) y la
  pestaña **Grupos de niños** para comparar dos grupos. Solo Experto en datos y Administración pueden aprobar el
  entrenamiento B (**Aprobar y activar el modelo B**): pide confirmación, usa las anomalías en producción y queda en la
  auditoría.

### Descripciones, PNG y CSV

Cada gráfica y tabla de datos lleva bajo el título una frase fija que dice qué muestra y cómo leerla (también en el
teléfono). Sus botones permiten llevarse el dato: **PNG** de la gráfica (con título, descripción, muestra y fecha) y
**CSV** de las tablas de agregados. Esto vale también para las gráficas del Resumen de riesgos y calidad de datos y del
Seguimiento clínico.

* **Ver como tabla:** en las gráficas con datos de filas, este botón cambia la gráfica por una tabla con los mismos
  números, útil para leer valores exactos o para quien no distingue bien los colores. Pulse otra vez para volver a la
  gráfica. Mientras la pantalla siga abierta, la aplicación recuerda qué eligió en cada gráfica (el botón **PNG** solo
  está en la vista de gráfica).
* **Recorrer con el teclado:** con el Tab llegue a la gráfica y use las flechas izquierda y derecha para pasar de un
  punto o barra al siguiente; **Inicio** y **Fin** saltan al primero y al último. Cada valor se anuncia en voz alta para
  los lectores de pantalla.

### Perfil del niño y primera alerta (Experto y Administración)

En la ficha de un niño, la tarjeta **Perfil del niño** muestra fichas con su categoría por edad gestacional
(prematuro extremo, muy prematuro, moderado a tardío, a término), su clasificación de Lubchenco (peso adecuado, pequeño
o grande para la edad) y la visita actual; no muestra cifras clínicas. En **Riesgo en cada visita**, una estrella marca
la **primera alerta**: la primera visita en que el riesgo cruzó la línea de alerta. Sigue **Al nacer, frente a los demás
niños**, que ubica al niño frente al resto del programa.

---

## Perfil Experto clínico

El experto clínico trabaja con la sección **Clínica** del menú: **Seguimiento clínico**, **Listado de niños** (y la
ficha clínica de cada uno), **Comparar grupos de niños**, **Revisión clínica de casos** y **Estimar riesgo**. En el
Seguimiento clínico ve además los puntos de los niños más alejados y la lista de niños con mayor riesgo. La sección
**Datos y modelos** (mediciones por revisar, guía de variables, evaluación y operación de modelos, Resumen,
configuración) es del Experto en datos (D77). Sus respuestas en la revisión son las que dicen si los modelos sirven:
tómese el tiempo necesario y use **No lo sé** cuando no esté seguro.

### Revisión clínica de casos

Una revisión **ciega**: una muestra fija de niños (hasta 20 de riesgo alto y 20 del resto, mezclados en un orden fijo
para esa corrida). **A propósito no se muestran ni el riesgo ni la posición.**

Se ve **un niño por pantalla**, con **Anterior** y **Siguiente**; al responder pasa al siguiente sin responder.
Cada caso muestra el número de caso, el código del niño, la visita y su fecha, el **desenlace** a evaluar y un resumen
con lo que vería en consulta: edad gestacional, datos al nacer y lo medido en esa visita. No incluye texto libre,
porque podría traer nombres.

* **¿Le preocupa este niño?** **Sí, me preocupa**, **No me preocupa** o **No lo sé**, según su criterio clínico para
  ese desenlace.
* **Motivo (opcional, escríbalo antes de responder):** se guarda junto con la respuesta. Mientras escribe, el
  texto queda como **borrador** en esta pestaña del navegador: si pasa a otro niño con **Anterior** o **Siguiente**, o
  recarga la página, lo encuentra al volver. El borrador se borra al responder o al cerrar la pestaña.
* **Pantallas anchas:** en un computador el caso se reparte en dos columnas. A la izquierda, el niño, la visita, el
  resumen y el crecimiento; a la derecha, la pregunta, los botones y el motivo. Así no hay que bajar para responder. En
  el teléfono todo va en una sola columna.
* Arriba a la derecha, la barra **Respondidos** muestra cuántos lleva de cuántos.

**Por qué es ciega.** Si el modelo ordena bien, los niños de riesgo alto deberían preocupar más que el resto. Para
saberlo sin influir en usted, solo la administración ve el resumen mientras dura la revisión.

### Estimar riesgo (Experto clínico y Administración)

**Estimar riesgo** es una sola entrada del menú, con dos pestañas arriba: **Estimación individual** (la que abre por
defecto) y **Estimación por grupo**. La pestaña elegida queda en la dirección (`/prediccion` y
`/prediccion?vista=grupo`), así que se puede copiar el enlace y el botón Atrás del navegador la respeta. Con el teclado,
las flechas izquierda y derecha pasan de una pestaña a otra. La dirección antigua `/inferencia` lleva a la pestaña
**Estimación individual**.

#### Estimar riesgo · Estimación individual

Sirve para ver qué riesgo calcula el modelo para un niño que no está en la base, o para un caso puntual, sin escribir
código. **No se guarda nada.** El formulario se arma solo con las variables del paquete activo, así que cambia cuando
la administración activa otro.

1. **Datos del niño:** **Fecha de nacimiento** y **Semanas de gestación al nacer** (las dos son obligatorias). Debajo,
   plegado en **Más datos del niño y la familia**, lo que no depende de una visita (por ejemplo, el hogar).
2. **Visitas:** una tarjeta por visita, en orden. Pulse la que quiera llenar; **llene solo las que tenga**.
   * Bajo el nombre dice **Aquí se calcula: …**: los riesgos que se calculan con lo medido hasta esa visita.
   * **Fecha de la visita** (menos en el nacimiento, que usa la fecha de nacimiento), con la edad en que se espera.
   * Primero aparecen los datos que más pesan en el riesgo y las medidas de crecimiento; el resto está en **Más datos
     de esta visita**. Los números aceptan coma o punto; las listas muestran sus opciones.
   * La tarjeta muestra cuántos datos tiene llenos.
3. Pulse **Estimar riesgo**. Si falta algo (la fecha de nacimiento, la fecha de una visita con datos, un número mal
   escrito), aparece arriba del botón qué falta. Si cambia un dato después de calcular, un aviso dice que el resultado
   es de datos que ya cambiaron hasta que vuelva a calcular (D75).

Lo que deje vacío se toma como dato faltante: el modelo calcula igual, con menos información. **Cargar un niño de
ejemplo** llena el formulario con un niño simulado para ver cómo funciona; **Limpiar** lo vacía.

La pantalla se titula **Estimar riesgo individual** y se reparte en pestañas: **Datos del niño** (el formulario) y,
tras calcular, las del resultado, con las mismas palabras que la ficha clínica de un niño (antes de calcular, la
pestaña **Riesgo estimado** dice «Aquí aparecerá el resultado»):

* **Riesgo:** una pestaña por desenlace a 12 meses (con el riesgo visita por visita) y **Otros riesgos** (o **Riesgo
  calculado**). Por desenlace, el riesgo estimado, «N de 10 niños tienen menos riesgo», la marca **Riesgo alto** o
  **Riesgo muy alto** si corresponde, y **Lo que más pesó**. Si dice que no se alcanza a calcular ningún riesgo, llene
  una visita en la que diga «Aquí se calcula».
* **Datos que parecen raros:** el dato, su valor, lo esperado, por qué se marcó y el tipo de alerta.
* **Crecimiento** (frente a la OMS): cada medida con su edad corregida y cómo queda («Bajo para la edad», «En el rango
  esperado»…), y las marcas **Cayó desde el último control** o **Dato improbable: revisar**.

**Modo avanzado (solo administración):** el botón **Ingresar datos en formato JSON** muestra el cuadro de antes (**Volver
al formulario** regresa), para calcular hasta 50 niños a la vez o casos que el formulario no cubre (por ejemplo,
episodios de hospitalización), con `sujetos`, `mediciones` y `episodios` y los nombres de variable del diccionario.

Si dice «No hay un paquete de modelos activo», hay que activar uno en **Operación de modelos › Modelos disponibles**
(quien es de administración ve el enlace; los demás ven «Pídale a la administración que active un modelo.»). Si el cálculo falla
con los datos escritos, dice «No se pudo calcular el riesgo con estos datos. Revise los valores que escribió e intente
de nuevo.»; el detalle técnico queda en el registro de la API.

Recuerde: si escribe datos de un niño real, no ponga su nombre ni su documento; el formulario no los pide.

#### Estimar riesgo · Estimación por grupo

La pantalla se titula **Estimar riesgo por grupo**. Calcula el riesgo con un modelo ya entrenado, sin guardar nada por
niño.

* **Modelo:** cualquier versión del registro. Un modelo de un corte anterior se puede usar, con un aviso en coral.
* **Muestra o todo el universo:** use una muestra guardada (hecha en Explorar) o todo el universo de niños. Los niños con
  que se entrenó el modelo se dejan fuera, y la pantalla lo avisa.
* **Resultado:** cómo se reparte el riesgo, riesgo por desenlace, el **riesgo alto en cada visita** y los niños con más
  riesgo (los de riesgo alto o muy alto llevan etiqueta). El cálculo corre en segundo plano con barra de avance; la tabla
  por niño se conserva **una hora** y se ve de 200 en 200 (después hay que recalcular). Si después de calcular cambia
  el grupo, la visita o la exclusión de niños, el resultado se atenúa con el aviso «Resultado de la selección
  anterior» hasta volver a calcular (D75).
* **Niño nuevo:** elija una visita y un perfil, parta de un niño de ejemplo con valores típicos, cambie solo lo que sea
  distinto y calcule. Con menos de 20 niños en el perfil no se da un ejemplo. **Guardar este niño** lo deja como niño o
  como plantilla (las plantillas las ven todos los expertos) y se borra desde la tabla de guardados.
* **Niños del entrenamiento:** «Dejar fuera a los niños del entrenamiento» funciona con los modelos nuevos; en un modelo
  anterior dice «no verificable» hasta reentrenar.
* **Exportar CSV por niño:** solo lo ve y lo puede usar la administración; queda registrado quién lo descargó. Con menos de
  20 niños no se exporta.

## Perfil Experto en datos

El experto en datos cuida los datos y los modelos: responde **Mediciones por revisar**, mantiene la **Guía de variables
y unidades** (el diccionario), configura el sistema y el entrenamiento, programa las ejecuciones automáticas, entrena y
aprueba modelos, activa paquetes y recalcula riesgos. Todo está en la sección **Datos y modelos** del menú. También ve
el **Seguimiento clínico** (sin los puntos de niños ni la lista de niños con mayor riesgo), **Comparar grupos de niños**,
la **Evaluación de modelos** y el **Resumen de riesgos y calidad de datos**, pero no ve niños uno por uno ni la
**Revisión clínica de casos**, **Estimar riesgo**, **Usuarios y permisos** o **Notificaciones** (D77).

Las secciones que siguen describen lo que antes hacía la administración; el experto en datos las hace igual. Donde
dicen «la administración», lea «la administración o el experto en datos».

### Mediciones por revisar (Experto en datos y Administración)

Se abre en **Datos y modelos › Mediciones por revisar**; los perfiles Consulta y Experto clínico no ven esta opción. La dirección antigua
`/revision/datos` lleva a esta página (dirección actual: `/admin/calidad-datos`). Son mediciones dudosas o faltantes, no
riesgos clínicos: datos a revisar antes de usarlos.

Arriba hay tres cifras: **mediciones por revisar** (las que usted no ha respondido), **revisadas este mes** y
**completitud a los 12 meses** (de los niños elegibles, cuántos tienen talla medida en esa visita).

**Mediciones por revisar** es la lista de trabajo:

* **Filtros:** **Visita**, **Medición**, **Regla o modelo que detectó la medición** (**Valor fuera de lo esperado**,
  **No cuadra con el resto de sus datos** o **Cambio raro entre controles**) y **Estado** (**Por revisar**, por defecto, **Ya revisadas** o
  **Todos**).
* Van primero las que tienen más alertas y más fuertes. Hay 12 por página.
* Cada fila dice el **niño** (enlace a su ficha, que solo abren Experto clínico y Administración), la **visita**, la
  **medición**, el **valor registrado** tal como está en la base (en coral), **por qué es dudosa** («Esperado entre A y
  B»), quién la **detectó** y su **estado** (**Confirmado**, **Por corregir** o **Sin saber** cuando ya tiene
  respuesta).
* **Acción:** **Confirmar valor correcto** dice que el valor registrado es correcto. **Corregir** la marca como error de
  registro: solo la marca, el valor no cambia en la plataforma (se corrige en la base de la entidad). **No puedo
  determinarlo** queda para cuando no se puede decidir. La respuesta se guarda al pulsar y se puede cambiar.
* La flecha de cada fila abre el detalle: lo más probable para ese niño, cuándo se midió, sus otras visitas, las
  respuestas de todo el equipo y un **comentario** opcional. Escriba el comentario **antes** de pulsar la respuesta,
  porque se guarda junto con ella.

Cada persona responde por su cuenta: «Por revisar» y «Ya revisadas» se refieren a sus propias respuestas.

**Completitud por visita** está al lado: el porcentaje de niños con talla medida en cada visita, entre todos los niños
elegibles. Quien aún no llega a la visita, no asistió o no tiene una talla válida cuenta como sin dato; es la misma
cuenta de **Comparar grupos › ¿Faltan datos distintos?**

**Resumen de alertas de calidad de datos** (abajo, se despliega) trae **Alertas por tipo**, **Aciertos frente a la
revisión** (cuántas marcó el equipo para corregir entre las primeras de la lista) y **Dónde se concentran** (sede y
dato con más alertas).

**Para qué sirven sus respuestas.** Con ellas se mide qué parte de lo que marca cada capa es de verdad un error. Esa
precisión ajusta qué tan exigente será el modelo en el siguiente entrenamiento.

### Guía de variables y unidades (diccionario)

Se abre en **Datos y modelos › Guía de variables y unidades** (dirección `/diccionario`). El diccionario de variables
dice qué es cada variable de la base, en qué visita se mide y si el sistema la usa. Se
edita en la página, con formularios, y guarda todas sus versiones. El Excel queda para exportar e importar.

* **Editar el diccionario:** una pestaña por hoja (**Variables**, **Visitas**, **Desenlaces**…) con un buscador.
  Pulse el código de una fila y se abre su formulario: cada campo con su ayuda, listas desplegables donde las
  respuestas son cerradas y un asterisco (*) en lo obligatorio. El código de una fila no se cambia. **Aplicar** deja el
  cambio pendiente; **Quitar la fila** la marca para borrar (las variables no se borran: márquelas **No usar**).
  **Agregar fila** está en las hojas donde se pueden sumar filas (visitas, desenlaces…); las variables las trae la base.
* Con cambios pendientes aparece **N fila(s) con cambios sin guardar**, con **Descartar** y **Revisar y guardar**. Revisar
  muestra cada cambio (antes → después) y qué cambia frente a la versión en uso. Si algo no cuadra, dice el problema
  con la hoja y el código de la fila (por ejemplo «Variables · ac_adapseno: …») y no deja guardar. **Guardar versión
  nueva** la deja en uso, con una nota opcional. Si alguien guardó otra versión mientras usted editaba, la página lo
  avisa y sus cambios siguen ahí para revisarlos otra vez.
* **Variables nuevas por clasificar:** cuando la base trae variables nuevas, aparecen aquí con su visita sugerida.
  Pulse **Lista** para que el sistema la use o **No usar** para descartarla. Si a una le falta información (por
  ejemplo, el rol), pulse **Completar**: abre su formulario. Si una actualización trajo variables que aún no están
  en el diccionario, verá un aviso con **Agregarlas al diccionario**.
* **Desenlaces que se entrenan:** por defecto, dos. **Desarrollo psicomotor bajo a los 12 meses** está «En uso» (da
  alertas) y **talla baja para la edad a los 12 meses**, calculada desde cada visita, está «En prueba»: se entrena y
  se muestra, pero no da alertas hasta que un entrenamiento con datos reales muestre que funciona. Los demás
  desenlaces siguen en la hoja **Desenlaces** como «No usar»; para volver a usar uno, cambie su estado y entrene de
  nuevo.
* El número junto a **Guía de variables y unidades** en el menú, y el aviso del **Resumen de riesgos y calidad de
  datos** («Revisarlas en Diccionario»), dicen cuántas variables faltan por revisar.
* **Exportar a Excel** (arriba) baja el que está en uso. **Importar desde Excel** sube uno editado fuera: antes de
  confirmar verá qué cambia; si el archivo tiene un error, dice en qué hoja y fila; si es igual al que está en uso, no
  se guarda nada.
* **Historial de versiones:** cada versión con su estado, quién la subió, cuándo y su nota. Puede **Descargar**
  cualquiera o **Volver a esta**. Ninguna versión se borra.

### Entrenamientos propios (Experto en datos y Administración)

Está dentro del grupo **Evaluación de modelos** (dirección `/mis-modelos`; antes se llamaba «Mis modelos»). Permite
entrenar un modelo propio con los hiperparámetros vigentes. Tiene tres pestañas: **Nuevo entrenamiento**, **Modelos
propios** y **Límites de uso**.

* **Sus límites:** por defecto 3 modelos personales guardados y 1 entrenamiento en cola por persona. La administración no
  tiene límite. Administración y Experto en datos pueden cambiar estos valores en **Límites de uso** (panel **Límites de
  Entrenamientos propios**).
* **Entrenar modelo nuevo:** nombre, descripción, datos y **Muestra de niños** (o **Armar una muestra** con filtros,
  fecha y tope por grupo). Con menos de 200 niños el aviso dice que el modelo puede salir poco confiable. El
  entrenamiento entra a la **cola**, que muestra posición, dueño y tiempo estimado; puede cancelar el suyo.
* **Modelos propios (banco de modelos):** con dueño, muestra, corte y AUC. La etiqueta **Personal** significa que no
  cambia el Resumen ni envía correos; los **Oficiales** los entrenan la administración y el experto en datos (desde
  **Entrenar y aprobar modelos**). **Corte anterior** marca un modelo de
  un corte de datos previo: sigue usable en Estimar riesgo con aviso. Los modelos personales descartados o sin uso se borran a los
  90 días (con un aviso «Se borra en N días» desde 14 días antes); nunca se borran los aprobados ni los que están en uso.
  Puede filtrar por **Mostrar** y **Dueño**, y ver el AUC y **Otras medidas**. Una versión personal no se puede aprobar.

---

### Configuración del sistema y del entrenamiento

Está en **Datos y modelos › Configuración**. Es lo que la solución necesita para correr sola, en cuatro pestañas:
**Estado del sistema**, **Base de datos**, **Parámetros de entrenamiento para detectar mediciones atípicas** y
**Parámetros de entrenamiento para estimar riesgo clínico**. En **Estado del sistema**, **Estado de la configuración**
marca cada paso como listo o pendiente:

1. **Llave de cifrado en el servidor:** el equipo técnico define `MAIA_CIFRADO_CLAVE` en el servidor. Sin ella la
   clave de la base no se puede guardar desde la web.
2. **Conexión a la base de la entidad:** el Postgres de la Fundación de donde salen los datos.
3. **Horario de las ejecuciones:** al menos una programación activa (ver **Programar ejecuciones automáticas**).
4. **Modelos aprobados en uso:** un paquete activo (ver **Entrenar y aprobar modelos**).

**Base de datos de la entidad (origen)** (pestaña **Base de datos**): **Servidor**, **Puerto**, **Base**, **Usuario**, **Esquema** (por defecto
`consumo`), **SSL** y **Espera al conectar**. La **Clave** se guarda cifrada y nunca se vuelve a mostrar: si ya hay
una, el campo dice «(guardada)»; déjelo vacío para conservarla. **Probar conexión** se conecta en solo lectura con lo
que está escrito (sin guardarlo) y dice cuántas tablas ve en el esquema. **Guardar** la deja lista para las
ejecuciones. Si no hay nada guardado, se usan los valores del servidor (`KMC_*`).

**Hiperparámetros:** una pestaña por modelo (anomalías, para detectar mediciones atípicas, y alertas clínicas, para
estimar riesgo clínico). Cada campo muestra en gris el valor por defecto del núcleo y entre paréntesis sus límites.
Escriba solo lo que quiere cambiar y pulse **Guardar**; aplica al **próximo** entrenamiento. **Volver a los valores por
defecto** borra los ajustes (pide confirmación y afecta a todo el equipo). Cada cambio queda en la auditoría y MLflow registra los
valores usados.

### Programar ejecuciones automáticas

Está en **Datos y modelos › Configuración**, con dos pestañas: **Horarios y ejecuciones** y **Crear programación**
(**Editar programación** cuando edita una). Cada ejecución **extrae** la base de la entidad, **revisa** los datos y
**calcula** los riesgos siempre con los modelos **aprobados** en **Entrenar y aprobar modelos**. Las ejecuciones programadas además **entrenan** los dos modelos y los
**registran en MLflow** como *candidatos*, que solo se usan cuando alguien los aprueba. **Corrida ahora** no entrena:
calcula con los aprobados. Si todavía no hay modelos aprobados, la corrida no se hace y el mensaje dice que primero hay
que entrenar y aprobar.

* **Crear programación:** **Nombre**, **Datos** (la base de la Fundación o los datos simulados),
  **Frecuencia** (cada semestre, trimestre, mes, semana o día, a las 02:00) u **Otra (expresión cron)**
  (`minuto hora día-del-mes mes día-de-la-semana`). Debajo se lee la frecuencia en español y las próximas fechas.
* **Filtros de la extracción (opcionales)** (solo la base real): **Nacidos desde (año)**, **Nacidos hasta (año)** y
  **Solo niños con visitas en los últimos (meses)** (conservan su historia completa).
* **Solo si la base cambió desde el último corte:** si no hay datos nuevos, no entrena. **En silencio:** guarda los
  riesgos sin mostrarlos ni enviar correos. **Activa:** quítela para pausar sin borrar (la programación queda
  **Pausada**). Pulse **Crear programación** (o **Guardar cambios**).
* **Horarios programados:** cada programación con su frecuencia, la **Próxima** y la **Última** ejecución. **Ejecutar
  ahora** la pone en cola sin mover su horario; **Editar** y **Borrar**.
* **Historial de ejecuciones automáticas:** la cola. **Corrida ahora** pide una corrida inmediata. Cada fila dice si está **En cola**, **En
  curso**, **Terminada** o **Con error**, quién la pidió (programada o a mano), el mensaje, las versiones registradas
  y **Ver detalle técnico** (las últimas líneas del proceso, sin datos de niños). Si falla, el mensaje dice qué pasó en
  palabras claras (por ejemplo, que la base rechazó la clave o que MinIO no dio permiso) y el texto original queda en
  **Ver detalle técnico**. Se actualiza sola mientras hay algo en curso.

Las ejecuciones las hace el **programador**, un servicio del servidor con GPU: toma lo que está en cola en menos de un
minuto y hace una a la vez.

### Entrenar y aprobar modelos

Está en **Datos y modelos › Operación de modelos**. Muestra lo que MLflow registró de cada entrenamiento, para elegir
qué modelos usa la solución. Arriba se elige **Datos** (base de la Fundación o simulados) y, si está configurado,
**Abrir MLflow**. Tiene tres pestañas: **Entrenar ahora**, **Modelos de calidad de datos** (anomalías) y **Modelos de
riesgo clínico**. Lo que entrenan aquí la administración y el experto en datos es **oficial** (D77).

* **Entrenar ahora:** manda a entrenar de inmediato. Elija los modelos (**Anomalías** y/o **Alertas
  clínicas**), si se traen **datos nuevos de la fuente** (la base de la entidad o una cohorte simulada nueva; si no,
  se usa el último corte) y escriba los **hiperparámetros** de este entrenamiento (parten del ajuste guardado o del
  valor del núcleo). **Guardar también estos valores para las ejecuciones programadas** los deja para las ejecuciones
  programadas. Pulse **Entrenar ahora**. El recuadro de estado muestra el avance paso a paso (**En cola**, **Trayendo
  los datos de la fuente**, **Entrenando anomalías**, **Entrenando alertas clínicas**, **Entrenado y registrado en
  MLflow**) y se actualiza solo cada pocos segundos. Mientras corre, el menú muestra **Entrenando…** junto a **Entrenar
  y aprobar modelos** (y un punto ocre junto a **Operación de modelos**). Al terminar dice
  **Modelo entrenado** con las versiones nuevas (como *candidato*) y la tabla las incluye; si falla, marca el paso
  donde falló y **Ver detalle técnico** muestra el texto original. Solo hay un entrenamiento a la vez.
* Una tabla por modelo con **Fecha**, **Corte**, **Versión** (con el alias *candidato* o *produccion*, y **ajustado**
  si se entrenó con hiperparámetros de administración), los hiperparámetros principales (**rondas**, **tasa**,
  **hojas**, **min_hoja**) y las cifras de validación (**AUC medio** y **Desenlaces con modelo** en las alertas
  clínicas; **Falsas por 1.000** y **Detectados %** en anomalías).
* **Detalle:** todos los hiperparámetros, todas las métricas, los filtros de la extracción y las etiquetas del run.
* **Comparar:** marque dos o tres entrenamientos del mismo modelo; la tabla de comparación muestra (por defecto) solo
  lo que cambia entre ellos, en negrita.
* **Aprobar para usar en la solución:** elija una versión de cada modelo en la columna **Aprobar** y pulse **Aprobar y
  poner el modelo en uso**. El programador pasa esas versiones a *produccion*, arma y firma el paquete, y la aplicación
  lo activa sola en unos segundos (se ve en **Programar ejecuciones automáticas › Historial de ejecuciones
  automáticas** y en **Modelos disponibles**).

### Modelos disponibles (paquetes)

Está en **Datos y modelos › Operación de modelos**. Los modelos se entrenan en el equipo de entrenamiento y llegan como
un **paquete firmado** (archivo `.tar.gz`). Al aprobar en **Entrenar y aprobar modelos** el paquete se arma, se sube y
se activa solo; aquí también se puede subir a mano.

* **Importar un modelo:** elija el **Archivo del modelo** y pulse **Importar modelo**. Mientras dice «Verificando…», la aplicación
  comprueba la firma, cada archivo y la versión de LightGBM. Si todo está bien: «Paquete … verificado y guardado.
  Actívelo para usarlo.». En la demostración solo se aceptan paquetes entrenados con datos simulados.
* **Lista de paquetes:** cada uno con su versión, la marca **Activo** si es el que está en uso, y su fuente
  (`simulado` o la base real). Muestra **Corte de entrenamiento**, **Creado**, **Subido** y la versión de cada modelo
  (**Modelo clínico**, **Modelo de anomalías**). **AUC de validación por desenlace** despliega, por desenlace, el
  **AUC** y el **Top 10 %** (de los niños que tuvieron el desenlace, qué parte estaba en el 10 % de mayor riesgo). La
  validación técnica de los modelos se ve aquí, en **Entrenar y aprobar modelos** y en la **Evaluación de modelos**, no
  en el Resumen.
* **Activar:** pone ese paquete en uso. Las corridas y **Estimar riesgo › Estimación individual** usan siempre el
  paquete activo.

Mensajes comunes: «La firma no coincide» (el paquete se firmó con otra clave) y «El paquete se hizo con LightGBM X»
(versiones distintas). Los dos se resuelven en el equipo técnico.

### Recalcular riesgos (corridas)

Está en **Datos y modelos › Operación de modelos**. Una corrida pasa los datos del corte vigente por los dos modelos del
paquete activo y deja los resultados en el Seguimiento clínico, el Resumen, la lista de niños y las colas de revisión.

* **Recalcular con el corte de datos vigente:** pulse **Iniciar recálculo de riesgos**. La casilla **En silencio**
  guarda los riesgos sin mostrarlos ni enviar correos. Se usa para comparar un modelo nuevo antes de entregárselo al equipo clínico. Si no hay paquete
  activo, verá «No hay un paquete activo. Actívelo en Modelos antes de ejecutar.».
* Mientras corre, el botón dice «Hay una corrida en curso» y la lista se actualiza sola cada pocos segundos.
* **Historial:** **N.º**, **Estado** (**En curso**, **Terminada** o **Con error**, y **En silencio** si aplica),
  **Corte** (fecha y fuente), **Paquete**, **Inició**, **Niños**, **Por revisar** y **Detalle**. El detalle muestra el
  paso actual, el mensaje de error o el tipo de corrida: **Recálculo con el corte vigente** (esta página), **Extracción y
  cálculo** (Corrida ahora o una programación), **Solo revisión de datos** o **Solo riesgos**.

La corrida con la base de la Fundación (extraer y calcular con los modelos aprobados) se programa o se pide con
**Corrida ahora** en **Programar ejecuciones automáticas**; cuando termina, aparece también en este historial.

## Perfil Administración

La administración ve todo lo anterior (también lo clínico de cada niño y la sección **Datos y modelos**) y, además, la
sección **Administración** (**Usuarios y permisos**), la sección **Notificaciones** y el resumen de la **Revisión
clínica de casos**.

### Usuarios y permisos

* **Tabla de usuarios:** **Usuario** (nombre, correo y último ingreso), **Rol de acceso** y el estado (**Activo** o
  **Inactivo**).
* **Cambiar el perfil:** elija otro en la lista **Rol de acceso** de esa fila y confirme con **Cambiar perfil**. No
  puede cambiar su propio perfil.
* **Contraseña:** abre un campo **Nueva contraseña para …**. Escriba al menos 10 caracteres y pulse **Guardar
  contraseña**. Las sesiones abiertas de esa persona se cierran.
* **Desactivar / Activar:** un usuario inactivo no puede ingresar. No puede desactivarse a sí mismo.
* **Crear cuenta de usuario** (panel de la derecha): **Nombre**, **Correo electrónico**, **Rol de acceso**
  (**Administración**, **Experto clínico**, **Experto en datos** o **Consulta**) y **Contraseña inicial** (mínimo 10
  caracteres). Pulse **Crear usuario**. Entregue la
  contraseña por un canal seguro (no por el mismo correo).

Buenas prácticas: dé a cada persona el perfil mínimo que necesite. Desactive (no comparta) las cuentas de quienes ya
no participan.

### Notificaciones

La sección **Notificaciones** del menú tiene dos pantallas, las dos solo de administración.

**Configuración del correo saliente.** Los **Datos del servidor de correo (SMTP)**: **Servidor (host)**, **Puerto**
(«Suele ser 587 con TLS, 25 sin TLS y 1025 en Mailpit»), **Usuario**, la clave (se guarda cifrada y no vuelve a
mostrarse; hace falta `MAIA_CIFRADO_CLAVE` en el servidor), **Correo remitente** y **Usar TLS (STARTTLS)**. Pulse
**Guardar configuración de correo**; la marca dice **Configurado** o **Sin configurar**. **Reestablecer** borra el
servidor guardado (mientras no se configure de nuevo, no sale ningún correo de alertas). En **Probar el correo**,
escriba un correo en **Enviar un correo de prueba a** y pulse **Enviar correo de prueba**: llega con el asunto
«[KMCPred] Correo de prueba». Si no llega en unos minutos, revise los datos del servidor.

**Reglas y envíos de alertas por correo.** Cada notificación (regla de envío) junta una o varias alertas clínicas y
tiene sus propios correos, para que cada grupo de especialistas reciba solo lo que le corresponde. Al terminar cada
actualización que no es en silencio, cada destinatario recibe un correo por notificación, solo con los niños nuevos
para ese correo: un resumen y un Excel adjunto (`kmcpred-riesgo-alto.xlsx`) con los niños cuya posición es igual o
mayor que el riesgo mínimo. El asunto empieza por «[KMCPred]» y dice cuántos niños son y el nombre de la notificación
(«[KMCPred] 3 niños con riesgo alto: Neonatología»); la cabecera dice «KMCPred · Alertas y predicción temprana» (D78).
El correo lo leen clínicos, así que no dice «posición» sino, con la misma escala de la pantalla, «más riesgo que 9 de
cada 10 niños». Cada niño lleva solo su código, su etiqueta de perfil (por ejemplo «Muy prematuro · Peso adecuado»),
la visita, la alerta, esa comparación y un enlace; nunca valores clínicos. Un niño no se repite para el mismo correo
aunque ese correo esté en varias notificaciones.

* **Crear regla de envío** (arriba) o **Editar** en una notificación abre el formulario:
  * **Nombre:** cómo se llama el grupo, por ejemplo «Neonatología».
  * **Riesgo mínimo:** la posición de 0 a 100 desde la que se avisa. Debajo dice qué significa: con 95, «Con 95 se
    avisa del 5 % de niños con más riesgo.»
  * **Correos que reciben el aviso:** escriba un correo y pulse Enter, coma o espacio (también puede pegar una lista).
  * **Enviar avisos:** enciende o apaga la notificación; para activarla se necesita al menos un correo.
  * **Alertas clínicas que activan el correo:** con buscador, **Elegir todas** y **Quitar todas**; hay que elegir al
    menos una.
  * **Guardar**, **Cancelar** o, al editar, **Eliminar** (deja de enviar avisos; el historial se conserva).
* **Cada notificación** muestra su nombre, la marca **Activa** o **Apagada**, sus alertas, sus destinatarios y el
  riesgo mínimo. **Enviar ahora** manda ya el resumen y el Excel con todos los niños de riesgo alto de la última
  actualización, aunque ya se les hubiera avisado (pide confirmación).
* **Historial de correos enviados:** un registro por cada notificación en cada corrida, el más reciente primero (no
  uno por niño y destinatario):
  * **Fecha:** la del último envío del registro.
  * **Notificación:** su nombre. Si se eliminó después, el registro se conserva y dice «Notificación eliminada».
  * **Destinatarios:** todos los correos del aviso. El que falló dice «No se envió» y el motivo.
  * **Niños:** cuántos niños distintos llevó el aviso. Si la notificación junta varias alertas, debajo dice cuántos
    por cada una.
  * **Riesgo:** cuántos de esos niños están en muy alto, en alto o por debajo de alto («2 muy alto · 1 alto»). De cada
    niño cuenta su riesgo más alto en el aviso.
  * **Estado:** **Enviado** si llegó a todos los correos, **Con errores** si falló alguno («Falló 1 de 2 correos») y
    **Error** si no llegó a ninguno.

  El detalle niño por niño va en el Excel adjunto de cada correo, no en esta tabla. Volver a enviar la misma
  notificación sobre la misma corrida actualiza su registro; no crea otro.

### Resumen de la revisión (solo administración)

En **Revisión clínica de casos**, la administración ve dos pestañas: **Revisar casos** y **Resumen de revisiones
clínicas**. Esta última, con el panel **Avance de la revisión clínica**, junta las respuestas de todos los expertos:

* **Datos raros que eran errores, por tipo de alerta:** **Alerta**, **Resp.** (respuestas) y **Error** (qué
  porcentaje de lo marcado con esa alerta los expertos consideraron error). Con esta precisión el equipo técnico ajusta el siguiente
  entrenamiento.
* **Niños que preocuparon:** columnas **Grupo**, **Resp.** y **Preocupan**: para **Riesgo alto** y **Resto**, cuántas
  respuestas hay y qué porcentaje preocupó. Si el modelo ordena bien, el riesgo alto debería preocupar más que el resto.

No comparta estos resultados con los expertos mientras la revisión siga abierta.

---

## Glosario de indicadores y columnas

Las pantallas del equipo clínico usan palabras de consulta. El término técnico de cada una aparece al pasar el mouse y
se usa en las pantallas de Datos y modelos. Las palabras salen de un solo lugar (`plataforma/web/src/lib/lenguaje.ts`), así que se
ajustan ahí cuando los médicos de la Fundación las revisen.

### Nivel de riesgo (posición de 0 a 100)

Dice dónde queda el niño frente a los demás niños del programa para un desenlace. En pantalla se dice como
comparación: «9 de 10 niños tienen menos riesgo». Técnicamente es la **posición** (percentil): 90 quiere decir que su
riesgo es mayor que el de unos 90 de cada 100 niños. **90 o más** es **Riesgo alto** y **95 o más**, **Riesgo muy
alto**; los dos se destacan en coral. Es una comparación entre niños, no un umbral clínico: sirve para **ordenar**,
dice a quién mirar primero, no si el niño va a tener el desenlace.

### Riesgo estimado

La probabilidad que calcula el modelo de que ocurra el desenlace, en porcentaje. Úsela para comparar niños entre sí,
nunca como un diagnóstico.

### Lo que más pesó (motivos)

Los factores que más influyeron en el cálculo de ese niño. Explican el número, pero no prueban una causa. «Nació después
del cambio de sistema 2022» quiere decir que sus datos se registraron con el sistema nuevo.
Si un dato no se midió y su falta también sube el riesgo, no va en esta lista: sale en su propia línea, **Datos que
faltan**, para que no parezca un dato medido. Si nada subió el riesgo de forma notable, la ficha lo dice en una frase.

### Tipos de alerta (capas del modelo de anomalías)

| Capa | En pantalla | En Administración | Qué busca |
|---|---|---|---|
| 1 | **Valor fuera de lo esperado** | Valor | Un dato fuera del rango posible o esperado por sí solo |
| 2 | **No cuadra con el resto de sus datos** | Contexto | Un dato que no cuadra con los demás datos del niño |
| 3 | **Cambio raro entre controles** | Trayectoria | Un cambio raro de una visita a otra en el mismo niño |
| 4 | **Cambio en todo un grupo** | Grupo y tiempo | Cambios en todo un grupo de un trimestre a otro (**alarmas de grupo**) |

Los motivos de cada dato también se dicen en palabras de consulta: «valor muy distinto al de los demás niños», «parece
anotado en otra unidad», «la fecha no corresponde a esta visita», «cambió demasiado desde el control anterior».

### Crecimiento frente a la OMS

* **Bajo para la edad / En el rango esperado / Alto para la edad:** cómo queda la medida frente a la OMS. Detrás está
  el **puntaje z**: cuántas desviaciones estándar (DE) está la medida por encima o por debajo de la mediana de la OMS
  para la edad corregida (0 es la mediana). Bajo para la edad es por debajo de −2 DE y alto, por encima de +2. Lo
  bajo se marca en ocre.
* **Cayó desde el último control (↓):** el puntaje z bajó más de 1 DE entre visitas.
* **Improbable:** un valor que la OMS considera biológicamente improbable. Suele ser un error de registro.
* **Edad corregida (EC):** la edad ajustada por la prematurez, es decir, contada como si el niño hubiera nacido a
  término. En pantalla se abrevia «d» (días), «m» (meses) y «a» (años).

### Términos con explicación en pantalla

Estas son las definiciones que aparecen al pasar el mouse por un término subrayado (ver
[Términos con «¿qué significa?»](#términos-con-qué-significa)):

* **Qué tan bien ordena (AUC):** qué tan bien separa el modelo a los niños con y sin el problema. 1 es perfecto; 0,5
  es lanzar una moneda.
* **Curva ROC:** los casos detectados frente a las falsas alarmas; cuanto más se aleja de la diagonal, mejor ordena.
* **Curva de precisión y exhaustividad:** las alertas acertadas frente a los casos detectados.
* **Cambio frente al entrenamiento (PSI):** cuánto cambiaron los niños actuales frente a los del entrenamiento; si es
  alto, conviene revisar el modelo.
* **Percentil:** lugar del niño entre todos, de 0 a 100. Un percentil 95 significa que solo 5 de cada 100 niños tienen
  más riesgo.
* **Calibración:** qué tanto coincide el riesgo que dice el modelo con lo que ocurre de verdad. Con 20 % de riesgo,
  debería pasar en 2 de cada 10.
* **Casos detectados (sensibilidad):** de los niños que tuvieron el problema, cuántos recibieron alerta.
* **Alertas acertadas (valor predictivo positivo, VPP):** de los niños con alerta, cuántos tuvieron el problema.
* **Niños sin falsa alarma (especificidad):** de los niños que no tuvieron el problema, cuántos quedaron sin alerta.
* **Alertar al (umbral, percentil de riesgo):** qué parte de los niños, los de más riesgo, recibe alerta. Al 10 %: 1
  de cada 10.
* **Error del porcentaje de riesgo (puntaje de Brier):** error promedio del porcentaje de riesgo, de 0 a 1; cuanto más
  cerca de 0, más confiable. Se muestra con tres decimales.
* **Riesgo dicho entre riesgo real (razón esperado / observado):** el riesgo promedio que dijo el modelo dividido por el
  que ocurrió; 1 es lo ideal.
* **Error medio entre el riesgo dicho y el real (ECE):** distancia promedio entre ambos, por tramos; cerca de 0 es mejor.
* **Alertas acertadas en promedio (PR-AUC):** qué tan bien acierta el modelo cuando marca a un niño, sobre todo si el
  problema es poco frecuente.
* **Falsas por 1.000:** niños marcados en riesgo que no tenían el problema, por cada 1.000 revisados.
* **Mediana:** valor del medio: la mitad de los niños tiene menos riesgo y la otra mitad, más.
* **OMS:** Organización Mundial de la Salud; sus curvas muestran cómo crecen los niños sanos y aquí se comparan con la
  edad corregida. Se explica en «Frente a la OMS» (ficha del niño) y en el umbral de la gráfica de crecimiento
  (Seguimiento clínico).
* **−2 (DE):** la desviación estándar (DE) dice cuánto se aleja una medida del valor medio de los niños sanos de su
  edad en la OMS; por debajo de −2 DE es bajo para la edad. Es la línea punteada «Umbral de talla baja» (o «de
  crecimiento bajo») de la gráfica de crecimiento del Seguimiento clínico. No confundir con la DE del grupo en la
  pestaña **Desviación estándar** de esa gráfica, que mide cuánto varían los niños del grupo entre sí.
* **Caja y bigotes:** dibujo de cómo se reparten los niños del grupo en una visita. En **Desviación estándar** la caja
  va del promedio menos una DE al promedio más una y los bigotes llegan a ±2 DE; en **Varianza** la caja va del primer
  cuartil (25 %) al tercero (75 %), la raya es la mediana y los bigotes llegan al valor más bajo y más alto que no son
  atípicos (a no más de 1,5 veces el alto de la caja). La **varianza** es la DE al cuadrado.
* **Rango esperado:** de −2 a +2 DE de la curva de la OMS; ahí queda la medida de unos 95 de cada 100 niños sanos de
  esa edad. Es la franja de las gráficas de crecimiento de la ficha.
* **Edad corregida:** edad contada desde la fecha en que el niño debía nacer (40 semanas de gestación), no desde el
  parto; así se compara bien a un prematuro.
* **Cron:** forma corta de indicar cuándo se repite una tarea, con cinco campos: minuto, hora, día del mes, mes y día de
  la semana.

### Otros términos

* **Corte:** la copia de la base de la Fundación en una fecha. En las pantallas clínicas se dice «Datos al …».
* **Corrida:** el proceso que pasa un corte por los modelos y produce los resultados. En las pantallas clínicas se
  dice «actualización».
* **Paquete:** los dos modelos entrenados, firmados para que nadie los altere.
* **AUC:** qué tan bien separa el modelo a los niños que tuvieron el desenlace de los que no. 0,5 es azar y 1 es
  perfecto. Aparece en **Datos y modelos** (Evaluación de modelos, Entrenar y aprobar modelos y Modelos disponibles).

---

## Privacidad

* **Códigos seudonimizados.** Los niños aparecen solo con un código. La aplicación nunca muestra nombres ni
  documentos. Para saber quién es un niño hay que consultar la base de la Fundación, con los permisos de siempre.
* **Correos sin datos clínicos.** Los avisos llevan solo el código, el desenlace, «más riesgo que N de cada 10 niños»
  y un enlace.
* **Sin texto libre en la revisión ciega**, porque podría traer nombres.
* **No escriba datos que identifiquen** (nombres, documentos, direcciones, teléfonos) en los comentarios, en los
  motivos ni en **Estimar riesgo › Estimación individual**.
* **Los datos reales no salen del equipo de la Fundación.** La versión de demostración usa solo niños simulados.
* **Los conteos pequeños se dicen.** Una cifra de 1 a 4 niños se muestra con su número; las pantallas solo exigen un mínimo de
  20 niños para dar cifras de grupo, distribuciones y cuartiles. Ninguna cifra se redondea, tampoco para quien solo consulta.
* **Cuide su cuenta.** No comparta su contraseña, cierre la sesión en equipos compartidos y avise a la administración
  si cree que alguien más la conoce.
* **No saque capturas, impresiones ni exportaciones con datos de niños** fuera de los canales que autorice la Fundación (esto incluye **Imprimir ficha**).
* La aplicación registra los ingresos y las respuestas de revisión para auditoría.

---

## Preguntas frecuentes

**¿El riesgo alto quiere decir que el niño va a tener el desenlace?**
No. Quiere decir que, frente a los demás niños del corte, conviene mirarlo primero. La decisión es del equipo clínico.

**¿Por qué un niño dice «Sin riesgo calculado»?**
El riesgo de cada desenlace se calcula en la visita en que se mide ese desenlace y solo mientras la siguiente visita
no ha pasado. Si el niño ya pasó ese momento, o aún no llega a él, no tiene riesgo vigente en este corte.

**¿Qué pasa si se cae la conexión mientras uso una página?**
La parte que no cargó dice «No se pudo cargar …» (o «No se pudo calcular …» si usted pidió un cálculo), explica qué
pasó y ofrece **Reintentar**. Lo que eligió (filtros, grupo, desenlace, modelo, los datos del niño) sigue igual, y
reintentar pide exactamente lo mismo. Si Anticipación de las alertas dice que todavía no hay una corrida, no es una falla de conexión:
falta ejecutar una corrida con un paquete activo.

**¿Por qué el Seguimiento clínico o el Resumen dicen «Todavía no hay resultados»?**
No se ha ejecutado ninguna corrida con un paquete activo. La administración o el experto en datos deben activar un
paquete en **Modelos disponibles** y ejecutar una corrida en **Recalcular riesgos**.

**Respondí mal un dato. ¿Lo puedo corregir?**
Sí. Pulse la respuesta correcta. En **Mediciones por revisar**, para ver lo que ya respondió, elija **Ya revisadas**
en el filtro **Estado**.

**¿Qué respondo si no estoy seguro?**
**No lo sé** (en la Revisión clínica de casos) o **No puedo determinarlo** (en Mediciones por revisar). Una respuesta
honesta de «no sé» sirve más que una adivinada.

**¿Por qué en la Revisión clínica de casos no veo el riesgo?**
Es a propósito (revisión ciega): así se puede saber si el modelo coincide con su criterio sin influir en él.

**¿Mis respuestas las ven los demás expertos?**
No. Cada experto ve solo las suyas. La administración ve el resumen agregado de todos.

**¿Por qué no veo el Listado de niños, la Revisión clínica de casos o Estimar riesgo?**
Su perfil es Consulta o Experto en datos: ve cifras de grupo, no niños uno por uno. Si necesita esas opciones, pídale a la administración el perfil de Experto clínico.

**¿Por qué no veo Mediciones por revisar, la Guía de variables y unidades, la Configuración o los entrenamientos?**
Son de la sección **Datos y modelos**: la ven los perfiles Experto en datos y Administración (D77). Si los necesita, pídale a la administración el perfil de Experto en datos.

**Soy experto clínico y ya no veo «Datos y modelos».**
Desde el cambio de perfiles (D77) esa sección es del Experto en datos. Usted conserva lo clínico: Seguimiento clínico, Comparar grupos de niños, Listado de niños, Revisión clínica de casos y Estimar riesgo. El Resumen de riesgos y calidad de datos y la Evaluación de modelos también pasaron a Datos y modelos.

**Me apareció una franja que dice «Su sesión está por vencer».**
No pierde nada. Termine o guarde lo que está haciendo y pulse **Ingresar de nuevo**; al ingresar vuelve a la misma
pantalla.

**Escribí un motivo en la Revisión clínica de casos y cambié de niño. ¿Se perdió?**
No. Queda como borrador en esa pestaña del navegador hasta que responda o la cierre.

**Se fue el menú y solo veo íconos.**
Plegó el menú. Pulse **Desplegar menú**, arriba del menú; la aplicación recuerda su elección en ese navegador.

**Cambié el orden de las columnas en el Listado de niños y en otro computador no aparece.**
El orden se guarda solo en el navegador donde lo cambió. **Columnas → Restablecer** vuelve al orden original.

**¿Cada cuánto se actualizan los datos?**
Cada vez que hay una corrida nueva, normalmente cuando llega un corte nuevo de la base. Debajo del título del
Seguimiento clínico aparece la fecha de los datos, y debajo del título del Resumen de riesgos y calidad de datos, la
fecha del corte y la de la corrida.

**No me llegan los correos de aviso.**
Revise la carpeta de correo no deseado. Si no está ahí, la administración debe confirmar en **Notificaciones › Reglas y
envíos de alertas por correo** que la notificación está **Activa**, que incluye la alerta, que su correo está en sus
destinatarios y que la corrida no fue **En silencio**, y en **Configuración del correo saliente** que el servidor está
**Configurado**. En el **Historial de correos enviados** se ve si el aviso llegó a todos los correos (**Enviado**), falló en alguno (**Con errores**, con
el correo y el motivo) o en todos (**Error**).

**El enlace de un correo no abre la ficha del niño.**
Puede que ese niño ya no esté en el corte de la última corrida, o que su sesión haya vencido. Ingrese de nuevo y
búsquelo en el **Listado de niños**. Solo los perfiles Experto clínico y Administración abren la ficha de un niño.
