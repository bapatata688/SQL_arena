// Problemas avanzados (HackerRank SQL Advanced / LeetCode SQL 50 patterns)
// Cubren: CTEs recursivas, pivots, medias móviles, gaps & islands, retención, deduplicación "latest per key".

export const advancedTopics = [
  {
    id: "recursive_ctes",
    title: "CTEs Recursivas (Jerarquías y Series)",
    badge: "HackerRank Advanced",
    icon: "Workflow",
    summary: "WITH RECURSIVE: caso ancla + caso recursivo para recorrer organigramas y generar series de números o fechas.",
    guide: `
# CTEs Recursivas: Jerarquías, Grafos y Series

Una CTE recursiva es la única construcción de SQL estándar que permite expresar **cierre transitivo** (alcanzabilidad) dentro del lenguaje declarativo: "todos los reportes directos e indirectos de un gerente", "todas las categorías hijas de una categoría", "todos los días entre dos fechas". El álgebra relacional pura de Codd no puede expresarlo; SQL:1999 añadió \`WITH RECURSIVE\` para cubrir ese hueco. Entenderla como un **bucle de punto fijo** (y no como magia) es lo que separa a quien memorizó la plantilla de quien puede depurarla, optimizarla y evitar que tumbe un servidor.

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Consultas (Logical Query Processing)

### Anatomía formal

Una CTE recursiva siempre tiene tres piezas:

\`\`\`sql
WITH RECURSIVE nombre (col1, col2) AS (
    SELECT ...                -- 1. ANCLA (miembro no recursivo): se ejecuta UNA vez
    UNION ALL                 --    UNION ALL conserva todo; UNION [DISTINCT] deduplica
    SELECT ... FROM nombre    -- 2. MIEMBRO RECURSIVO: referencia a la propia CTE
    WHERE condicion_de_parada -- 3. TERMINACION: debe volverse falsa o vacia en algun momento
)
SELECT * FROM nombre;
\`\`\`

### Semántica de punto fijo (semi-naive evaluation)

Sea \`R0\` el resultado del ancla y \`f\` la función que representa el miembro recursivo. El motor calcula:

- \`R1 = f(R0)\`, \`R2 = f(R1)\`, \`R3 = f(R2)\`, ... hasta que \`Rk\` es el conjunto vacío.
- El resultado final de la CTE es la unión \`R0 ∪ R1 ∪ ... ∪ Rk\`.

Punto crítico que casi nadie recuerda: **en cada iteración el miembro recursivo solo ve las filas producidas por la iteración inmediatamente anterior**, no todo lo acumulado. Por eso \`n + 1\` produce 1, 2, 3... y no explota combinatoriamente.

### Posición en el pipeline lógico

La CTE completa se resuelve **antes** del \`SELECT\` externo que la consume; para el resto de la consulta se comporta como una tabla derivada materializada:

\`WITH (resolución de CTEs) -> FROM -> WHERE -> GROUP BY -> HAVING -> WINDOW -> SELECT -> DISTINCT -> ORDER BY -> LIMIT\`

Consecuencia práctica: \`ORDER BY\` y \`LIMIT\` del SELECT externo **no** acotan la recursión; la CTE ya generó todas sus filas cuando ellos se evalúan.

### Reglas del miembro recursivo en MySQL 8.0

- Debe referenciar la CTE **una sola vez**, y solo en su cláusula \`FROM\` (no en subconsultas).
- No puede contener funciones de agregación, funciones de ventana, \`GROUP BY\`, \`ORDER BY\` ni \`DISTINCT\`.
- Si hace \`JOIN\` con la CTE, esta no puede estar en el lado derecho de un \`LEFT JOIN\`.
- El **tipo y ancho de las columnas lo fija el ancla**. Si el ancla produce \`'a'\` (CHAR(1)) y la recursión concatena, el resultado se trunca o falla en modo estricto.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### El bucle de punto fijo con tabla de trabajo

\`\`\`text
              +-----------------------------+
 ANCLA  ----> | Iteracion 0:  (1, Ana, 1)   |  (nivel 1: el CEO)
              +--------------+--------------+
                             | miembro recursivo ve SOLO esta fila
                             v
              +-----------------------------+
              | Iteracion 1:  (2, Luis, 2)  |  (reportes directos de Ana)
              |               (3, Marta, 2) |
              +--------------+--------------+
                             | ve solo las 2 filas anteriores
                             v
              +-----------------------------+
              | Iteracion 2:  (4, Pedro, 3) |  (reportes de Luis y Marta)
              +--------------+--------------+
                             v
              +-----------------------------+
              | Iteracion 3:  (5, Sofia, 4) |
              +--------------+--------------+
                             v
              | Iteracion 4:  (vacio)  -->  STOP: punto fijo alcanzado
\`\`\`

### Jerarquía representada como árbol

\`\`\`text
Org (id, name, manager_id)

        Ana (1)  nivel 1
       /       \\
   Luis (2)   Marta (3)   nivel 2
     |
  Pedro (4)               nivel 3
     |
  Sofia (5)               nivel 4
\`\`\`

### Tres usos canónicos

\`\`\`text
+--------------------------+--------------------------+----------------------------+
| Caso                     | Ancla                    | Paso recursivo             |
+--------------------------+--------------------------+----------------------------+
| Organigrama / categorias | Raiz (manager_id IS NULL)| JOIN hijo.manager_id=padre |
| Serie numerica           | SELECT 1                 | n + 1 WHERE n < N          |
| Calendario de fechas     | fecha inicial            | DATE_ADD(d, INTERVAL 1 DAY)|
+--------------------------+--------------------------+----------------------------+
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### Materialización en tabla temporal

MySQL materializa una CTE recursiva en una **tabla temporal interna**. Cada iteración lee el delta de la anterior y agrega sus filas nuevas. Mientras cabe en memoria se usa el motor \`TempTable\`; al superar \`tmp_table_size\` / \`temptable_max_ram\` se vuelca a disco (InnoDB temporal), y la latencia se degrada de microsegundos a milisegundos por fila.

- Con \`UNION ALL\` no hay deduplicación: la tabla temporal solo crece.
- Con \`UNION\` (DISTINCT) la tabla temporal lleva una **clave única** sobre todas las columnas, y cada fila nueva se prueba contra ella. Es más caro, pero es lo que corta ciclos en grafos.

### Guardas de seguridad

- \`cte_max_recursion_depth\` (por defecto **1000**): al exceder las iteraciones, MySQL aborta con el error 3636 (\`Recursive query aborted after 1001 iterations\`). Se puede ajustar por sesión: \`SET SESSION cte_max_recursion_depth = 5000;\`.
- \`max_execution_time\` y \`LIMIT\` en el miembro recursivo (soportado desde 8.0.19) son otros frenos.
- Un límite alto no es un arreglo: oculta el bug de terminación hasta que consume memoria.

### Costo por iteración y el índice que lo decide

El paso recursivo hace un \`JOIN\` de la fila delta contra la tabla base. Con índice sobre la columna de enlace (\`Org.manager_id\`) cada iteración es un *index lookup* por fila delta: costo total aproximado \`O(N log N)\` sobre el árbol completo. **Sin índice**, cada iteración escanea la tabla completa: \`O(profundidad x N)\`.

\`\`\`sql
-- El indice que convierte cada iteracion en lookups puntuales:
CREATE INDEX idx_org_manager ON Org (manager_id);
\`\`\`

En \`EXPLAIN FORMAT=TREE\` busca nodos del estilo \`Materialize recursive CTE\` y \`Repeat until convergence\`, y verifica que el acceso a la tabla base sea \`Index lookup\` y no \`Table scan\`.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Niveles y ruta completa de una jerarquía

\`\`\`sql
WITH RECURSIVE tree AS (
    SELECT id, name, manager_id,
           1 AS level,
           CAST(name AS CHAR(500)) AS path   -- CAST fija el ancho: evita truncamiento
    FROM Org
    WHERE manager_id IS NULL
    UNION ALL
    SELECT o.id, o.name, o.manager_id,
           t.level + 1,
           CONCAT(t.path, ' > ', o.name)
    FROM Org o
    JOIN tree t ON o.manager_id = t.id
)
SELECT id, name, level, path
FROM tree
ORDER BY level, id;
\`\`\`

### 2. Serie de fechas para reportar días sin actividad

\`\`\`sql
WITH RECURSIVE days AS (
    SELECT DATE('2023-01-01') AS day
    UNION ALL
    SELECT day + INTERVAL 1 DAY FROM days WHERE day < '2023-01-07'
)
SELECT d.day, COUNT(o.id) AS orders_count   -- COUNT(o.id), no COUNT(*): ignora el NULL del outer join
FROM days d
LEFT JOIN Orders o ON o.order_date = d.day
GROUP BY d.day
ORDER BY d.day;
\`\`\`

### 3. Protección contra ciclos con rastreo de ruta

\`\`\`sql
-- Grafo con posibles ciclos (A -> B -> A). Se corta si el nodo ya esta en la ruta.
WITH RECURSIVE walk AS (
    SELECT src, dst, CAST(CONCAT(',', src, ',', dst, ',') AS CHAR(1000)) AS visited
    FROM Edges
    WHERE src = 1
    UNION ALL
    SELECT e.src, e.dst, CONCAT(w.visited, e.dst, ',')
    FROM Edges e
    JOIN walk w ON e.src = w.dst
    WHERE LOCATE(CONCAT(',', e.dst, ','), w.visited) = 0   -- no volver a un nodo ya visitado
)
SELECT DISTINCT dst FROM walk;
\`\`\`

### 4. Descendientes de un nodo concreto (subárbol)

\`\`\`sql
WITH RECURSIVE subtree AS (
    SELECT id FROM Org WHERE id = 2            -- ancla parametrizada
    UNION ALL
    SELECT o.id FROM Org o JOIN subtree s ON o.manager_id = s.id
)
SELECT id FROM subtree WHERE id <> 2;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: Recursión sin condición de parada efectiva

\`\`\`sql
-- MAL: la condicion nunca se vuelve falsa
WITH RECURSIVE nums AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM nums            -- sin WHERE
)
SELECT COUNT(*) FROM nums;
-- Resultado: ERROR 3636, la consulta aborta tras 1001 iteraciones.

-- Diagnostico: el miembro recursivo siempre produce una fila, el delta nunca es vacio.
-- Peor aun: "arreglarlo" con SET cte_max_recursion_depth = 1000000000 solo traslada
-- el fallo a memoria y disco.

-- BIEN: la condicion de parada vive dentro del miembro recursivo.
WITH RECURSIVE nums AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM nums WHERE n < 100
)
SELECT COUNT(*) FROM nums;
\`\`\`

### Antipatrón 2: Ciclo en los datos con UNION ALL

\`\`\`sql
-- Si Org contiene (id=1, manager_id=3) y (id=3, manager_id=1) la jerarquia es circular
-- y el delta nunca se vacia. Con UNION ALL la consulta agota la profundidad maxima.
-- Dos defensas validas:
--   a) UNION (DISTINCT): una fila repetida no entra al delta y el ciclo se corta.
--   b) Rastrear la ruta visitada (patron 3 de la seccion anterior).
-- Ademas: una restriccion o un job de calidad de datos que detecte ciclos en la tabla.
\`\`\`

### Antipatrón 3: El ancla fija un tipo demasiado estrecho

\`\`\`sql
-- MAL: el ancla produce CHAR(1); la concatenacion posterior no cabe.
WITH RECURSIVE r AS (
    SELECT 1 AS n, 'a' AS s
    UNION ALL
    SELECT n + 1, CONCAT(s, 'a') FROM r WHERE n < 5
)
SELECT * FROM r;
-- En modo estricto: ERROR 1406 Data too long for column 's'.

-- BIEN: ensanchar el tipo en el ancla.
WITH RECURSIVE r AS (
    SELECT 1 AS n, CAST('a' AS CHAR(50)) AS s
    UNION ALL
    SELECT n + 1, CONCAT(s, 'a') FROM r WHERE n < 5
)
SELECT * FROM r;
\`\`\`

### Antipatrón 4: Recursión donde una tabla de calendario era la respuesta

Generar millones de fechas con una CTE recursiva en cada ejecución desperdicia CPU y tabla temporal. Para reportes recurrentes, una **tabla de calendario** (\`dim_date\`) precalculada e indexada es la solución de producción; la CTE recursiva queda para rangos pequeños, ad hoc o entornos sin esa tabla.

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Escribe primero la parada, después el paso.** Antes de la plantilla completa, responde: "¿qué condición hace vacío el delta?". En jerarquías es "no quedan hijos"; en series es \`n < N\`. Si no puedes nombrarla, la consulta no está lista.
2. **Ancla, tipo y ancho.** Pregúntate qué tipo fija el ancla y si las filas siguientes caben. Ante cualquier \`CONCAT\` en la recursión, aplica \`CAST(... AS CHAR(n))\` en el ancla.
3. **Todo lo que no sea expandir, va afuera.** Agregaciones, \`ORDER BY\`, \`DISTINCT\` y funciones de ventana no se permiten en el miembro recursivo: construye el conjunto completo dentro y transfórmalo en el \`SELECT\` externo.
4. **Reconoce el patrón en el enunciado.** "Todos los reportes directos e indirectos", "ancestros", "rutas", "generar todos los días/números entre X e Y", "encontrar IDs faltantes en una secuencia": son cierre transitivo o generación de series (por ejemplo, problemas de LeetCode como *All People Report to the Given Manager* o *Find the Missing IDs*).
5. **Cuando haya duda sobre ciclos, usa \`UNION\` o rastrea la ruta.** Un entrevistador senior pregunta explícitamente "¿y si hay un ciclo?"; tener la respuesta lista marca la diferencia.
6. **Menciona el índice.** Decir "indexo \`manager_id\` para que cada iteración sea un lookup y no un scan" demuestra que entiendes el costo físico, no solo la sintaxis.
`
  },
  {
    id: "pivots",
    title: "Pivot con Agregación Condicional",
    badge: "HackerRank Advanced",
    icon: "Table",
    summary: "Convertir filas en columnas con SUM(CASE WHEN ...) / MAX(CASE WHEN ...) y ROW_NUMBER para alinear filas.",
    guide: `
# Pivot con Agregación Condicional: de Filas a Columnas

Un *pivot* convierte valores de una columna (trimestres, estados, ocupaciones) en columnas del resultado. SQL Server y Oracle tienen un operador \`PIVOT\`; **MySQL no**. El patrón universal, portable a cualquier motor, es la **agregación condicional**: una función de agregación cuyo argumento es una expresión \`CASE\`. Dominarlo es obligatorio para HackerRank y para casi cualquier reporte de negocio (ventas por trimestre, funnel por estado, métricas por segmento).

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Consultas (Logical Query Processing)

### Las tres piezas de todo pivot

Antes de escribir una línea, identifica:

1. **Clave de fila:** qué define una fila del resultado (\`product\`, \`user_id\`). Va en \`GROUP BY\`.
2. **Clave de pivote:** la columna cuyos valores se vuelven columnas (\`quarter\`, \`status\`).
3. **Medida:** el valor que se agrega en cada celda (\`amount\`, un conteo, un texto).

### La plantilla

\`\`\`sql
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN amount ELSE 0 END) AS q2
FROM Sales
GROUP BY product;
\`\`\`

### Por qué funciona: orden lógico de evaluación

\`FROM -> WHERE -> GROUP BY -> HAVING -> WINDOW -> SELECT -> ...\`

\`GROUP BY product\` forma los grupos primero. Después, **para cada grupo**, cada agregado recorre sus filas y evalúa su \`CASE\` fila por fila: si la fila cumple la condición aporta su valor, si no aporta \`0\` (o \`NULL\`). El resultado es una columna por cada \`CASE\`.

### Elegir la función de agregación según la medida

\`\`\`text
+---------------------------+---------------------------------------+---------------------------+
| Tipo de medida            | Expresion                             | Nota                      |
+---------------------------+---------------------------------------+---------------------------+
| Numerica (suma)           | SUM(CASE WHEN k='x' THEN v ELSE 0 END)| ELSE 0 evita NULL         |
| Conteo de filas           | COUNT(CASE WHEN k='x' THEN 1 END)     | COUNT ignora NULL         |
| Texto o fecha (1 valor)   | MAX(CASE WHEN k='x' THEN v END)       | SIN ELSE: MAX ignora NULL |
| Porcentaje / proporcion   | AVG(k = 'x')   (atajo MySQL)          | booleano 1/0, no estandar |
+---------------------------+---------------------------------------+---------------------------+
\`\`\`

### Dos reglas de la lógica trivalente que gobiernan el pivot

- Un \`CASE\` sin \`ELSE\` devuelve \`NULL\` cuando ninguna rama coincide.
- \`SUM\` y \`MAX\` **ignoran** los \`NULL\`, pero \`SUM\` de un grupo donde todo es \`NULL\` devuelve \`NULL\` (no \`0\`). Por eso \`SUM(CASE ... END)\` sin \`ELSE 0\` entrega \`NULL\` en celdas sin datos.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Transformación filas -> columnas

\`\`\`text
ENTRADA (formato largo)               SALIDA (formato ancho)
+---------+---------+--------+        +---------+------+------+------+
| product | quarter | amount |        | product |  q1  |  q2  |  q3  |
+---------+---------+--------+        +---------+------+------+------+
| A       | Q1      | 100    |        | A       | 100  | 150  |  0   |
| A       | Q2      | 150    |  --->  | B       |  80  |  0   | 200  |
| B       | Q1      |  80    |        +---------+------+------+------+
| B       | Q3      | 200    |
+---------+---------+--------+
\`\`\`

### Qué hace el motor con una fila del grupo "A"

\`\`\`text
Fila (A, Q2, 150) entra a cada agregado del grupo A:

  q1: CASE WHEN 'Q2'='Q1' ... -> ELSE 0    -> suma 0
  q2: CASE WHEN 'Q2'='Q2' ... -> 150       -> suma 150
  q3: CASE WHEN 'Q2'='Q3' ... -> ELSE 0    -> suma 0

Cada fila alimenta TODAS las columnas; solo una (o ninguna) recibe valor.
\`\`\`

### El patrón Occupations: alinear listas independientes

\`\`\`text
Doctor:    Ana, Luis          Profesor: Marta         Cantante: Pedro, Sofia
              |                   |                        |
 ROW_NUMBER() por ocupacion ordenado por nombre
              v                   v                        v
 rn=1: Ana          rn=1: Marta         rn=1: Pedro
 rn=2: Luis                             rn=2: Sofia

 GROUP BY rn  +  MAX(CASE WHEN occupation = ... THEN name END)

 rn | Doctor | Profesor | Cantante
 1  | Ana    | Marta    | Pedro
 2  | Luis   | NULL     | Sofia        <- el NULL es el relleno natural
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### Una sola pasada sobre la tabla

La agregación condicional lee la tabla **una vez** y calcula todas las columnas simultáneamente. Las alternativas ingenuas (un \`LEFT JOIN\` por cada valor de pivote, o un \`UNION ALL\` de \`k\` consultas) leen la tabla \`k\` veces: \`O(k x N)\` frente a \`O(N)\`.

### Cómo agrupa MySQL

- Si existe un índice cuyo prefijo coincide con la clave de \`GROUP BY\`, MySQL puede recorrerlo en orden y agregar en streaming, sin tabla temporal.
- Si no, usa una **tabla temporal** (o un ordenamiento) para formar los grupos; en \`EXPLAIN\` aparece \`Using temporary\`.
- Cada \`CASE\` es una evaluación de expresión por fila: costo de CPU despreciable frente al costo de leer páginas. El tiempo lo dominan el escaneo y el agrupamiento, no los \`CASE\`.

### Índice cubriente para el pivot

\`\`\`sql
-- Cubre clave de fila, clave de pivote y medida: el pivot se resuelve "Using index",
-- sin tocar las paginas del indice clustered.
CREATE INDEX idx_sales_cover ON Sales (product, quarter, amount);
\`\`\`

### Limitación estructural: las columnas son estáticas

Las columnas del resultado deben conocerse **al parsear** la consulta. Un pivot dinámico (cuyas columnas dependen de los datos) exige construir el SQL como texto con \`GROUP_CONCAT\` y ejecutarlo con \`PREPARE\` / \`EXECUTE\`. Ojo: \`GROUP_CONCAT\` trunca silenciosamente a \`group_concat_max_len\` (1024 bytes por defecto), lo que genera una consulta incompleta sin error visible. (SQL Arena solo permite \`SELECT\`/\`WITH\`, por lo que este patrón queda fuera del sandbox, pero es el que verás en producción.)

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Pivot numérico con celdas sin dato en cero

\`\`\`sql
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN amount ELSE 0 END) AS q2,
       SUM(CASE WHEN quarter = 'Q3' THEN amount ELSE 0 END) AS q3,
       SUM(CASE WHEN quarter = 'Q4' THEN amount ELSE 0 END) AS q4,
       SUM(amount)                                          AS total   -- control de cuadre
FROM Sales
GROUP BY product
ORDER BY product;
\`\`\`

### 2. Pivot de texto con MAX (sin ELSE)

\`\`\`sql
SELECT employee_id,
       MAX(CASE WHEN contact_type = 'email' THEN contact_value END) AS email,
       MAX(CASE WHEN contact_type = 'phone' THEN contact_value END) AS phone
FROM Contacts
GROUP BY employee_id;
-- Si un empleado no tiene telefono, la celda es NULL: dato ausente, no un 0 ni un ''.
\`\`\`

### 3. Conteo por estado y tasa en una sola consulta

\`\`\`sql
SELECT campaign_id,
       COUNT(*)                                        AS total,
       COUNT(CASE WHEN status = 'converted' THEN 1 END) AS converted,
       ROUND(100.0 * COUNT(CASE WHEN status = 'converted' THEN 1 END)
             / NULLIF(COUNT(*), 0), 2)                 AS conversion_pct
FROM Leads
GROUP BY campaign_id;
\`\`\`

### 4. Occupations: ROW_NUMBER para alinear y MAX para colapsar

\`\`\`sql
SELECT MAX(CASE WHEN occupation = 'Doctor'   THEN name END) AS doctor,
       MAX(CASE WHEN occupation = 'Professor' THEN name END) AS professor,
       MAX(CASE WHEN occupation = 'Singer'   THEN name END) AS singer,
       MAX(CASE WHEN occupation = 'Actor'    THEN name END) AS actor
FROM (
    SELECT name, occupation,
           ROW_NUMBER() OVER (PARTITION BY occupation ORDER BY name) AS rn
    FROM Occupations
) ranked
GROUP BY rn
ORDER BY rn;
-- La funcion de ventana vive en la subconsulta: no puede estar en el mismo nivel del GROUP BY.
\`\`\`

### 5. Operación inversa (unpivot): columnas a filas

\`\`\`sql
SELECT product, 'Q1' AS quarter, q1 AS amount FROM SalesWide
UNION ALL
SELECT product, 'Q2', q2 FROM SalesWide
UNION ALL
SELECT product, 'Q3', q3 FROM SalesWide;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: Filas que no coinciden con ningún \`WHEN\` desaparecen en silencio

\`\`\`sql
-- MAL: si aparece un valor inesperado ('Q5', un NULL en quarter o ' Q1' con un espacio),
-- esa fila no suma en NINGUNA columna y nadie recibe error.
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN amount ELSE 0 END) AS q2
FROM Sales
GROUP BY product;

-- Diagnostico: comparar q1 + q2 contra SUM(amount). Si no cuadran, hay valores huerfanos.

-- BIEN: columna de control y cubo explicito para lo inesperado.
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN amount ELSE 0 END) AS q2,
       SUM(CASE WHEN quarter IS NULL OR quarter NOT IN ('Q1','Q2')
                THEN amount ELSE 0 END)                      AS other,
       SUM(amount)                                           AS total
FROM Sales
GROUP BY product;
\`\`\`

### Antipatrón 2: Un \`JOIN\` por cada valor de pivote

\`\`\`sql
-- MAL: k lecturas de la tabla y un producto de joins fragil.
SELECT p.product, q1.amount AS q1, q2.amount AS q2
FROM (SELECT DISTINCT product FROM Sales) p
LEFT JOIN Sales q1 ON q1.product = p.product AND q1.quarter = 'Q1'
LEFT JOIN Sales q2 ON q2.product = p.product AND q2.quarter = 'Q2';
-- Si hay dos filas Q1 para un producto, el join duplica filas y rompe los totales.
-- BIEN: la plantilla de agregacion condicional (una pasada, sin fan-out).
\`\`\`

### Antipatrón 3: \`ELSE 0\` donde la ausencia debía distinguirse del cero

\`\`\`sql
-- Para metricas donde "sin dato" y "dato igual a cero" significan cosas distintas
-- (temperatura, saldo, puntaje), SUM(... ELSE 0) las mezcla.
-- Dejar sin ELSE y decidir la presentacion al final:
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount END)                AS q1_raw,        -- NULL = sin dato
       COALESCE(SUM(CASE WHEN quarter = 'Q1' THEN amount END), 0)   AS q1_display     -- 0 solo al presentar
FROM Sales
GROUP BY product;
\`\`\`

### Antipatrón 4: \`MAX\` sobre texto cuando hay más de un valor por celda

\`\`\`sql
-- Si un empleado tiene DOS emails, MAX(CASE WHEN contact_type='email' ...) devuelve
-- solo el "mayor" alfabeticamente y descarta el otro sin avisar.
-- Antes de pivotar texto, verifica la unicidad de (clave de fila, clave de pivote):
SELECT employee_id, contact_type, COUNT(*) AS n
FROM Contacts
GROUP BY employee_id, contact_type
HAVING COUNT(*) > 1;
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Nombra las tres piezas en voz alta.** "Clave de fila: X; clave de pivote: Y; medida: Z." Con eso, la consulta casi se escribe sola, y el entrevistador ve método.
2. **\`SUM\` para números, \`MAX\` para texto.** Si la medida es texto o fecha, \`MAX(CASE ... END)\` sin \`ELSE\`. Si es numérica, \`SUM(CASE ... ELSE 0 END)\`. Para contar, \`COUNT(CASE ... THEN 1 END)\`.
3. **Siempre añade un control de cuadre** (\`SUM(amount) AS total\` o una comparación con el total sin pivotar). Es la forma más barata de detectar valores huérfanos.
4. **Cuando las listas tienen longitudes distintas, necesitas un índice de alineación.** Es el truco de *Occupations*: \`ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)\` en una subconsulta y \`GROUP BY rn\` afuera.
5. **Di explícitamente que las columnas son estáticas.** Un entrevistador senior preguntará "¿y si los trimestres cambian?". La respuesta: pivot dinámico con \`GROUP_CONCAT\` + \`PREPARE\`, cuidando \`group_concat_max_len\`, o resolverlo en la capa de presentación.
6. **Recuerda el atajo de MySQL, pero úsalo con criterio.** \`SUM(col = 'x')\` y \`AVG(col = 'x')\` funcionan porque los booleanos valen 1/0, pero no son SQL estándar; en una entrevista de BigQuery o PostgreSQL usa \`CASE\`, que es portable.
`
  }
,
  {
    id: "exists_predicates",
    title: "Predicados de Existencia: EXISTS, NOT EXISTS y SELECT 1",
    badge: "Semi-Joins & Álgebra de Conjuntos",
    icon: "CheckCircle2",
    summary: "Domina la evaluación por cortocircuito (short-circuit), Semi-Joins y Anti-Joins en el optimizador CBO, el mito de SELECT 1 vs SELECT *, y la eliminación definitiva de la trampa 3VL de NOT IN.",
    guide: `
# Predicados de Existencia: EXISTS, NOT EXISTS y el Mito de SELECT 1

En el álgebra relacional de Edgar F. Codd, determinar la pertenencia o ausencia de una tupla en un conjunto relacionado es una de las operaciones más frecuentes y computacionalmente sensibles. A menudo los desarrolladores confunden semánticamente un \`INNER JOIN\` con un \`EXISTS\`, o un \`NOT IN\` con un \`NOT EXISTS\`, provocando duplicación inadvertida de registros (fan-out cartesiano), degradación a escaneos $O(N \\times M)$ o la pérdida total de resultados debido a la lógica trivalente (3VL). 

Comprender la transformación física a **Semi-Joins** y **Anti-Joins** en el optimizador basado en costos (CBO) de MySQL 8.0 y desmitificar la convención de \`SELECT 1\` es esencial para el nivel Staff Data Engineer.

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Consultas (Logical Query Processing)

### El Cuantificador Existencial Formal ($\\exists$)
En lógica de predicados de primer orden, \`EXISTS\` modela directamente el cuantificador existencial:
$$\\exists t \\in R \\quad \\text{tal que} \\quad P(t) = \\text{TRUE}$$

A diferencia de las comparaciones escalares (\`=\`, \`<->\`, \`IN\`), \`EXISTS\` posee dos propiedades fundamentales en el estándar ANSI SQL:
1. **Semántica Booleana Pura (Bivalente):**
   \`EXISTS\` **NUNCA evalúa a \`UNKNOWN\`**. Retorna estrictamente:
   - \`TRUE\`: Si la subconsulta produce al menos una tupla (incluso si esa tupla contiene únicamente valores \`NULL\`).
   - \`FALSE\`: Si la subconsulta produce cero tuplas (conjunto vacío $\\emptyset$).
2. **Evaluación por Cortocircuito (*Short-Circuit Evaluation*):**
   El motor relacional no necesita materializar ni calcular la cardinalidad total de la subconsulta. En el instante exacto en que el motor localiza la primera tupla que satisface la condición correlacionada, la evaluación se interrumpe y retorna \`TRUE\` de inmediato.

### Posición en el Pipeline Lógico
En el orden lógico: \`FROM ➔ WHERE ➔ GROUP BY ➔ HAVING ➔ WINDOW ➔ SELECT ➔ DISTINCT ➔ ORDER BY ➔ LIMIT\`
Cuando \`EXISTS\` reside en la cláusula \`WHERE\`, actúa como un predicado de filtrado correlacionado que evalúa cada tupla candidata de la consulta externa contra el espacio de búsqueda interior.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Comparativa de Evaluación: EXISTS vs IN vs JOIN
\`\`\`text
Consulta Externa: Cliente ID = 101

[ INNER JOIN + DISTINCT ]:
   Cliente 101 ───► Orden 1 ──┐
               ───► Orden 2 ──┼──► Genera 3 tuplas intermedias ──► GROUP BY / Sort ──► Cliente 101
               ───► Orden 3 ──┘   (Gasto de memoria + Filesort inútil)

[ EXISTS (Short-Circuit) ]:
   Cliente 101 ───► Orden 1 (¡MATCH!) ──► STOP INMEDIATO ──► Retorna TRUE ──► Cliente 101
                    (Orden 2 y Orden 3 JAMÁS se leen)
\`\`\`

### El Mito Desarmado: SELECT 1 vs SELECT * vs SELECT NULL
\`\`\`text
┌─────────────────────────────────┬─────────────────────────────────────────────────────────┐
│ Sintaxis en Subconsulta         │ Lo que cree el novato vs Lo que hace el Optimizador     │
├─────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ EXISTS (SELECT 1 FROM ...)      │ Cree que ahorra I/O leyendo una constante "1".          │
│ EXISTS (SELECT * FROM ...)      │ Teme que lea todas las columnas de la tabla.           │
│ EXISTS (SELECT NULL FROM ...)   │ Cree que fallará por ser NULL.                          │
├─────────────────────────────────┴─────────────────────────────────────────────────────────┤
│ REALIDAD STAFF: En el AST (Abstract Syntax Tree), el motor descarta completamente la      │
│ lista de proyección del SELECT. Solo verifica la presencia física de la tupla (puntero). │
│ SELECT 1, SELECT * y SELECT NULL producen IDÉNTICO plan físico en MySQL 8.0.             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### Transformación Física: De Subconsulta Correlacionada a Semi-Join
En versiones antiguas de MySQL, las subconsultas correlacionadas se ejecutaban ingenuamente como bucles anidados dependientes ($O(N \\times M)$). En MySQL 8.0+, el optimizador reescribe internamente \`WHERE EXISTS (...)\` en un **Semi-Join**:
Un Semi-Join es una reunión relacional que devuelve una fila de la tabla externa tan pronto como encuentra la primera coincidencia en la tabla interna, descartando la necesidad de deduplicación.

### Estrategias de Ejecución en EXPLAIN FORMAT=TREE:
1. **FirstMatch Strategy:** Escanea la tabla externa y para cada registro busca en el índice B+ Tree de la interna; al primer match se detiene y avanza a la siguiente fila externa (\`-> Semi-join (FirstMatch(c))\`).
2. **LooseScan Strategy:** Si la tabla interna dispone de un índice adecuado, el motor recorre los valores únicos del índice sin leer filas duplicadas.
3. **Materialization (Lookup / Scan):** Materializa la subconsulta en una tabla temporal hash en memoria (\`join_buffer_size\`) con clave primaria para deduplicación instantánea $O(1)$.

### Anti-Join Físico: NOT EXISTS
Cuando se evalúa \`NOT EXISTS\`, el optimizador implementa un **Anti-Join**. Si la tabla interna posee un índice sobre la clave de correlación, la búsqueda logarítmica $O(\\log M)$ descarta la fila externa si la clave existe en el B+ Tree, logrando un rendimiento casi idéntico al de un \`LEFT JOIN ... WHERE right.pk IS NULL\`.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Semi-Join Canónico para Prevenir el Síndrome de Fan-Out
Cuando necesitas atributos de la entidad principal sin alterar su cardinalidad:
\`\`\`sql
-- PATRÓN CANÓNICO: Retorna cada cliente UNA sola vez, sin importar cuántos pedidos tenga:
SELECT c.id, c.name
FROM Customers c
WHERE EXISTS (
    SELECT 1 
    FROM Purchases p 
    WHERE p.customer_id = c.id 
      AND p.amount > 500
);
\`\`\`

### 2. Anti-Join Canónico a Prueba de Nulos (Eliminación Definitiva de NOT IN)
Para encontrar registros sin actividad o dependencias ausentes de forma 100% segura frente a valores nulos:
\`\`\`sql
-- BLINDADO CONTRA 3VL: Si en AuditLogs hay tuplas con user_id = NULL, NOT EXISTS sigue funcionando perfectamente:
SELECT u.user_id, u.email
FROM Users u
WHERE NOT EXISTS (
    SELECT 1 
    FROM AuditLogs a 
    WHERE a.user_id = u.user_id
);
\`\`\`

### 3. Verificación de Dependencias Cruzadas Múltiples (Correlación Compleja)
\`\`\`sql
-- Clientes con pagos confirmados pero sin facturas emitidas:
SELECT c.id, c.name
FROM Customers c
WHERE EXISTS (
    SELECT 1 FROM Payments p 
    WHERE p.customer_id = c.id AND p.status = 'CONFIRMED'
)
AND NOT EXISTS (
    SELECT 1 FROM Invoices i 
    WHERE i.customer_id = c.id
);
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: El Desastre del NOT IN Frente a Subconsultas con Nulos
\`\`\`sql
-- INCIDENTE CLÁSICO EN PRODUCCIÓN:
-- Si existe UNA sola fila en InactiveAccounts donde account_id sea NULL,
-- la consulta completa devuelve CERO registros de forma permanente y silenciosa.
SELECT account_id, owner_name 
FROM Accounts 
WHERE account_id NOT IN (SELECT account_id FROM InactiveAccounts);

-- Demostración Matemática:
-- id NOT IN (1, 2, NULL) ➔ NOT (id = 1 OR id = 2 OR id = NULL)
-- ➔ NOT (FALSE OR FALSE OR UNKNOWN) ➔ NOT (UNKNOWN) ➔ UNKNOWN (DESCARTADA).

-- REFACTORIZACIÓN STAFF CON NOT EXISTS:
SELECT a.account_id, a.owner_name 
FROM Accounts a
WHERE NOT EXISTS (
    SELECT 1 FROM InactiveAccounts ia WHERE ia.account_id = a.account_id
);
\`\`\`

### Antipatrón 2: El Uso de JOIN + DISTINCT para Verificar Existencia
\`\`\`sql
-- ANTIPATRÓN DESTRUCTIVO DE MEMORIA:
-- Si un cliente tiene 50,000 transacciones, el JOIN genera 50,000 filas en memoria
-- solo para que DISTINCT las elimine mediante un filesort masivo en disco.
SELECT DISTINCT c.id, c.name
FROM Customers c
JOIN Transactions t ON c.id = t.customer_id;

-- REFACTORIZACIÓN STAFF CON EXISTS:
-- Lee la primera transacción en B+ Tree y se detiene (cero memoria adicional).
SELECT c.id, c.name
FROM Customers c
WHERE EXISTS (SELECT 1 FROM Transactions t WHERE t.customer_id = c.id);
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **La Regla de Oro del SELECT 1:** En entrevistas técnicas y revisiones de código, utiliza siempre \`SELECT 1\` dentro de \`EXISTS\`. Aunque el optimizador ignore la lista de proyección, comunica explícitamente al entrevistador: *"Sé que la proyección no importa; solo me interesa la existencia física de la tupla"*.
2. **Regla de Proscripción de NOT IN:** Nunca uses \`NOT IN\` cuando la subconsulta apunte a una columna que permita nulos (\`nullable\`). Sustitúyelo de inmediato por \`NOT EXISTS\` o por un Anti-Join con \`LEFT JOIN ... WHERE right.pk IS NULL\`.
3. **Índices en Claves de Correlación:** Para que \`EXISTS\` alcance latencia de microsegundos, la tabla interna en la subconsulta **debe** tener un índice B+ Tree sobre la columna correlacionada (clave foránea). Sin índice, el Semi-Join degradará a escaneos repetidos costosos.
`
  }
];

export const advancedProblems = [
  {
    id: "recursive-1",
    topicId: "recursive_ctes",
    title: "22. Niveles del Organigrama (WITH RECURSIVE)",
    difficulty: "Medium",
    description: `
Dada la tabla \`Org\`, reporta cada empleado con su nivel jerárquico (\`level\`). El CEO (sin manager) está en nivel 1; sus reportes directos en nivel 2, etc.
Columnas: \`id\`, \`name\`, \`level\`. Ordena por \`level\`, \`id\`.

### Tabla: \`Org\`
| id | name | manager_id |
| :--- | :--- | :--- |
| 1 | Ana | NULL |
| 2 | Luis | 1 |
| 3 | Marta | 1 |
| 4 | Pedro | 2 |
| 5 | Sofía | 4 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Org;
CREATE TABLE Org (id INT PRIMARY KEY, name VARCHAR(50), manager_id INT);
`,
    seedDML: `
INSERT INTO Org VALUES (1,'Ana',NULL),(2,'Luis',1),(3,'Marta',1),(4,'Pedro',2),(5,'Sofía',4);
`,
    starterCode: `WITH RECURSIVE tree AS (\n    SELECT id, name, 1 AS level\n    FROM Org\n    WHERE manager_id IS NULL\n    UNION ALL\n    SELECT ...\n)\nSELECT id, name, level FROM tree ORDER BY level, id;\n`,
    solutionSQL: `
WITH RECURSIVE tree AS (
    SELECT id, name, 1 AS level
    FROM Org
    WHERE manager_id IS NULL
    UNION ALL
    SELECT o.id, o.name, t.level + 1
    FROM Org o
    JOIN tree t ON o.manager_id = t.id
)
SELECT id, name, level FROM tree ORDER BY level, id;
`,
    expectedColumns: ["id", "name", "level"],
    orderMatters: true
  },
  {
    id: "recursive-2",
    topicId: "recursive_ctes",
    title: "23. Calendario con Días sin Pedidos",
    difficulty: "Hard",
    description: `
Reporta el número de pedidos por día para **todos** los días del 2023-01-01 al 2023-01-07, incluyendo los días sin pedidos (con \`0\`).
Columnas: \`day\`, \`orders_count\`. Ordena por \`day\`.
*Pista:* genera la serie de fechas con una CTE recursiva y haz \`LEFT JOIN\`.

### Tabla: \`Orders\`
| id | order_date |
| :--- | :--- |
| 1 | 2023-01-01 |
| 2 | 2023-01-01 |
| 3 | 2023-01-03 |
| 4 | 2023-01-06 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Orders;
CREATE TABLE Orders (id INT PRIMARY KEY, order_date DATE);
`,
    seedDML: `
INSERT INTO Orders VALUES (1,'2023-01-01'),(2,'2023-01-01'),(3,'2023-01-03'),(4,'2023-01-06');
`,
    starterCode: `WITH RECURSIVE days AS (\n    SELECT DATE('2023-01-01') AS day\n    UNION ALL\n    SELECT ...\n)\nSELECT d.day, COUNT(o.id) AS orders_count\nFROM days d\nLEFT JOIN Orders o ON ...\nGROUP BY d.day\nORDER BY d.day;\n`,
    solutionSQL: `
WITH RECURSIVE days AS (
    SELECT DATE('2023-01-01') AS day
    UNION ALL
    SELECT DATE_ADD(day, INTERVAL 1 DAY) FROM days WHERE day < '2023-01-07'
)
SELECT d.day, COUNT(o.id) AS orders_count
FROM days d
LEFT JOIN Orders o ON o.order_date = d.day
GROUP BY d.day
ORDER BY d.day;
`,
    expectedColumns: ["day", "orders_count"],
    orderMatters: true
  },
  {
    id: "pivot-1",
    topicId: "pivots",
    title: "24. Ventas por Trimestre (Pivot)",
    difficulty: "Medium",
    description: `
Convierte las ventas por trimestre en columnas. Una fila por producto con \`q1\`, \`q2\`, \`q3\`, \`q4\` (0 si no hubo ventas). Ordena por \`product\`.

### Tabla: \`Sales\`
| product | quarter | amount |
| :--- | :--- | :--- |
| Laptop | Q1 | 100 |
| Laptop | Q2 | 150 |
| Mouse | Q1 | 20 |
| Mouse | Q4 | 35 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Sales;
CREATE TABLE Sales (product VARCHAR(30), quarter CHAR(2), amount INT);
`,
    seedDML: `
INSERT INTO Sales VALUES ('Laptop','Q1',100),('Laptop','Q2',150),('Mouse','Q1',20),('Mouse','Q4',35);
`,
    starterCode: `SELECT product,\n       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1\n       -- q2, q3, q4 ...\nFROM Sales\nGROUP BY product\nORDER BY product;\n`,
    solutionSQL: `
SELECT product,
       SUM(CASE WHEN quarter = 'Q1' THEN amount ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN amount ELSE 0 END) AS q2,
       SUM(CASE WHEN quarter = 'Q3' THEN amount ELSE 0 END) AS q3,
       SUM(CASE WHEN quarter = 'Q4' THEN amount ELSE 0 END) AS q4
FROM Sales
GROUP BY product
ORDER BY product;
`,
    expectedColumns: ["product", "q1", "q2", "q3", "q4"],
    orderMatters: true
  },
  {
    id: "pivot-2",
    topicId: "pivots",
    title: "25. Occupations (HackerRank Classic)",
    difficulty: "Hard",
    description: `
Pivota la tabla \`Occupations\` para que cada ocupación sea una columna (\`Doctor\`, \`Professor\`, \`Singer\`, \`Actor\`, en ese orden) con los nombres ordenados alfabéticamente. Si una columna se queda sin nombres, muestra \`NULL\`.

### Tabla: \`Occupations\`
| name | occupation |
| :--- | :--- |
| Samantha | Doctor |
| Julia | Actor |
| Maria | Actor |
| Meera | Singer |
| Ashely | Professor |
| Ketty | Professor |
| Christeen | Professor |
| Jane | Actor |
| Jenny | Doctor |
| Priya | Singer |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Occupations;
CREATE TABLE Occupations (name VARCHAR(30), occupation VARCHAR(30));
`,
    seedDML: `
INSERT INTO Occupations VALUES
('Samantha','Doctor'),('Julia','Actor'),('Maria','Actor'),('Meera','Singer'),('Ashely','Professor'),
('Ketty','Professor'),('Christeen','Professor'),('Jane','Actor'),('Jenny','Doctor'),('Priya','Singer');
`,
    starterCode: `SELECT\n    MAX(CASE WHEN occupation = 'Doctor' THEN name END) AS Doctor\n    -- Professor, Singer, Actor ...\nFROM (\n    SELECT name, occupation,\n           ROW_NUMBER() OVER (PARTITION BY occupation ORDER BY name) AS rn\n    FROM Occupations\n) t\nGROUP BY rn\nORDER BY rn;\n`,
    solutionSQL: `
SELECT
    MAX(CASE WHEN occupation = 'Doctor'    THEN name END) AS Doctor,
    MAX(CASE WHEN occupation = 'Professor' THEN name END) AS Professor,
    MAX(CASE WHEN occupation = 'Singer'    THEN name END) AS Singer,
    MAX(CASE WHEN occupation = 'Actor'     THEN name END) AS Actor
FROM (
    SELECT name, occupation,
           ROW_NUMBER() OVER (PARTITION BY occupation ORDER BY name) AS rn
    FROM Occupations
) t
GROUP BY rn
ORDER BY rn;
`,
    expectedColumns: ["Doctor", "Professor", "Singer", "Actor"],
    orderMatters: true
  },
  {
    id: "window-4",
    topicId: "window_functions",
    title: "26. Media Móvil de 3 Días (ROWS BETWEEN)",
    difficulty: "Medium",
    description: `
Para cada día calcula el promedio de ventas de ese día y los 2 anteriores (\`moving_avg\`, redondeado a 2 decimales). Los primeros días usan los registros disponibles.
Columnas: \`day\`, \`amount\`, \`moving_avg\`. Ordena por \`day\`.

### Tabla: \`DailySales\`
| day | amount |
| :--- | :--- |
| 2023-01-01 | 100 |
| 2023-01-02 | 200 |
| 2023-01-03 | 300 |
| 2023-01-04 | 100 |
| 2023-01-05 | 500 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS DailySales;
CREATE TABLE DailySales (day DATE PRIMARY KEY, amount INT);
`,
    seedDML: `
INSERT INTO DailySales VALUES ('2023-01-01',100),('2023-01-02',200),('2023-01-03',300),('2023-01-04',100),('2023-01-05',500);
`,
    starterCode: `SELECT day, amount,\n       ROUND(AVG(amount) OVER (\n           ORDER BY day\n           ROWS BETWEEN ... AND CURRENT ROW\n       ), 2) AS moving_avg\nFROM DailySales\nORDER BY day;\n`,
    solutionSQL: `
SELECT day, amount,
       ROUND(AVG(amount) OVER (ORDER BY day ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg
FROM DailySales
ORDER BY day;
`,
    expectedColumns: ["day", "amount", "moving_avg"],
    orderMatters: true
  },
  {
    id: "window-5",
    topicId: "window_functions",
    title: "27. Segundo Salario Más Alto (o NULL)",
    difficulty: "Medium",
    description: `
Reporta el segundo salario **distinto** más alto como \`SecondHighestSalary\`. Si no existe, la consulta debe devolver **una fila con NULL** (no un conjunto vacío).

### Tabla: \`Emp\`
| id | salary |
| :--- | :--- |
| 1 | 100 |
| 2 | 200 |
| 3 | 300 |
| 4 | 300 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Emp;
CREATE TABLE Emp (id INT PRIMARY KEY, salary INT);
`,
    seedDML: `
INSERT INTO Emp VALUES (1,100),(2,200),(3,300),(4,300);
`,
    starterCode: `SELECT (\n    SELECT DISTINCT salary\n    FROM (\n        SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS r\n        FROM Emp\n    ) t\n    WHERE r = 2\n) AS SecondHighestSalary;\n`,
    solutionSQL: `
SELECT (
    SELECT DISTINCT salary
    FROM (
        SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS r
        FROM Emp
    ) t
    WHERE r = 2
) AS SecondHighestSalary;
`,
    expectedColumns: ["SecondHighestSalary"],
    orderMatters: false
  },
  {
    id: "gaps-1",
    topicId: "window_functions",
    title: "28. Rachas de Login Consecutivas (Gaps & Islands)",
    difficulty: "Hard",
    description: `
Encuentra, por usuario, cada racha de días consecutivos de login. Reporta \`user_id\`, \`start_date\`, \`end_date\`, \`days\`. Ordena por \`user_id\`, \`start_date\`.
*Pista:* \`login_date - ROW_NUMBER()\` es constante dentro de una racha.

### Tabla: \`Logins\`
| user_id | login_date |
| :--- | :--- |
| 1 | 2023-01-01 |
| 1 | 2023-01-02 |
| 1 | 2023-01-03 |
| 1 | 2023-01-06 |
| 2 | 2023-01-02 |
| 2 | 2023-01-04 |
| 2 | 2023-01-05 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Logins;
CREATE TABLE Logins (user_id INT, login_date DATE, PRIMARY KEY (user_id, login_date));
`,
    seedDML: `
INSERT INTO Logins VALUES (1,'2023-01-01'),(1,'2023-01-02'),(1,'2023-01-03'),(1,'2023-01-06'),(2,'2023-01-02'),(2,'2023-01-04'),(2,'2023-01-05');
`,
    starterCode: `WITH numbered AS (\n    SELECT user_id, login_date,\n           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS rn\n    FROM Logins\n),\ngrouped AS (\n    SELECT user_id, login_date,\n           DATE_SUB(login_date, INTERVAL rn DAY) AS grp\n    FROM numbered\n)\nSELECT user_id, MIN(login_date) AS start_date, MAX(login_date) AS end_date, COUNT(*) AS days\nFROM grouped\nGROUP BY user_id, grp\nORDER BY user_id, start_date;\n`,
    solutionSQL: `
WITH numbered AS (
    SELECT user_id, login_date,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS rn
    FROM Logins
),
grouped AS (
    SELECT user_id, login_date,
           DATE_SUB(login_date, INTERVAL rn DAY) AS grp
    FROM numbered
)
SELECT user_id, MIN(login_date) AS start_date, MAX(login_date) AS end_date, COUNT(*) AS days
FROM grouped
GROUP BY user_id, grp
ORDER BY user_id, start_date;
`,
    expectedColumns: ["user_id", "start_date", "end_date", "days"],
    orderMatters: true
  },
  {
    id: "dates-3",
    topicId: "dates",
    title: "29. Retención de Día 1 (LeetCode 550)",
    difficulty: "Medium",
    description: `
Reporta la fracción de jugadores que volvieron a iniciar sesión el **día siguiente a su primer login**, redondeada a 2 decimales, como \`fraction\`.

### Tabla: \`Activity\`
| player_id | event_date | games_played |
| :--- | :--- | :--- |
| 1 | 2016-03-01 | 5 |
| 1 | 2016-03-02 | 6 |
| 2 | 2017-06-25 | 1 |
| 3 | 2016-03-02 | 0 |
| 3 | 2018-07-03 | 5 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Activity;
CREATE TABLE Activity (player_id INT, event_date DATE, games_played INT, PRIMARY KEY (player_id, event_date));
`,
    seedDML: `
INSERT INTO Activity VALUES (1,'2016-03-01',5),(1,'2016-03-02',6),(2,'2017-06-25',1),(3,'2016-03-02',0),(3,'2018-07-03',5);
`,
    starterCode: `WITH first_login AS (\n    SELECT player_id, MIN(event_date) AS first_date\n    FROM Activity\n    GROUP BY player_id\n)\nSELECT ROUND(... / ..., 2) AS fraction\nFROM first_login f\nJOIN Activity a ON ...;\n`,
    solutionSQL: `
WITH first_login AS (
    SELECT player_id, MIN(event_date) AS first_date
    FROM Activity
    GROUP BY player_id
)
SELECT ROUND(
    COUNT(DISTINCT a.player_id) / (SELECT COUNT(DISTINCT player_id) FROM Activity), 2
) AS fraction
FROM first_login f
JOIN Activity a
  ON a.player_id = f.player_id
 AND a.event_date = DATE_ADD(f.first_date, INTERVAL 1 DAY);
`,
    expectedColumns: ["fraction"],
    orderMatters: false
  },
  {
    id: "dates-4",
    topicId: "dates",
    title: "30. Reporte Mensual de Transacciones (LeetCode 1193)",
    difficulty: "Medium",
    description: `
Por mes (\`YYYY-MM\`) y país reporta: \`trans_count\`, \`approved_count\`, \`trans_total_amount\`, \`approved_total_amount\`.
Columnas: \`month\`, \`country\`, \`trans_count\`, \`approved_count\`, \`trans_total_amount\`, \`approved_total_amount\`. Ordena por \`month\`, \`country\`.

### Tabla: \`Transactions\`
| id | country | state | amount | trans_date |
| :--- | :--- | :--- | :--- | :--- |
| 121 | US | approved | 1000 | 2018-12-18 |
| 122 | US | declined | 2000 | 2018-12-19 |
| 123 | US | approved | 2000 | 2019-01-01 |
| 124 | DE | approved | 2000 | 2019-01-07 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Transactions;
CREATE TABLE Transactions (id INT PRIMARY KEY, country VARCHAR(10), state VARCHAR(10), amount INT, trans_date DATE);
`,
    seedDML: `
INSERT INTO Transactions VALUES (121,'US','approved',1000,'2018-12-18'),(122,'US','declined',2000,'2018-12-19'),(123,'US','approved',2000,'2019-01-01'),(124,'DE','approved',2000,'2019-01-07');
`,
    starterCode: `SELECT DATE_FORMAT(trans_date, '%Y-%m') AS month,\n       country,\n       COUNT(*) AS trans_count\n       -- approved_count, trans_total_amount, approved_total_amount\nFROM Transactions\nGROUP BY month, country\nORDER BY month, country;\n`,
    solutionSQL: `
SELECT DATE_FORMAT(trans_date, '%Y-%m') AS month,
       country,
       COUNT(*) AS trans_count,
       SUM(state = 'approved') AS approved_count,
       SUM(amount) AS trans_total_amount,
       SUM(CASE WHEN state = 'approved' THEN amount ELSE 0 END) AS approved_total_amount
FROM Transactions
GROUP BY DATE_FORMAT(trans_date, '%Y-%m'), country
ORDER BY month, country;
`,
    expectedColumns: ["month", "country", "trans_count", "approved_count", "trans_total_amount", "approved_total_amount"],
    orderMatters: true
  },
  {
    id: "dedup-3",
    topicId: "deduplication",
    title: "31. Último Registro por Usuario (Latest per Key)",
    difficulty: "Medium",
    description: `
Un usuario puede tener varias versiones de su perfil. Reporta únicamente la versión **más reciente** (\`updated_at\`) de cada usuario.
Columnas: \`user_id\`, \`email\`, \`updated_at\`. Ordena por \`user_id\`.

### Tabla: \`Profiles\`
| id | user_id | email | updated_at |
| :--- | :--- | :--- | :--- |
| 1 | 10 | a@old.com | 2023-01-01 08:00:00 |
| 2 | 10 | a@new.com | 2023-03-01 09:30:00 |
| 3 | 11 | b@x.com | 2023-02-01 10:00:00 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Profiles;
CREATE TABLE Profiles (id INT PRIMARY KEY, user_id INT, email VARCHAR(100), updated_at DATETIME);
`,
    seedDML: `
INSERT INTO Profiles VALUES (1,10,'a@old.com','2023-01-01 08:00:00'),(2,10,'a@new.com','2023-03-01 09:30:00'),(3,11,'b@x.com','2023-02-01 10:00:00');
`,
    starterCode: `WITH ranked AS (\n    SELECT user_id, email, updated_at,\n           ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ... DESC) AS rn\n    FROM Profiles\n)\nSELECT user_id, email, updated_at FROM ranked WHERE rn = 1 ORDER BY user_id;\n`,
    solutionSQL: `
WITH ranked AS (
    SELECT user_id, email, updated_at,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
    FROM Profiles
)
SELECT user_id, email, updated_at FROM ranked WHERE rn = 1 ORDER BY user_id;
`,
    expectedColumns: ["user_id", "email", "updated_at"],
    orderMatters: true
  },
  {
    id: "window-6",
    topicId: "window_functions",
    title: "32. Top 3 Salarios Únicos por Departamento (LeetCode 185)",
    difficulty: "Hard",
    description: `
Una empresa considera de altos ingresos a los empleados que se encuentran entre los **3 salarios únicos más altos** de su departamento.
Escribe una consulta para reportar el departamento, el nombre del empleado y su salario para todos los empleados de altos ingresos.
Si hay empates en algún nivel de salario, repórtalos a todos (usando \`DENSE_RANK() <= 3\`).

Columnas: \`Department\`, \`Employee\`, \`Salary\`.
Ordena por \`Department\` ASC, \`Salary\` DESC, \`Employee\` ASC.

### Tabla: \`Department\`
| id | name |
| :--- | :--- |
| 1 | IT |
| 2 | Sales |

### Tabla: \`Employee\`
| id | name | salary | departmentId |
| :--- | :--- | :--- | :--- |
| 1 | Joe | 85000 | 1 |
| 2 | Henry | 80000 | 1 |
| 3 | Sam | 60000 | 2 |
| 4 | Max | 90000 | 1 |
| 5 | Janet | 69000 | 1 |
| 6 | Randy | 85000 | 1 |
| 7 | Will | 70000 | 1 |
| 8 | Alice | 90000 | 2 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Employee;
DROP TABLE IF EXISTS Department;
CREATE TABLE Department (id INT PRIMARY KEY, name VARCHAR(50));
CREATE TABLE Employee (id INT PRIMARY KEY, name VARCHAR(50), salary INT, departmentId INT);
`,
    seedDML: `
INSERT INTO Department VALUES (1, 'IT'), (2, 'Sales');
INSERT INTO Employee VALUES 
(1, 'Joe', 85000, 1),
(2, 'Henry', 80000, 1),
(3, 'Sam', 60000, 2),
(4, 'Max', 90000, 1),
(5, 'Janet', 69000, 1),
(6, 'Randy', 85000, 1),
(7, 'Will', 70000, 1),
(8, 'Alice', 90000, 2);
`,
    starterCode: `WITH RankedSalaries AS (\n    SELECT \n        d.name AS Department,\n        e.name AS Employee,\n        e.salary AS Salary,\n        DENSE_RANK() OVER (PARTITION BY ... ORDER BY ... DESC) AS rnk\n    FROM Employee e\n    JOIN Department d ON e.departmentId = d.id\n)\nSELECT Department, Employee, Salary\nFROM RankedSalaries\nWHERE rnk <= 3\nORDER BY Department, Salary DESC, Employee;\n`,
    solutionSQL: `
WITH RankedSalaries AS (
    SELECT 
        d.name AS Department,
        e.name AS Employee,
        e.salary AS Salary,
        DENSE_RANK() OVER (PARTITION BY e.departmentId ORDER BY e.salary DESC) AS rnk
    FROM Employee e
    JOIN Department d ON e.departmentId = d.id
)
SELECT Department, Employee, Salary
FROM RankedSalaries
WHERE rnk <= 3
ORDER BY Department, Salary DESC, Employee;
`,
    expectedColumns: ["Department", "Employee", "Salary"],
    orderMatters: true
  },
  {
    id: "dedup-4",
    topicId: "deduplication",
    title: "33. Deduplicación Permisiva: Retener Empates con RANK()",
    difficulty: "Medium",
    description: `
En sistemas contables y de auditoría, a menudo se exige reportar **todas** las transacciones que alcanzaron el monto máximo por cliente, en lugar de descartar una arbitrariamente.
Dada la tabla \`CustomerOrders\`, reporta el \`customer_id\`, \`order_id\`, \`amount\` y \`order_date\` correspondientes a la compra más alta de cada cliente. 
Si un cliente tiene múltiples órdenes empatadas con el mismo monto máximo idéntico, **debes reportar todas ellas** (usando \`RANK() = 1\`).

Columnas: \`customer_id\`, \`order_id\`, \`amount\`, \`order_date\`.
Ordena por \`customer_id\` ASC, \`order_id\` ASC.

### Tabla: \`CustomerOrders\`
| order_id | customer_id | amount | order_date |
| :--- | :--- | :--- | :--- |
| 1 | 101 | 500.00 | 2023-01-15 |
| 2 | 101 | 500.00 | 2023-02-20 |
| 3 | 101 | 200.00 | 2023-03-01 |
| 4 | 102 | 1200.00 | 2023-01-10 |
| 5 | 102 | 800.00 | 2023-02-05 |
| 6 | 103 | 350.00 | 2023-01-12 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS CustomerOrders;
CREATE TABLE CustomerOrders (order_id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10,2), order_date DATE);
`,
    seedDML: `
INSERT INTO CustomerOrders VALUES 
(1, 101, 500.00, '2023-01-15'),
(2, 101, 500.00, '2023-02-20'),
(3, 101, 200.00, '2023-03-01'),
(4, 102, 1200.00, '2023-01-10'),
(5, 102, 800.00, '2023-02-05'),
(6, 103, 350.00, '2023-01-12');
`,
    starterCode: `WITH RankedOrders AS (\n    SELECT \n        customer_id,\n        order_id,\n        amount,\n        order_date,\n        RANK() OVER (PARTITION BY ... ORDER BY ... DESC) AS rnk\n    FROM CustomerOrders\n)\nSELECT customer_id, order_id, amount, order_date\nFROM RankedOrders\nWHERE rnk = 1\nORDER BY customer_id, order_id;\n`,
    solutionSQL: `
WITH RankedOrders AS (
    SELECT 
        customer_id, 
        order_id, 
        amount, 
        order_date,
        RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rnk
    FROM CustomerOrders
)
SELECT customer_id, order_id, amount, order_date
FROM RankedOrders
WHERE rnk = 1
ORDER BY customer_id, order_id;
`,
    expectedColumns: ["customer_id", "order_id", "amount", "order_date"],
    orderMatters: true
  },
  {
    id: "window-7",
    topicId: "window_functions",
    title: "34. Comparativa de Rankings: ROW_NUMBER vs RANK vs DENSE_RANK",
    difficulty: "Easy",
    description: `
Para dominar y visualizar la diferencia matemática exacta entre las tres funciones de ranking de SQL, calcula las tres simultáneamente para cada estudiante según su calificación (\`score\`).
Retorna: \`student_name\`, \`score\`, \`row_num\`, \`rank_num\`, \`dense_rank_num\`.

- Para \`row_num\`: desempata alfabéticamente por \`student_name ASC\` (\`ORDER BY score DESC, student_name ASC\`).
- Para \`rank_num\`: ordena por \`score DESC\`.
- Para \`dense_rank_num\`: ordena por \`score DESC\`.

Ordena la consulta final por \`score\` DESC, \`student_name\` ASC.

### Tabla: \`ExamScores\`
| id | student_name | score |
| :--- | :--- | :--- |
| 1 | Alice | 100 |
| 2 | Bob | 100 |
| 3 | Charlie | 90 |
| 4 | David | 85 |
| 5 | Eva | 85 |
| 6 | Frank | 70 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS ExamScores;
CREATE TABLE ExamScores (id INT PRIMARY KEY, student_name VARCHAR(50), score INT);
`,
    seedDML: `
INSERT INTO ExamScores VALUES 
(1, 'Alice', 100),
(2, 'Bob', 100),
(3, 'Charlie', 90),
(4, 'David', 85),
(5, 'Eva', 85),
(6, 'Frank', 70);
`,
    starterCode: `SELECT \n    student_name,\n    score,\n    ROW_NUMBER() OVER (...) AS row_num,\n    RANK() OVER (...) AS rank_num,\n    DENSE_RANK() OVER (...) AS dense_rank_num\nFROM ExamScores\nORDER BY score DESC, student_name ASC;\n`,
    solutionSQL: `
SELECT 
    student_name,
    score,
    ROW_NUMBER() OVER (ORDER BY score DESC, student_name ASC) AS row_num,
    RANK() OVER (ORDER BY score DESC) AS rank_num,
    DENSE_RANK() OVER (ORDER BY score DESC) AS dense_rank_num
FROM ExamScores
ORDER BY score DESC, student_name ASC;
`,
    expectedColumns: ["student_name", "score", "row_num", "rank_num", "dense_rank_num"],
    orderMatters: true
  }
,
  {
    id: "exists-1",
    topicId: "exists_predicates",
    title: "35. Clientes con Compras de Alto Valor (EXISTS / Semi-Join)",
    difficulty: "Easy",
    description: `
Escribe una consulta SQL para reportar los clientes (\`id\`, \`name\`) que hayan realizado al menos una compra con un monto estrictamente mayor a 500 (\`amount > 500\`).
Cada cliente debe aparecer **a lo sumo una vez** en el resultado (sin filas duplicadas).

### Tabla: \`Customers\`
| id | name |
| :--- | :--- |
| 1 | Alice |
| 2 | Bob |
| 3 | Charlie |
| 4 | David |

### Tabla: \`Purchases\`
| id | customer_id | amount | purchase_date |
| :--- | :--- | :--- | :--- |
| 101 | 1 | 750.00 | 2026-01-10 |
| 102 | 1 | 900.00 | 2026-02-14 |
| 103 | 2 | 250.00 | 2026-02-01 |
| 104 | 4 | 500.01 | 2026-03-05 |
| 105 | 4 | 150.00 | 2026-03-06 |

### Formato de Salida
| id | name |
| :--- | :--- |
| 1 | Alice |
| 4 | David |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Purchases;
DROP TABLE IF EXISTS Customers;
CREATE TABLE Customers (id INT PRIMARY KEY, name VARCHAR(50));
CREATE TABLE Purchases (id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10, 2), purchase_date DATE);
`,
    seedDML: `
INSERT INTO Customers VALUES 
(1, 'Alice'), 
(2, 'Bob'), 
(3, 'Charlie'), 
(4, 'David');

INSERT INTO Purchases VALUES 
(101, 1, 750.00, '2026-01-10'),
(102, 1, 900.00, '2026-02-14'),
(103, 2, 250.00, '2026-02-01'),
(104, 4, 500.01, '2026-03-05'),
(105, 4, 150.00, '2026-03-06');
`,
    starterCode: `SELECT c.id, c.name\nFROM Customers c\nWHERE EXISTS (\n    SELECT 1\n    FROM Purchases p\n    WHERE ...\n);\n`,
    solutionSQL: `
SELECT c.id, c.name
FROM Customers c
WHERE EXISTS (
    SELECT 1
    FROM Purchases p
    WHERE p.customer_id = c.id
      AND p.amount > 500
);
`,
    expectedColumns: ["id", "name"],
    orderMatters: false
  },
  {
    id: "exists-2",
    topicId: "exists_predicates",
    title: "36. Departamentos sin Empleados Activos (NOT EXISTS Anti-Join)",
    difficulty: "Medium",
    description: `
Reporta todos los departamentos (\`dept_id\`, \`dept_name\`) que **no** tengan ningún empleado asignado con estado \`ACTIVE\`.
Esto incluye departamentos que no tengan ningún empleado, o departamentos cuyos empleados estén todos inactivos (\`INACTIVE\` u otro estado).

> **Trampa de Entrevista:** Observa que en la tabla \`Employees\` puede haber empleados huérfanos con \`department_id = NULL\`. Tu consulta debe ser 100% inmune a la lógica trivalente de nulos (3VL).

### Tabla: \`Departments\`
| dept_id | dept_name |
| :--- | :--- |
| 10 | Engineering |
| 20 | Sales |
| 30 | Research |
| 40 | Legal |

### Tabla: \`Employees\`
| emp_id | name | department_id | status |
| :--- | :--- | :--- | :--- |
| 1 | John | 10 | ACTIVE |
| 2 | Sarah | 10 | INACTIVE |
| 3 | Mike | 20 | INACTIVE |
| 4 | Jessica | NULL | ACTIVE |

### Formato de Salida
| dept_id | dept_name |
| :--- | :--- |
| 20 | Sales |
| 30 | Research |
| 40 | Legal |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Employees;
DROP TABLE IF EXISTS Departments;
CREATE TABLE Departments (dept_id INT PRIMARY KEY, dept_name VARCHAR(50));
CREATE TABLE Employees (emp_id INT PRIMARY KEY, name VARCHAR(50), department_id INT, status VARCHAR(20));
`,
    seedDML: `
INSERT INTO Departments VALUES 
(10, 'Engineering'), 
(20, 'Sales'), 
(30, 'Research'), 
(40, 'Legal');

INSERT INTO Employees VALUES 
(1, 'John', 10, 'ACTIVE'),
(2, 'Sarah', 10, 'INACTIVE'),
(3, 'Mike', 20, 'INACTIVE'),
(4, 'Jessica', NULL, 'ACTIVE');
`,
    starterCode: `SELECT d.dept_id, d.dept_name\nFROM Departments d\nWHERE NOT EXISTS (\n    SELECT 1\n    FROM Employees e\n    WHERE ...\n);\n`,
    solutionSQL: `
SELECT d.dept_id, d.dept_name
FROM Departments d
WHERE NOT EXISTS (
    SELECT 1
    FROM Employees e
    WHERE e.department_id = d.dept_id
      AND e.status = 'ACTIVE'
);
`,
    expectedColumns: ["dept_id", "dept_name"],
    orderMatters: false
  }
];