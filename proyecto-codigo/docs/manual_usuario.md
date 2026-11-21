# Manual de uso · Observatorio Canguro

Guía para quienes usan la aplicación desde el navegador: administración, expertos clínicos y personas de consulta.
No hace falta saber de programación. Los nombres en **negrita** son los mismos que aparecen en la pantalla.

> **Apoyo a la decisión, no diagnóstico.** El observatorio ordena a los niños por riesgo y señala datos que conviene
> revisar. La decisión clínica siempre es del equipo de la Fundación. Esta frase aparece al pie de cada pantalla.

**Contenido:** [Antes de empezar](#antes-de-empezar) · [Ingresar](#cómo-ingresar) · [La pantalla](#cómo-está-organizada-la-pantalla) ·
[Consulta](#perfil-consulta) · [Experto clínico](#perfil-experto-clínico) · [Administración](#perfil-administración) ·
[Glosario](#glosario-de-indicadores-y-columnas) · [Privacidad](#privacidad) · [Preguntas frecuentes](#preguntas-frecuentes)

---

## Antes de empezar

### Qué hace el observatorio

Trabaja con los datos del Programa Madre Canguro y usa dos modelos:

* **Anomalías.** Busca datos raros en la historia de cada niño (un peso que no cuadra con su edad, una talla que
  baja de una visita a otra, etc.). Esos datos forman la lista de **Calidad de datos**, que responde la administración.
* **Alertas clínicas.** Calcula el riesgo de desenlaces que se pueden prevenir, ordena a los niños de mayor a menor
  riesgo y dice qué fue lo que más pesó en cada caso. También compara el crecimiento con el estándar de la OMS.

Los resultados se actualizan cada vez que la administración ejecuta una **corrida** (normalmente una vez por corte de
la base de la Fundación).

### Los tres perfiles

| Perfil (como aparece en pantalla) | Qué puede hacer |
|---|---|
| **Consulta** | Ver cifras de grupo: **Vista clínica**, **Comparar grupos**, **Explorar**, **Modelos** y el **Resumen**. No ve niños uno por uno |
| **Experto clínico** | Todo lo de Consulta, más la lista de **Niños** y la historia de cada niño, **Revisión de riesgos**, **Predicción**, **Mis modelos** y **Diccionario** |
| **Administración** | Todo lo anterior, más **Calidad de datos**, **Configuración**, **Modelos y corridas** y **Usuarios** |

Si una opción del menú no aparece, su perfil no la incluye. Pida el cambio a la administración.

### Demostración con niños simulados

Si arriba de la pantalla ve el aviso «Demostración con niños simulados. Ningún dato corresponde a un niño real.»,
está en la versión de demostración. Todo funciona igual, pero los niños son inventados.

---

## Cómo ingresar

1. Abra en el navegador la dirección que le dio la administración (en el equipo de la Fundación suele ser
   `http://localhost:8080` o una dirección de la red interna).
2. En **Ingresar**, escriba su **Correo** y su **Contraseña**. El ícono del ojo junto a la contraseña la muestra u
   oculta.
3. Pulse **Ingresar**.

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

**¿Olvidó la contraseña?** La aplicación no tiene un enlace para recuperarla. La administración le pone una nueva
(ver [Usuarios](#usuarios)).

---

## Cómo está organizada la pantalla

* **Menú lateral** (en el teléfono se abre con el botón de las tres rayas, arriba a la derecha) con tres secciones:
  * **Seguimiento:** **Tablero**, **Explorar**, **Niños** (solo Experto clínico y Administración) y **Analítica**.
  * **Revisión clínica:** **Revisión de riesgos**, **Predicción**, **Mis modelos** y **Diccionario**.
  * **Administración:** **Calidad de datos**, **Configuración**, **Modelos y corridas** y **Usuarios**.
* **Grupos que se abren y se cierran.** **Analítica**, **Configuración** y **Modelos y corridas** son grupos: el nombre
  lleva a su primera pantalla y la flecha de al lado muestra u oculta las demás (**General**, **Programación** y
  **Notificaciones** dentro de Configuración; **Entrenamientos**, **Modelos** y **Corridas** dentro de Modelos y
  corridas). El grupo en que está parado empieza abierto, pero puede cerrarlo con la flecha cuando quiera; al
  cambiar de pantalla vuelve a abrirse solo si la nueva pantalla es parte del grupo.
* **Buscar en el menú.** El campo de arriba filtra el propio menú mientras escribe: se ocultan las opciones que no
  coinciden y los grupos con coincidencias se abren mostrando solo esas (si coincide el nombre del grupo, se ven todas
  sus opciones). No distingue tildes ni mayúsculas. **Enter** va a la primera coincidencia; **Esc** o la **×** devuelven
  el menú completo. Se enfoca con **/** o **Ctrl+K** (**⌘K** en Mac). En el teléfono está dentro del menú. Con el menú
  plegado, la lupa lo despliega.
* **Plegar el menú (computador).** El botón de arriba del menú (**Plegar menú** / **Desplegar menú**) lo reduce a una
  tira de íconos, para dar más espacio al contenido; al pasar el mouse sobre un ícono se ve su nombre. Vuelva a pulsarlo
  para dejarlo completo. La aplicación recuerda su elección en ese navegador.
* **Contenido** en el centro. Al cambiar de pantalla, el teclado queda al inicio del contenido.
* **Pie de página:** «Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo
  clínico.»

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

Estas pantallas las ven todos los perfiles, salvo **Niños**, la historia de un niño y su perfil, que son de
Experto clínico y Administración: el perfil Consulta ve cifras de grupo, nunca un niño uno por uno. En el Tablero ve
las mismas cifras, sin el enlace a la lista de niños.

### Tablero

Es la pantalla de inicio. Debajo del título dice de qué fecha son los datos («Datos al …») y cuándo se actualizaron.
Administración ve además el paquete de modelos y el número de la corrida.

Si aparece «Todavía no hay resultados», la administración aún no ha hecho la primera actualización.

**Cifras de la franja superior:**

| Cifra | Qué significa |
|---|---|
| **niños con datos** | Niños con datos en la base en esa fecha |
| **datos leídos** | Total de mediciones revisadas por el modelo de anomalías |
| **datos por revisar · N por mil** | Datos que el modelo encontró raros y cuántos son por cada mil datos leídos. Para la administración es un enlace a **Calidad de datos** |
| **datos ya respondidos** | Datos por revisar que ya tienen respuesta de la administración |
| **niños con algún riesgo alto** | Niños distintos con al menos un desenlace en riesgo alto (posición 90 o más: entre el 10 % de niños con más riesgo para ese desenlace). Un niño con riesgo alto en tres desenlaces cuenta una vez; al pasar el mouse se ve el total de riesgos altos. Para Experto clínico y Administración lleva a la lista de **Niños** ya filtrada, que muestra la misma cifra |
| **alarmas de grupo** | Cambios bruscos en todo un grupo de niños de un trimestre a otro (ver abajo) |

**Paneles:**

* **Datos por revisar, por tipo de alerta.** Cuántos datos tiene cada tipo de alerta: **Valor fuera de lo esperado**,
  **No cuadra con el resto de sus datos**, **Cambio raro entre controles** y **Cambio en todo un grupo** (ver el
  [glosario](#tipos-de-alerta-capas-del-modelo-de-anomalías)). Un mismo dato puede tener varias alertas.
* **Alarmas de grupo.** Panel propio, con desplazamiento: cambios de un trimestre a otro en todo un grupo, que casi
  siempre vienen de un cambio en la forma de medir y no de los niños. Las más recientes van primero. Arriba dice
  cuántas hay en total y, si son más de 100, que se muestran las 100 más recientes.
* **Riesgo por desenlace.** Una fila por desenlace, con el momento en que se calcula («se calcula a los …»):
  **Niños** (cuántos tienen el riesgo calculado), **Alto** (cuántos tienen riesgo alto; para Experto clínico y Administración, al pulsar el número se abre
  la lista filtrada) y **Promedio** (riesgo promedio).
  Si el panel dice que ningún niño tiene riesgo calculado, no es un error: el riesgo solo se calcula en la visita en
  que se mide cada desenlace, cuando la siguiente visita aún no ha pasado.
* **Crecimiento frente a la OMS.** Una fila por visita y una columna por medida (**Peso para la edad**, **Talla para
  la edad**, **Perímetro cefálico**). En cada celda: el porcentaje de niños con la medida **baja para la edad** (en
  color ocre si es 10 % o más) y, con la flecha ↓, el porcentaje que **cayó desde el control anterior**. «EC» quiere
  decir edad corregida. Al pasar el cursor sobre una celda se ve también cuántos datos hay y el puntaje z mediano.

### Niños (Experto y Administración)

La lista de todos los niños con datos. Por defecto los primeros son los de riesgo más alto.

**Filtros (arriba):**

* **Buscar por código:** escriba el código del niño, o parte de él.
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
| **Niño** | Código seudonimizado. Al pulsarlo se abre su historia |
| **Edad gestacional** | Semanas de gestación al nacer |
| **Riesgo más alto** | El desenlace en que el niño tiene más riesgo y, si hay más, «y N más». «Sin riesgo calculado» si no hay ninguno |
| **Nivel de riesgo** | **Muy alto** o **Alto** (en coral), o «Más que N de 10»: de cada 10 niños, cuántos tienen menos riesgo. Al pasar el mouse se ve la posición técnica |
| **Datos por revisar** | Cuántos datos raros tiene el niño |
| **Crecimiento** | «Bajo para la edad ×N»: cuántas medidas quedaron bajas para la edad. «Cayó ×N»: cuántas veces cayó desde el control anterior |

### La historia de un niño (línea temporal, Experto y Administración)

Se abre al pulsar el código de un niño en **Niños**, en **Datos por revisar** o en un correo de aviso. **Todos los
niños** vuelve a la lista.

* **Encabezado:** «Niño …», semanas de gestación al nacer, año de nacimiento, grupo y fecha de los datos. A la derecha,
  el botón **Imprimir ficha** abre la impresión del navegador (o permite guardar en PDF). La hoja sale solo con el
  contenido del niño, en blanco y negro, sin menú ni botones y con la frase «Apoyo a la decisión, no diagnóstico» al pie.
  Imprima solo donde la Fundación lo autorice (ver [Privacidad](#privacidad)).
* **Tarjetas de riesgo** (si tiene riesgo calculado), una por desenlace:
  * Grande, **«N de 10»**: de cada 10 niños, cuántos tienen menos riesgo. Si es alto, borde coral y la marca
    **Riesgo alto** o **Riesgo muy alto**. Al pasar el mouse se ve la posición técnica.
  * «Calculado con lo medido hasta …»: la visita cuyos datos se usaron.
  * **Riesgo estimado:** la probabilidad que calcula el modelo, en porcentaje.
  * **Lo que más pesó:** los motivos que más influyeron en el riesgo de ese niño (por ejemplo, «Días en UCI: 20» o
    «Nació después del cambio de sistema 2022»).
* **Crecimiento frente a la OMS:** gráfica de cada medida frente a la OMS según la edad corregida. La línea en 0 es lo
  esperado para la edad; la franja ocre es la zona **baja para la edad**. Al pasar el mouse sobre un punto se ve cómo
  quedó («Bajo para la edad», «En el rango esperado») y su puntaje z. Los puntos que la OMS considera improbables no
  se dibujan.
* **Visitas:** las visitas en orden, como estaciones de un recorrido. Bajo cada una está la edad corregida (o la fecha)
  y, si hay, las marcas **N por revisar** y **riesgo**. Un círculo coral indica que hay algo que mirar. Al pulsar una
  visita se ven sus detalles:
  * **…: lo que se midió:** tabla con **Dato**, **Valor** y **Revisión**. Las filas en coral son datos marcados como
    raros, con el motivo y el rango esperado («esperado A a B»).
  * **Frente a la OMS:** cada medida de esa visita: **Bajo para la edad** (en color), **En el rango esperado** o
    **Alto para la edad**. Al pasar el mouse se ve el puntaje z.
  * **Por qué se marcó:** cada dato raro con sus tipos de alerta.

### Explorar

Está en **Seguimiento**, justo debajo de **Tablero**, y lo ven todos los perfiles. Muestra las mismas cifras del
Tablero, pero para el grupo de niños que usted elija; el Tablero no cambia y sigue mostrando a todos.

* **Filtros (panel de la izquierda):** casillas por variable (por ejemplo sexo o categoría al nacer), con cuántos niños
  tendría cada opción. Lo elegido aparece como fichas que se quitan con la **x**. Con **+ Agregar variable** suma otras.
  Si una variable se mide muchas veces, elija si cuenta la primera, la última, en alguna visita o en una visita concreta.
  La **edad gestacional (categoría)** es una lista (extremo, muy prematuro, moderado o tardío, a término): cada casilla
  es su propio tramo. Las secciones **Tiempo** y **Muestreo** acotan por fecha y fijan un tope por grupo; todo viaja en
  la dirección, así que un enlace copiado abre el mismo filtro.
* **Guardar este filtro:** queda en la lista de filtros guardados para volver a usarlo (por ejemplo en Predicción).
* **Qué se ve:** niños en el grupo, datos leídos, niños con algún riesgo alto, crecimiento bajo frente a la OMS, y
  tres gráficas: riesgo del grupo, crecimiento del grupo y quiénes son los niños.
* **Privacidad:** con menos de 20 niños no se muestran cifras; basta quitar algún filtro. Todos los perfiles ven las
  mismas cifras, exactas: nada se redondea ni se aproxima. Una opción con 1 a 4 niños dice su número.
* **Cómo leer los símbolos:** una opción sin niños se ve **0**; una opción con 1 a 4 niños dice cuántos son; **—** es un grupo
  de menos de 20 niños. Si ningún niño cumple, aparece «Ningún niño cumple estos filtros» con el botón para quitarlos.
  El muestreo no cambia las cifras de Explorar: solo dice con cuántos niños se entrenaría.

### Analítica de los modelos

Responde: ¿qué tan bien ordena el modelo a los niños, es fiable su riesgo y funciona igual para todos? Tiene once
submódulos, como fichas arriba (en el teléfono se deslizan): **Resumen**, **Rendimiento**, **Anticipación**,
**Calibración**, **Qué datos pesan**, **Población**, **Equidad**, **Estabilidad**, **Trayectorias**, **Perfiles** y
**Comparar**.

* **Contexto de análisis:** arriba se elige el **Entrenamiento**, el **Desenlace** y se ve el modelo, su versión y la
  fecha de los datos. Queda en la dirección, así que un enlace copiado abre la misma vista. En el teléfono se pliega.
  Además, la aplicación recuerda el último **desenlace** y la última **visita** que eligió: al volver a entrar a
  Analítica en la misma pestaña del navegador no tiene que elegirlos de nuevo. Si abre un enlace con otros valores, mandan
  los del enlace.
* **Guía de lectura:** cada submódulo explica en pocas líneas cómo leerlo. Su interruptor **Modo técnico** agrega los
  términos y cifras de detalle (se recuerda en el navegador).
* **En prueba:** un desenlace marcado así se ve, pero aún no es oficial ni genera correos.
* **Sin analítica / «Este análisis estará disponible pronto»:** si el entrenamiento es anterior y no guardó los
  resultados de analítica, aparece **Sin analítica** y la opción de reentrenar (no se recalcula en silencio). Una ficha con
  «pronto» o un análisis **pendiente** todavía no se calcula para ese modelo (por ejemplo Anticipación, si no hay
  desenlaces entrenados desde varias visitas).
* Un grupo o una celda con 1 a 4 niños dice cuántos son. **sin cifra** es lo que no se puede calcular: un desvío, unos cuartiles o un AUC
  piden 20 niños o más, y el intervalo del AUC pide además 5 niños con el desenlace y 5 sin él (es un límite estadístico, no de
  privacidad).
* **Perfiles** son provisionales: edad gestacional y clasificación de Lubchenco; ningún experto los ha aprobado todavía.
* **Anticipación:** elija una familia de desenlaces y vea cuántos casos se avisaron antes, con qué ventaja, la primera
  visita con alerta y el costo de avisar antes. Experto y administración ven además tres niños visita por visita. Solo
  funciona si el entrenamiento se hizo con las familias «En prueba» activadas.
* **Calibración y Población:** Calibración suma el riesgo de los niños con y sin el desenlace; Población, la muestra frente
  a todos los niños y sus cuantiles. Un entrenamiento anterior no trae estos dos paneles y lo explica.
* **Qué datos pesan (Interpretabilidad):** importancia de cada dato, cómo cambia el riesgo al variar un dato, los motivos más
  frecuentes de alerta y cómo se combinan dos datos. Es **asociación, no causa**. Un entrenamiento anterior muestra solo la
  importancia general y pide reentrenar.
* **Comparar** pone dos entrenamientos (A y B) lado a lado, con intervalos del 95 % (aproximados) y la pestaña **Grupos de
  niños** para comparar dos grupos. Solo la administración ve **Aprobar B**: pide confirmación, usa las anomalías en
  producción y queda en la auditoría.

### Descripciones, PNG y CSV

Cada gráfica y tabla de datos lleva bajo el título una frase fija que dice qué muestra y cómo leerla (también en el
teléfono). Sus botones permiten llevarse el dato: **PNG** de la gráfica (con título, descripción, muestra y fecha) y
**CSV** de las tablas de agregados. Esto vale también para las gráficas del Tablero.

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

Además de lo de Consulta, el experto clínico tiene la sección **Revisión clínica**. Sus respuestas son las que dicen
si los modelos sirven: tómese el tiempo necesario y use **No sé** cuando no esté seguro.

### Calidad de datos (Administración, solo administración)

Se abre en **Administración › Calidad de datos**; los perfiles Consulta y Experto clínico no ven esta opción. La
dirección antigua `/revision/datos` lleva a esta página.

Arriba hay cuatro cifras (**datos por revisar**, **alertas por cada mil datos**, **de los respondidos, confirmados
como error** y **alarmas de grupo**) y tres paneles:

* **Alertas por tipo.** Cuántos datos raros encontró cada revisión.
* **Aciertos frente a la revisión.** Cuántas alertas confirmó el equipo al revisar las primeras: de las 50, 100, 200…
  primeras alertas de la cola que ya tienen respuesta, qué porcentaje se marcó como error.
* **Dónde se concentran.** Sede y dato con más alertas, de más a menos. Si el corte no trae sedes, solo se muestra por
  dato. Cada uno sale con su cifra, aunque tenga una sola alerta.

Debajo está la lista de **Datos por revisar**: datos que el modelo de anomalías encontró raros. Para cada uno, la
pregunta es si cree que es un **error de registro**.

* **Filtros (arriba a la derecha):** **Sin responder** (por defecto), **Ya respondidos** o **Todos**. Y **Todas las
  alertas**, o un solo tipo: **Valor fuera de lo esperado**, **No cuadra con el resto de sus datos** o **Cambio raro
  entre controles**.
* Los datos van ordenados: primero los que tienen más alertas y más fuertes. Hay 12 por página.

Cada tarjeta muestra:

* **Niño …** (enlace a su historia), la visita y la fecha.
* El dato y su valor tal como está en la base (en coral). Un dato mal digitado se ve tal cual, por ejemplo un peso en
  kilos donde van gramos.
* «Para este niño se esperaba entre A y B (lo más probable: C).»: el rango que calculó el modelo para ese niño.
* El motivo y las capas que lo marcaron.
* **¿Es un error de registro?** con tres botones: **Sí**, **No**, **No sé**. La respuesta se guarda al pulsar.
* **Comentario (opcional):** escríbalo **antes** de pulsar la respuesta, porque se guarda junto con ella. Si lo
  escribe después, vuelva a pulsar la misma respuesta.

Debajo aparece «Respuesta guardada.» y después «Puede cambiar su respuesta.». Cada administrador responde por su cuenta
(«Sin responder» y «Ya respondidos» se refieren a sus propias respuestas) y puede cambiar su respuesta las veces que
quiera.

**Para qué sirven sus respuestas.** Con ellas se mide qué parte de lo que marca cada capa es de verdad un error. Esa
precisión ajusta qué tan exigente será el modelo en el siguiente entrenamiento.

### Revisión de riesgos

Una revisión **ciega**: una muestra fija de niños (hasta 20 de riesgo alto y 20 del resto, mezclados en un orden fijo
para esa corrida). **A propósito no se muestran ni el riesgo ni la posición.**

Se ve **un niño por pantalla**, con **Anterior** y **Siguiente**; al responder pasa al siguiente sin responder.
Cada caso muestra el número de caso, el código del niño, la visita y su fecha, el **desenlace** a evaluar y un resumen
con lo que vería en consulta: edad gestacional, datos al nacer y lo medido en esa visita. No incluye texto libre,
porque podría traer nombres.

* **¿Le preocupa este niño?** **Sí**, **No** o **No sé**, según su criterio clínico para ese desenlace.
* **Motivo (opcional):** escríbalo antes de responder, porque se guarda junto con la respuesta. Mientras escribe, el
  texto queda como **borrador** en esta pestaña del navegador: si pasa a otro niño con **Anterior** o **Siguiente**, o
  recarga la página, lo encuentra al volver. El borrador se borra al responder o al cerrar la pestaña.
* **Pantallas anchas:** en un computador el caso se reparte en dos columnas. A la izquierda, el niño, la visita, el
  resumen y el crecimiento; a la derecha, la pregunta, los botones y el motivo. Así no hay que bajar para responder. En
  el teléfono todo va en una sola columna.
* Arriba a la derecha, la barra **Respondidos** muestra cuántos lleva de cuántos.

**Por qué es ciega.** Si el modelo ordena bien, los niños de riesgo alto deberían preocupar más que el resto. Para
saberlo sin influir en usted, solo la administración ve el resumen mientras dura la revisión.

### Diccionario

El diccionario de variables dice qué es cada variable de la base, en qué visita se mide y si el sistema la usa. Se
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
* El número junto a **Diccionario** en el menú, y el aviso del **Tablero**, dicen cuántas variables faltan por revisar.
* **Exportar a Excel** (arriba) baja el que está en uso. **Importar desde Excel** sube uno editado fuera: antes de
  confirmar verá qué cambia; si el archivo tiene un error, dice en qué hoja y fila; si es igual al que está en uso, no
  se guarda nada.
* **Historial de versiones:** cada versión con su estado, quién la subió, cuándo y su nota. Puede **Descargar**
  cualquiera o **Volver a esta**. Ninguna versión se borra.

### Predicción (Experto y Administración)

**Predicción** es una sola entrada del menú, con dos pestañas arriba: **Un niño** (la que abre por defecto) y **Un
grupo de niños**. La pestaña elegida queda en la dirección (`/prediccion` y `/prediccion?vista=grupo`), así que se puede
copiar el enlace y el botón Atrás del navegador la respeta. Con el teclado, las flechas izquierda y derecha pasan de una
pestaña a otra. La dirección antigua `/inferencia` lleva a la pestaña **Un niño**.

#### Predicción · Un niño

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
3. Pulse **Calcular el riesgo**. Si falta algo (la fecha de nacimiento, la fecha de una visita con datos, un número mal
   escrito), aparece arriba del botón qué falta.

Lo que deje vacío se toma como dato faltante: el modelo calcula igual, con menos información. **Cargar un niño de
ejemplo** llena el formulario con un niño simulado para ver cómo funciona; **Limpiar** lo vacía.

El resultado aparece a la derecha (debajo en el celular), con las mismas palabras que la historia de un niño:

* **Riesgo:** por desenlace, el riesgo estimado, «N de 10 niños tienen menos riesgo», la marca **Riesgo alto** o
  **Riesgo muy alto** si corresponde, y **Lo que más pesó**. Si dice que no se alcanza a calcular ningún riesgo, llene
  una visita en la que diga «Aquí se calcula».
* **Datos que parecen raros:** el dato, su valor, lo esperado, por qué se marcó y el tipo de alerta.
* **Crecimiento frente a la OMS:** cada medida con su edad corregida y cómo queda («Bajo para la edad», «En el rango
  esperado»…), y las marcas **Cayó desde el último control** o **Dato improbable: revisar**.

**Modo avanzado (solo administración):** el botón **Modo avanzado (JSON)** muestra el cuadro de antes, para calcular
hasta 50 niños a la vez o casos que el formulario no cubre (por ejemplo, episodios de hospitalización), con
`sujetos`, `mediciones` y `episodios` y los nombres de variable del diccionario.

Si dice «No hay un paquete de modelos activo», la administración debe activar uno en **Modelos y corridas › Modelos** (quien es de
administración ve el enlace; los demás ven «Pídale a la administración que active un modelo.»). Si el cálculo falla
con los datos escritos, dice «No se pudo calcular el riesgo con estos datos. Revise los valores que escribió e intente
de nuevo.»; el detalle técnico queda en el registro de la API.

Recuerde: si escribe datos de un niño real, no ponga su nombre ni su documento; el formulario no los pide.

#### Predicción · Un grupo de niños

Calcula el riesgo con un modelo ya entrenado, sin guardar nada por niño.

* **Modelo:** cualquier versión del registro. Un modelo de un corte anterior se puede usar, con un aviso en coral.
* **Muestra o todo el universo:** use una muestra guardada (hecha en Explorar) o todo el universo de niños. Los niños con
  que se entrenó el modelo se dejan fuera, y la pantalla lo avisa.
* **Resultado:** cómo se reparte el riesgo, riesgo por desenlace, el **riesgo alto en cada visita** y los niños con más
  riesgo (los de riesgo alto o muy alto llevan etiqueta). El cálculo corre en segundo plano con barra de avance; la tabla
  por niño se conserva **una hora** y se ve de 200 en 200 (después hay que recalcular).
* **Niño nuevo:** elija una visita y un perfil, parta de un niño de ejemplo con valores típicos, cambie solo lo que sea
  distinto y calcule. Con menos de 20 niños en el perfil no se da un ejemplo. **Guardar este niño** lo deja como niño o
  como plantilla (las plantillas las ven todos los expertos) y se borra desde la tabla de guardados.
* **Niños del entrenamiento:** «Dejar fuera a los niños del entrenamiento» funciona con los modelos nuevos; en un modelo
  anterior dice «no verificable» hasta reentrenar.
* **Exportar CSV por niño:** solo lo ve y lo puede usar la administración; queda registrado quién lo descargó. Con menos de
  20 niños no se exporta.

### Mis modelos (Experto y Administración)

Permite entrenar un modelo propio con los hiperparámetros vigentes (solo administración los cambia).

* **Sus límites:** por defecto 3 modelos personales guardados y 1 entrenamiento en cola por persona. La administración no
  tiene límite y puede cambiar estos valores en el panel **Límites de Mis modelos**.
* **Entrenar modelo nuevo:** nombre, descripción, datos y **Muestra de niños** (o **Armar una muestra** con filtros,
  fecha y tope por grupo). Con menos de 200 niños el aviso dice que el modelo puede salir poco confiable. El
  entrenamiento entra a la **cola**, que muestra posición, dueño y tiempo estimado; puede cancelar el suyo.
* **Banco de modelos:** lo ven todos los expertos, con dueño, muestra, corte y AUC. La etiqueta **Personal** significa que
  no cambia el tablero ni envía correos; **Oficial** solo lo da la administración. **Corte anterior** marca un modelo de
  un corte de datos previo: sigue usable en Predicción con aviso. Los modelos personales descartados o sin uso se borran a los
  90 días (con un aviso «Se borra en N días» desde 14 días antes); nunca se borran los aprobados ni los que están en uso.
  Puede filtrar por **Mostrar** y **Dueño**, y ver el AUC y **Otras medidas**. Una versión personal no se puede aprobar.

---

## Perfil Administración

Además de todo lo anterior, la administración ve la sección **Administración** y el resumen de **Revisión de
riesgos**.

### Usuarios

* **Tabla de usuarios:** **Nombre** (con el correo), **Perfil**, **Último ingreso** y **Estado** (**Activo** o
  **Inactivo**).
* **Cambiar el perfil:** elija otro en la lista **Perfil** de esa fila. Se guarda de inmediato. No puede cambiar su
  propio perfil.
* **Contraseña:** abre un campo **Nueva contraseña para …**. Escriba al menos 10 caracteres y pulse **Guardar
  contraseña**. Las sesiones abiertas de esa persona se cierran.
* **Desactivar / Activar:** un usuario inactivo no puede ingresar. No puede desactivarse a sí mismo.
* **Nuevo usuario** (panel de la derecha): **Nombre**, **Correo**, **Perfil** (**Administración**, **Experto
  clínico** o **Consulta**) y **Contraseña inicial** (mínimo 10 caracteres). Pulse **Crear usuario**. Entregue la
  contraseña por un canal seguro (no por el mismo correo).

Buenas prácticas: dé a cada persona el perfil mínimo que necesite. Desactive (no comparta) las cuentas de quienes ya
no participan.

### Configuración inicial

Lo que la solución necesita para correr sola. Arriba, **Estado de la configuración** marca cada paso como listo o
pendiente:

1. **Llave de cifrado en el servidor:** el equipo técnico define `MAIA_CIFRADO_CLAVE` en el servidor. Sin ella la
   clave de la base no se puede guardar desde la web.
2. **Conexión a la base de la entidad:** el Postgres de la Fundación de donde salen los datos.
3. **Horario de las ejecuciones:** al menos una programación activa (ver **Programación**).
4. **Modelos aprobados en uso:** un paquete activo (ver **Entrenamientos**).

**Base de datos de la entidad (origen):** **Servidor**, **Puerto**, **Base**, **Usuario**, **Esquema** (por defecto
`consumo`), **SSL** y **Espera al conectar**. La **Clave** se guarda cifrada y nunca se vuelve a mostrar: si ya hay
una, el campo dice «(guardada)»; déjelo vacío para conservarla. **Probar conexión** se conecta en solo lectura con lo
que está escrito (sin guardarlo) y dice cuántas tablas ve en el esquema. **Guardar** la deja lista para las
ejecuciones. Si no hay nada guardado, se usan los valores del servidor (`KMC_*`).

**Hiperparámetros:** uno por modelo (**Anomalías** y **Alertas clínicas**). Cada campo muestra en gris el valor del
núcleo y entre paréntesis sus límites. Escriba solo lo que quiere cambiar y pulse **Guardar**; aplica al **próximo**
entrenamiento. **Volver a los del núcleo** borra los ajustes. Cada cambio queda en la auditoría y MLflow registra los
valores usados.

### Programación

Cada ejecución **extrae** la base de la entidad, **revisa** los datos y **calcula** los riesgos siempre con los
modelos **aprobados** en **Entrenamientos**. Las ejecuciones programadas además **entrenan** los dos modelos y los
**registran en MLflow** como *candidatos*, que solo se usan cuando alguien los aprueba. **Corrida ahora** no entrena:
calcula con los aprobados. Si todavía no hay modelos aprobados, la corrida no se hace y el mensaje dice que primero hay
que entrenar y aprobar.

* **Nueva programación** (derecha): **Nombre**, **Datos** (la base de la Fundación o los datos simulados),
  **Frecuencia** (cada semestre, trimestre, mes, semana o día, a las 02:00) u **Otra** con una expresión cron
  (`minuto hora día-del-mes mes día-de-la-semana`). Debajo se lee la frecuencia en español y las próximas fechas.
* **Filtros de la extracción** (solo la base real, opcionales): **Nacidos desde/hasta (año)** y **Solo niños con
  visitas en los últimos (meses)** (conservan su historia completa).
* **Solo si la base cambió:** si no hay datos nuevos desde el último corte, no entrena. **En silencio:** guarda los
  riesgos sin mostrarlos ni enviar correos. **Activa:** quítela para pausar sin borrar.
* **Horarios:** cada programación con su frecuencia, la **Próxima** y la **Última** ejecución. **Ejecutar ahora** la
  pone en cola sin mover su horario; **Editar** y **Borrar**.
* **Ejecuciones:** la cola. **Corrida ahora** pide una corrida inmediata. Cada fila dice si está **En cola**, **En
  curso**, **Terminada** o **Con error**, quién la pidió (programada o a mano), el mensaje, las versiones registradas
  y **Ver detalle técnico** (las últimas líneas del proceso, sin datos de niños). Si falla, el mensaje dice qué pasó en
  palabras claras (por ejemplo, que la base rechazó la clave o que MinIO no dio permiso) y el texto original queda en
  **Ver detalle técnico**. Se actualiza sola mientras hay algo en curso.

Las ejecuciones las hace el **programador**, un servicio del servidor con GPU: toma lo que está en cola en menos de un
minuto y hace una a la vez.

### Entrenamientos

Lo que MLflow registró de cada entrenamiento, para elegir qué modelos usa la solución. Arriba se elige **Datos** (base
de la Fundación o simulados) y, si está configurado, **Abrir MLflow**.

* **Entrenar ahora** (arriba): manda a entrenar de inmediato. Elija los modelos (**Anomalías** y/o **Alertas
  clínicas**), si se traen **datos nuevos de la fuente** (la base de la entidad o una cohorte simulada nueva; si no,
  se usa el último corte) y escriba los **hiperparámetros** de este entrenamiento (parten del ajuste guardado o del
  valor del núcleo). **Guardar también estos valores** los deja para las ejecuciones programadas. Pulse **Entrenar
  ahora**. El recuadro de estado muestra el avance paso a paso (**En cola**, **Trayendo los datos de la fuente**,
  **Entrenando anomalías**, **Entrenando alertas clínicas**, **Entrenado y registrado en MLflow**) y se actualiza solo
  cada pocos segundos. Mientras corre, el menú muestra **Entrenando…** junto a **Entrenamientos**. Al terminar dice
  **Modelo entrenado** con las versiones nuevas (como *candidato*) y la tabla las incluye; si falla, marca el paso
  donde falló y **Ver detalle técnico** muestra el texto original. Solo hay un entrenamiento a la vez.
* Una tabla por modelo con **Fecha**, **Corte**, **Versión** (con el alias *candidato* o *produccion*, y **ajustado**
  si se entrenó con hiperparámetros de administración), los hiperparámetros principales (**rondas**, **tasa**,
  **hojas**, **min_hoja**) y las cifras de validación (**AUC medio** y **Desenlaces con modelo** en las alertas
  clínicas; **Falsas por 1.000** y **Detectados %** en anomalías).
* **Detalle:** todos los hiperparámetros, todas las métricas, los filtros de la extracción y las etiquetas del run.
* **Comparar:** marque dos o tres entrenamientos del mismo modelo; la tabla de comparación muestra (por defecto) solo
  lo que cambia entre ellos, en negrita.
* **Aprobar y activar:** elija una versión de cada modelo en la columna **Aprobar** y pulse el botón. El programador
  pasa esas versiones a *produccion*, arma y firma el paquete, y la aplicación lo activa sola en unos segundos (se ve
  en **Programación › Ejecuciones** y en **Modelos**).

### Modelos (paquetes)

Los modelos se entrenan en el equipo de entrenamiento y llegan como un **paquete firmado** (archivo `.tar.gz`). Al
aprobar en **Entrenamientos** el paquete se arma, se sube y se activa solo; aquí también se puede subir a mano.

* **Subir un paquete:** elija el archivo y pulse **Subir paquete**. Mientras dice «Verificando…», la aplicación
  comprueba la firma, cada archivo y la versión de LightGBM. Si todo está bien: «Paquete … verificado y guardado.
  Actívelo para usarlo.». En la demostración solo se aceptan paquetes entrenados con datos simulados.
* **Lista de paquetes:** cada uno con su versión, la marca **Activo** si es el que está en uso, y su fuente
  (`simulado` o la base real). Muestra **Corte de entrenamiento**, **Creado**, **Subido** y la versión de cada modelo
  (**Modelo clínico**, **Modelo de anomalías**). **AUC de validación por desenlace** despliega, por desenlace, el
  **AUC** y el **Top 10 %** (de los niños que tuvieron el desenlace, qué parte estaba en el 10 % de mayor riesgo). La
  validación técnica de los modelos solo se ve aquí y en **Entrenamientos**, no en el Tablero.
* **Activar:** pone ese paquete en uso. Las corridas y **Predicción › Un niño** usan siempre el paquete activo.

Mensajes comunes: «La firma no coincide» (el paquete se firmó con otra clave) y «El paquete se hizo con LightGBM X»
(versiones distintas). Los dos se resuelven en el equipo técnico.

### Corridas

Una corrida pasa los datos del corte vigente por los dos modelos del paquete activo y deja los resultados en el
tablero, la lista de niños y las colas de revisión.

* **Ejecutar una corrida:** pulse **Ejecutar corrida**. La casilla **En silencio** guarda los riesgos sin mostrarlos
  ni enviar correos. Se usa para comparar un modelo nuevo antes de entregárselo al equipo clínico. Si no hay paquete
  activo, verá «No hay un paquete activo. Actívelo en Modelos antes de ejecutar.».
* Mientras corre, el botón dice «Hay una corrida en curso» y la lista se actualiza sola cada pocos segundos.
* **Historial:** **N.º**, **Estado** (**En curso**, **Terminada** o **Con error**, y **En silencio** si aplica),
  **Corte** (fecha y fuente), **Paquete**, **Inició**, **Niños**, **Por revisar** y **Detalle**. El detalle muestra el
  paso actual, el mensaje de error o el tipo de corrida: **Recálculo con el corte vigente** (esta página), **Extracción y
  cálculo** (Corrida ahora o una programación de Programación), **Solo revisión de datos** o **Solo riesgos**.

La corrida con la base de la Fundación (extraer y calcular con los modelos aprobados) se programa o se pide en
**Programación**; cuando termina, aparece también en este historial.

### Notificaciones

En el correo de aviso, cada niño lleva su etiqueta de perfil (por ejemplo «Muy prematuro · Peso adecuado») y la visita; nunca valores clínicos.

Después de cada corrida que no es en silencio, se envía un correo por cada desenlace activo con los niños cuya posición
es igual o mayor que el riesgo mínimo. El correo lo leen clínicos, así que no dice «posición» sino, con la misma escala
de la pantalla, «más riesgo que 9 de cada 10 niños». Lleva solo el código del niño, el desenlace, esa comparación y
un enlace, nunca valores clínicos. Cada destinatario recibe un solo aviso por niño y por corrida.

* **Un panel por desenlace** (se crean al activar un paquete), con la marca **Activa** o **Apagada**:
  * **Enviar avisos:** enciende o apaga los correos de ese desenlace.
  * **Riesgo mínimo:** la posición de 0 a 100 desde la que se avisa. Debajo dice qué significa: con 95, «Con 95 se
    avisa del 5 % de niños con más riesgo.»
  * **Destinatarios:** un correo por línea. Para activar los avisos se necesita al menos uno.
  * **Guardar.** Aparece «Guardado.».
* **Probar el correo:** escriba un correo en **Enviar un correo de prueba a** y pulse **Enviar**. Si no llega en unos
  minutos, el equipo técnico debe revisar la configuración del servidor de correo.
* **Avisos enviados:** **Fecha**, **Destinatario**, **Niño**, **Desenlace**, **Riesgo** y **Estado** (**Enviado** o
  **Error**, con el motivo).

### Resumen de la revisión (solo administración)

En **Revisión de riesgos**, la columna **Lo que va de la revisión** junta las respuestas de todos los expertos:

* **Datos raros que eran errores, por tipo de alerta:** **Alerta**, **Resp.** (respuestas) y **Error** (qué
  porcentaje de lo marcado con esa alerta los expertos consideraron error). Con esta precisión el equipo técnico ajusta el siguiente
  entrenamiento.
* **Niños que preocuparon:** para **Riesgo alto** y **Resto**, cuántas respuestas hay y qué porcentaje
  preocupó. Si el modelo ordena bien, el riesgo alto debería preocupar más que el resto.

No comparta estos resultados con los expertos mientras la revisión siga abierta.

---

## Glosario de indicadores y columnas

Las pantallas del equipo clínico usan palabras de consulta. El término técnico de cada una aparece al pasar el mouse y
se usa en Administración. Las palabras salen de un solo lugar (`plataforma/web/src/lib/lenguaje.ts`), así que se
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

* **AUC:** qué tan bien separa el modelo a los niños con y sin el problema. 1 es perfecto; 0,5 equivale a lanzar una
  moneda.
* **Curva ROC:** compara los aciertos con las falsas alarmas; mientras más se aleja de la diagonal, mejor.
* **PSI:** cuánto cambió el grupo de niños actual frente al de entrenamiento; si es alto, conviene revisar el modelo.
* **Percentil:** lugar del niño entre todos, de 0 a 100. Un percentil 95 significa que solo 5 de cada 100 niños tienen
  más riesgo.
* **Calibración:** qué tanto coincide el riesgo que dice el modelo con lo que ocurre de verdad. Con 20 % de riesgo,
  debería pasar en 2 de cada 10.
* **Sensibilidad:** de los niños que sí tendrán el problema, qué parte detecta el modelo.
* **Especificidad:** de los niños que no tendrán el problema, qué parte descarta bien el modelo.
* **Brier:** error promedio de las probabilidades, de 0 a 1; más cerca de 0 es más confiable.
* **Precisión promedio (PR-AUC):** qué tan bien acierta el modelo cuando marca a un niño en riesgo, sobre todo si el
  problema es poco frecuente.
* **Falsas por 1.000:** niños marcados en riesgo que no tenían el problema, por cada 1.000 revisados.
* **Mediana:** valor del medio: la mitad de los niños tiene menos riesgo y la otra mitad, más.
* **Cron:** forma corta de indicar cuándo se repite una tarea, con cinco campos: minuto, hora, día del mes, mes y día de
  la semana.

### Otros términos

* **Corte:** la copia de la base de la Fundación en una fecha. En las pantallas clínicas se dice «Datos al …».
* **Corrida:** el proceso que pasa un corte por los modelos y produce los resultados. En las pantallas clínicas se
  dice «actualización».
* **Paquete:** los dos modelos entrenados, firmados para que nadie los altere.
* **AUC:** qué tan bien separa el modelo a los niños que tuvieron el desenlace de los que no. 0,5 es azar y 1 es
  perfecto. Solo aparece en Administración (Modelos y Entrenamientos).

---

## Privacidad

* **Códigos seudonimizados.** Los niños aparecen solo con un código. La aplicación nunca muestra nombres ni
  documentos. Para saber quién es un niño hay que consultar la base de la Fundación, con los permisos de siempre.
* **Correos sin datos clínicos.** Los avisos llevan solo el código, el desenlace, «más riesgo que N de cada 10 niños»
  y un enlace.
* **Sin texto libre en la revisión ciega**, porque podría traer nombres.
* **No escriba datos que identifiquen** (nombres, documentos, direcciones, teléfonos) en los comentarios, en los
  motivos ni en **Predicción › Un niño**.
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

**¿Por qué el tablero dice «Todavía no hay resultados»?**
No se ha ejecutado ninguna corrida con un paquete activo. La administración debe activar un paquete en **Modelos** y
ejecutar una corrida en **Corridas**.

**Respondí mal un dato. ¿Lo puedo corregir?**
Sí. Pulse la respuesta correcta. Para ver lo que ya respondió, elija **Ya respondidos** en el filtro.

**¿Qué respondo si no estoy seguro?**
**No sé**. Una respuesta honesta de «No sé» sirve más que una adivinada.

**¿Por qué en Revisión de riesgos no veo el riesgo?**
Es a propósito (revisión ciega): así se puede saber si el modelo coincide con su criterio sin influir en él.

**¿Mis respuestas las ven los demás expertos?**
No. Cada experto ve solo las suyas. La administración ve el resumen agregado de todos.

**¿Por qué no veo Niños, Revisión de riesgos o Predicción?**
Su perfil es Consulta: ve cifras de grupo, no niños uno por uno. Si necesita esas opciones, pídale a la administración el perfil de Experto clínico.

**¿Por qué no veo Calidad de datos?**
Es una opción de Administración y solo la ve el perfil de administración.

**Me apareció una franja que dice «Su sesión está por vencer».**
No pierde nada. Termine o guarde lo que está haciendo y pulse **Ingresar de nuevo**; al ingresar vuelve a la misma
pantalla.

**Escribí un motivo en Revisión de riesgos y cambié de niño. ¿Se perdió?**
No. Queda como borrador en esa pestaña del navegador hasta que responda o la cierre.

**Se fue el menú y solo veo íconos.**
Plegó el menú. Pulse **Desplegar menú**, arriba del menú; la aplicación recuerda su elección en ese navegador.

**Cambié el orden de las columnas en Niños y en otro computador no aparece.**
El orden se guarda solo en el navegador donde lo cambió. **Columnas → Restablecer** vuelve al orden original.

**¿Cada cuánto se actualizan los datos?**
Cada vez que hay una corrida nueva, normalmente cuando llega un corte nuevo de la base. Debajo del título del tablero
aparecen la fecha del corte y la de la corrida.

**No me llegan los correos de aviso.**
Revise la carpeta de correo no deseado. Si no está ahí, la administración debe confirmar en **Notificaciones** que el
desenlace está **Activa**, que su correo está en **Destinatarios** y que la corrida no fue **En silencio**. En
**Avisos enviados** se ve si el envío dio **Error**.

**El enlace de un correo no abre la historia del niño.**
Puede que ese niño ya no esté en el corte de la última corrida, o que su sesión haya vencido. Ingrese de nuevo y
búsquelo en **Niños**.
