import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { advancedTopics } from './problems_advanced.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const topics = [
  {
    id: "nulls",
    title: "Manejo de Nulos y Lógica Trivalente",
    badge: "Fundamentos Críticos",
    icon: "ShieldAlert",
    summary: "Domina la lógica trivalente de SQL (TRUE, FALSE, UNKNOWN), IFNULL vs COALESCE, trampas de agregación y anti-joins seguros.",
    guide: `
# 🛡️ Manejo de Nulos y Lógica Trivalente en SQL

En el modelo relacional formal de Edgar F. Codd, \`NULL\` **no es un valor**, ni un tipo de dato escalar, ni una cadena vacía (\`""\`), ni el número cero (\`0\`). Representa formalmente un marcador de estado: **ausencia de información o un valor desconocido (UNKNOWN)**. Tratar a los nulos con intuición booleana tradicional es una de las fuentes más graves de bugs silenciosos, cálculos financieros erróneos y pérdidas de rendimiento en bases de datos de producción.

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Consultas (Logical Query Processing)

### El Motor de Lógica Trivalente (Three-Valued Logic - 3VL)
A diferencia de los lenguajes imperativos donde los predicados booleanos son binarios (\`TRUE\` o \`FALSE\`), el estándar ANSI SQL opera bajo el álgebra de **Lógica Trivalente (3VL)** con tres estados de verdad posibles:
- \`TRUE\`
- \`FALSE\`
- \`UNKNOWN\`

Cuando se evalúa cualquier operador de comparación relacional o aritmético (\`=\`, \`!=\`, \`<\`, \`>\`, \`+\`, \`-\`) contra un operando \`NULL\` (incluso \`NULL = NULL\` o \`NULL != NULL\`), el motor no puede afirmar ni negar la relación: el resultado formal es **\`UNKNOWN\`**.

### El Pipeline Lógico de Evaluación
En la arquitectura del optimizador de consultas SQL, las cláusulas se procesan en un orden lógico estricto:
\`FROM\` ➔ \`WHERE\` ➔ \`GROUP BY\` ➔ \`HAVING\` ➔ \`WINDOW\` ➔ \`SELECT\` ➔ \`DISTINCT\` ➔ \`ORDER BY\` ➔ \`LIMIT\`.
El tratamiento de los valores nulos varía drásticamente según la etapa del pipeline:

1. **En Cláusulas de Filtrado (\`WHERE\` y \`HAVING\`):**
   El motor aplica el principio de **aceptación estricta de verdad**: únicamente sobreviven aquellas tuplas cuyo predicado evalúa de forma certera a **\`TRUE\`**. Las filas que evalúan a \`FALSE\` o a \`UNKNOWN\` son **descartadas silenciosamente**.
   \`\`\`sql
   -- Supongamos una fila donde status es NULL:
   -- status = 'ACTIVE'      ➔ UNKNOWN (DESCARTADA)
   -- status != 'ACTIVE'     ➔ UNKNOWN (DESCARTADA)
   -- NOT (status = 'ACTIVE') ➔ NOT (UNKNOWN) = UNKNOWN (¡DESCARTADA TAMBIÉN!)
   \`\`\`

2. **En Agrupación y Particionado (\`GROUP BY\` y \`PARTITION BY\`):**
   A diferencia del filtrado relacional, en las fases de particionado el estándar SQL trata a todos los valores \`NULL\` como **equivalentes entre sí**, colapsándolos en una **única partición o cubo de resumen**. Si una tabla contiene 10,000 filas con \`NULL\` en la columna agrupada, el resultado contendrá un único registro representativo para dicho grupo.

3. **En Ordenamiento (\`ORDER BY\`):**
   El estándar ANSI SQL deja la posición de los nulos como *implementation-defined*. En **MySQL 8.0**, los valores \`NULL\` son tratados como los **valores mínimos absolutos**:
   - En orden ascendente (\`ASC\`), los nulos se ubican al **inicio absoluto**.
   - En orden descendente (\`DESC\`), los nulos se ubican al **final**.
   *Modismo Staff Engineer para forzar \`NULLS LAST\` en MySQL sin soporte de sintaxis nativa:*
   \`\`\`sql
   ORDER BY (col IS NULL) ASC, col ASC;
   \`\`\`

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Matriz de Verdad Completa del Álgebra 3VL
\`\`\`text
┌───────────┬───────────┬───────────┬───────────┐
│ Operación │ TRUE      │ FALSE     │ UNKNOWN   │
├───────────┼───────────┼───────────┼───────────┤
│ AND       │           │           │           │
│   TRUE    │ TRUE      │ FALSE     │ UNKNOWN   │
│   FALSE   │ FALSE     │ FALSE     │ FALSE     │
│   UNKNOWN │ UNKNOWN   │ FALSE     │ UNKNOWN   │
├───────────┼───────────┼───────────┼───────────┤
│ OR        │           │           │           │
│   TRUE    │ TRUE      │ TRUE      │ TRUE      │
│   FALSE   │ TRUE      │ FALSE     │ UNKNOWN   │
│   UNKNOWN │ TRUE      │ UNKNOWN   │ UNKNOWN   │
├───────────┼───────────┼───────────┼───────────┤
│ NOT       │ FALSE     │ TRUE      │ UNKNOWN   │
└───────────┴───────────┴───────────┴───────────┘
\`\`\`

### Flujo de Filtrado de Tuplas en el Pipeline Lógico
\`\`\`text
 Tupla Entrante: [EmpID: 402, Salario: 4500, Bono: NULL, Estado: 'ACTIVO']
                               │
                               ▼
            Evaluación: ¿Bono > 500 AND Estado = 'ACTIVO'?
                               │
        ┌──────────────────────┴──────────────────────┐
        ▼                                             ▼
  Bono > 500                                  Estado = 'ACTIVO'
  (NULL > 500)                                ('ACTIVO' = 'ACTIVO')
        │                                             │
     UNKNOWN                                         TRUE
        │                                             │
        └──────────────────────┬──────────────────────┘
                               ▼
                    UNKNOWN AND TRUE = UNKNOWN
                               │
                               ▼
                     ¿Resultado es TRUE?
           ├── SÍ ──► Pasa a proyección / agregación
           └── NO (FALSE o UNKNOWN) ──► 💥 DESCARTE SILENCIOSO DE LA FILA
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### Almacenamiento Físico en InnoDB: El NULL Value Bitmap
En los formatos de almacenamiento físico modernos de InnoDB (\`DYNAMIC\` y \`COMPACT\`), las columnas declaradas como *nullable* optimizan el espacio en disco y memoria del buffer pool mediante una cabecera binaria:
1. **NULL Value Bitmap:** Cada registro de fila almacena un mapa de bits en su cabecera. Se reserva exactamente **1 bit por cada columna nullable**, redondeado hacia arriba al byte más próximo.
2. **Ahorro en Disco:** Si el bit asignado a una columna es \`1\`, dicha columna es \`NULL\` y no consume bytes adicionales en la sección de datos del registro ni almacena marcadores de longitud variable.
3. **Sobrecarga de Cabecera:** En tablas anchas con cientos de columnas nulas, el bitmap puede sumar varios bytes por tupla, afectando la densidad de registros por página de 16KB.

### Árboles B+ Tree e Índices Secundarios
- **Ubicación en Hojas B-Tree:** En los índices B+ Tree de InnoDB, los valores \`NULL\` se posicionan como los valores algebraicamente más pequeños, situándose siempre en el extremo izquierdo de las páginas hoja.
- **Ruta de Acceso \`ref_or_null\` en EXPLAIN:** Cuando una consulta ejecuta un predicado del tipo \`WHERE index_col = 'X' OR index_col IS NULL\`, el optimizador de consultas de MySQL activa el modo de acceso \`ref_or_null\`. Este algoritmo realiza una lectura puntual sobre la clave solicitada y simultáneamente escanea el rango inicial de nulos en una sola pasada de índice, evitando la degradación a un Full Table Scan (\`type: ALL\`).
- **Comportamiento en Restricciones UNIQUE:** En MySQL InnoDB, un índice único **permite múltiples filas con valor \`NULL\`**. Dado que formalmente \`NULL != NULL\`, dos filas con nulos no violan la restricción de unicidad relacional.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. El Operador Spaceship (\`<=>\`) de MySQL
Para evaluar igualdad segura frente a nulos (*NULL-safe equality*) sin bifurcar la consulta con cláusulas \`OR\`, MySQL implementa el operador \`<=>\`:
\`\`\`sql
-- Evalúa a 1 (TRUE) si ambos lados son NULL o si coinciden exactamente.
-- Evalúa a 0 (FALSE) si un lado es NULL y el otro no.
-- NUNCA evalúa a UNKNOWN.
SELECT * FROM Customers WHERE referral_id <=> NULL;
\`\`\`

### 2. \`COALESCE\` (Estándar ANSI) vs \`IFNULL\` (MySQL Propietario)
\`\`\`sql
-- ✅ ESTÁNDAR ANSI: Evaluación perezosa (short-circuit) con N argumentos:
SELECT COALESCE(work_email, personal_email, fallback_email, 'no-reply@domain.com') AS contact;

-- ⚠️ MYSQL PROPIETARIO: Restringido estrictamente a 2 argumentos:
SELECT IFNULL(commission_pct, 0.0) AS safe_commission;
\`\`\`

### 3. División Aritmética Segura con \`NULLIF\`
\`NULLIF(expr1, expr2)\` retorna \`NULL\` cuando ambos argumentos son idénticos; en caso contrario retorna \`expr1\`. Es el patrón estándar para erradicar excepciones de división por cero:
\`\`\`sql
-- Si active_subscribers es 0, NULLIF retorna NULL; el cociente resulta en NULL;
-- COALESCE intercepta el NULL y devuelve un ratio limpio de 0.00:
SELECT 
    tenant_id,
    ROUND(COALESCE(total_mrr / NULLIF(active_subscribers, 0), 0.00), 2) AS arpu
FROM TenantMetrics;
\`\`\`

### 4. Anti-Join Canónico de Alto Rendimiento
La forma más eficiente y resistente a fallos para encontrar entidades en A sin correspondencia en B:
\`\`\`sql
SELECT a.id, a.company_name
FROM Accounts a
LEFT JOIN Subscriptions s ON a.id = s.account_id
WHERE s.account_id IS NULL;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: La Trampa Fatal de \`NOT IN\` con Nulos
Si la subconsulta ejecutada dentro de un operador \`NOT IN\` devuelve **un solo registro con valor \`NULL\`**, la consulta completa retornará **cero filas para siempre**, silenciando datos críticos de negocio:
\`\`\`sql
-- ❌ BUG CRÍTICO EN PRODUCCIÓN:
-- Si Orders contiene un solo pedido huérfano con customer_id NULL, no devuelve nada:
SELECT id, name FROM Customers 
WHERE id NOT IN (SELECT customer_id FROM Orders);

-- 🔍 Demostración Matemática del Fallo:
-- '105' NOT IN (101, 102, NULL)
-- ➔ NOT ('105' = 101 OR '105' = 102 OR '105' = NULL)
-- ➔ NOT (FALSE OR FALSE OR UNKNOWN)
-- ➔ NOT (UNKNOWN) ➔ UNKNOWN
-- Dado que UNKNOWN no es TRUE, la fila 105 es descartada. Esto ocurre para TODAS las filas.

-- ✅ SOLUCIÓN CANÓNICA STAFF ENGINEER (NOT EXISTS):
SELECT c.id, c.name 
FROM Customers c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders o WHERE o.customer_id = c.id
);
\`\`\`

### Antipatrón 2: Contaminación Aritmética Silenciosa
En SQL, cualquier cálculo aritmético donde intervenga un \`NULL\` produce inexorablemente \`NULL\`:
\`\`\`sql
-- ❌ ERROR: Si bonus es NULL, total_comp resulta en NULL para todo el registro:
SELECT employee_id, base_salary + bonus AS total_comp FROM Payroll;

-- ✅ REFACTORIZACIÓN ROBUSTA:
SELECT employee_id, base_salary + COALESCE(bonus, 0) AS total_comp FROM Payroll;
\`\`\`

### Antipatrón 3: La Distorsión de Funciones de Agregación
\`\`\`sql
-- Supongamos la tabla Ventas con montos: [100, 200, NULL]
SELECT COUNT(*) FROM Ventas;          -- ➔ Retorna 3 (cuenta filas físicas del conjunto)
SELECT COUNT(monto) FROM Ventas;      -- ➔ Retorna 2 (ignora silenciosamente los NULLs)
SELECT COUNT(DISTINCT monto) FROM Ventas; -- ➔ Retorna 2 (ignora nulos por definición ANSI)
SELECT AVG(monto) FROM Ventas;        -- ➔ Retorna 150.00 ((100 + 200) / 2, ¡NO divide entre 3!)
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Heurística de la Fila Oculta:** Cada vez que una consulta involucre un \`LEFT JOIN\` o columnas no restringidas con \`NOT NULL\`, asume de inmediato que existirán nulos en los casos de prueba ocultos. Escribe tus predicados con \`IS NULL\` o \`COALESCE\` desde el primer borrador.
2. **Proscripción de \`NOT IN\` en Entrevistas de Algoritmos SQL:** En desafíos técnicos de HackerRank Advanced o LeetCode SQL 50, sustituye por regla refleja \`NOT IN\` por \`NOT EXISTS\` o un Anti-Join con \`LEFT JOIN ... WHERE right.pk IS NULL\`. Esto previene descalificaciones por casos borde con claves foráneas nulas.
3. **Agregaciones Defensivas en Cierre Contable:** Si un subconjunto filtrado está vacío o todas sus filas tienen columnas nulas, \`SUM(monto)\` retornará \`NULL\` y no cero. En cualquier pipeline de conciliación bancaria o métrica de retención, envuelve siempre las agregaciones en \`COALESCE(SUM(monto), 0)\`.
`
  },
  {
    id: "rounding",
    title: "Operaciones Numéricas y Redondeo",
    badge: "Matemática & Precisión",
    icon: "Calculator",
    summary: "Aprende ROUND, TRUNCATE, FLOOR, CEIL y la técnica de división segura con NULLIF para evitar errores fatales en métricas de negocio.",
    guide: `
# 🔢 Operaciones Numéricas y Redondeo en SQL

En sistemas transaccionales, auditoría contable y pipelines de datos empresariales, los errores de redondeo acumulativo (*penny drift*) o una excepción no controlada por división por cero provocan discrepancias financieras graves y fallos críticos en producción. Comprender la representación física de los tipos de datos numéricos y el comportamiento del optimizador de MySQL 8.0 es esencial para diseñar consultas con precisión matemática determinista.

---

## 1. Fundamentos Teóricos: Tipos Numéricos Exactos vs Aproximados

### Datos de Punto Fijo Exacto (\`DECIMAL\` / \`NUMERIC\`)
El estándar ANSI SQL y el motor InnoDB de MySQL implementan el tipo \`DECIMAL(M, D)\` (donde $M$ es la precisión total de 1 a 65 dígitos y $D$ es la escala o número de decimales de 0 a 30):
- **Almacenamiento Binario en Base 10:** MySQL empaqueta los números decimales en bloques binarios compactos de 9 dígitos (cada bloque consume exactamente 4 bytes, más los bytes residuales necesarios para la fracción).
- **Aritmética Exacta:** Las sumas, multiplicaciones y redondeos sobre columnas \`DECIMAL\` se calculan mediante rutinas aritméticas internas sin intervención de la unidad de punto flotante (FPU) de la CPU. No existe pérdida de precisión ni representación aproximada.
- **Mandato Corporativo:** Obligatorio para contabilidad, pasarelas de pago, balance patrimonial, facturación e inventario.

### Datos de Punto Flotante Binario (\`FLOAT\` y \`DOUBLE\`)
- **Estándar IEEE 754:** \`FLOAT\` (4 bytes, ~7 dígitos significativos) y \`DOUBLE\` (8 bytes, ~15 dígitos significativos) almacenan valores en formato binario normalizado (signo, mantisa y exponente).
- **La Falacia Binaria:** Números decimales simples como $0.1$ o $0.2$ carecen de representación binaria finita (son fracciones periódicas infinitas en base 2).
  \`\`\`sql
  -- Demostración de imprecisión en punto flotante:
  SELECT (0.1 + 0.2) = 0.3 AS float_equality; 
  -- ➔ Retorna 0 (FALSE), porque 0.1 + 0.2 evalúa a 0.30000000000000004
  \`\`\`
- **Caso de Uso:** Apropiado únicamente para analítica científica, coordenadas GPS, lecturas de telemetría IoT o modelos estadísticos donde la velocidad de hardware prime sobre la precisión al centavo.

---

## 2. Modelos Mentales Visuales de Funciones Numéricas en Diagramas ASCII

### Comparación de Precisión: IEEE 754 Float vs DECIMAL Exacto
\`\`\`text
┌───────────────┬───────────────┐
│ FLOAT (IEEE) │ DECIMAL (Ex) │
├───────────────┼───────────────┤
│ 0.1+0.2!=0.3 │ 0.1+0.2=0.30 │
│ Binario aprx │ Base-10 exac │
└───────────────┴───────────────┘
\`\`\`

### Comparación de Comportamiento en la Recta Numérica Real
\`\`\`text
 Valor x de Entrada:    -12.8    -12.2     0.0     12.2     12.8     Semántica de Vector
 ---------------------------------------------------------------------------------------
 FLOOR(x)                -13      -13       0       12       12      Hacia -infinito (Piso)
 TRUNCATE(x, 0)          -12      -12       0       12       12      Hacia el cero (Corte)
 ROUND(x, 0)             -13      -12       0       12       13      Al más cercano (Medio lejos)
 CEIL(x) / CEILING(x)    -12      -12       0       13       13      Hacia +infinito (Techo)
\`\`\`

### Diagrama de Flujo: Preservación de Escala en Porcentajes y Ratios
\`\`\`text
  Datos Crudos (Enteros):  [Completados: 45, Totales: 200]
                                │
                                ▼
        ¿División Entera o Forzado Decimal?
        ├── ❌ 45 / 200 en motores estrictos ──► 0 (Pérdida total de datos)
        └── ✅ 100.0 * 45 / 200 ──────────────► 22.5000 (Escala decimal preservada)
                                │
                                ▼
                        ROUND(..., 2)
                                │
                                ▼
                     Resultado Final: 22.50%
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 y Optimizador de Consultas

### Algoritmo de Redondeo: Round-Half-Away-From-Zero
En MySQL 8.0, cuando se invoca \`ROUND(X, D)\` sobre tipos \`DECIMAL\`, el motor aplica deterministamente la regla **"redondeo de la mitad hacia afuera de cero"** (*round half away from zero*):
- \`ROUND(2.5) = 3\` y \`ROUND(3.5) = 4\`
- \`ROUND(-2.5) = -3\` y \`ROUND(-3.5) = -4\`
*Nota de Arquitectura:* A diferencia de Python o entornos de analítica que aplican *Banker's Rounding* (redondeo hacia el número par más cercano para mitigar sesgo estadístico), el estándar SQL en MySQL garantiza consistencia simétrica sobre datos decimales.

### Almacenamiento Físico de DECIMAL en InnoDB
InnoDB codifica los tipos \`DECIMAL(M, D)\` empacando cada bloque de 9 dígitos decimales en 4 bytes enteros:
\`\`\`text
Dígitos Residuales:   0   1-2   3-4   5-6   7-9
Bytes Consumidos:     0    1     2     3     4
\`\`\`
Por ejemplo, un campo \`DECIMAL(18, 4)\` posee 14 dígitos enteros y 4 decimales. Los enteros consumen 9 dígitos (4 bytes) + 5 dígitos (3 bytes) = 7 bytes. Los decimales consumen 4 dígitos = 2 bytes. Total físico: 9 bytes exactos en disco por tupla, sin sobrecarga de emulación en memoria.

### División Aritmética y Modos de Motor (\`sql_mode\`)
- **Operador \`/\` vs \`DIV\`:** El operador \`/\` efectúa división estándar retornando un tipo con escala extendida (regida por la variable del sistema \`div_precision_increment\`, por defecto 4 decimales adicionales sobre la escala del dividendo). Por el contrario, el operador \`DIV\` efectúa división entera truncando inmediatamente todo residuo.
- **La Trampa de \`ERROR_FOR_DIVISION_BY_ZERO\`:**
  * Si la variable \`sql_mode\` incluye \`ERROR_FOR_DIVISION_BY_ZERO\` y el modo estricto está activo, ejecutar \`x / 0\` en una sentencia de escritura (INSERT/UPDATE) **aborta la transacción con error fatal**.
  * En consultas \`SELECT\` permisivas retorna \`NULL\` emitiendo un *Warning*.

### Pérdida Crítica de SARGabilidad por Funciones Numéricas
Envolver una columna indexada dentro de una función numérica destruye la capacidad de InnoDB de realizar un *Index Range Scan*:
\`\`\`sql
-- ❌ NO SARGABLE (Full Table Scan O(N), invalida el índice en 'unit_price'):
SELECT * FROM Inventory WHERE ROUND(unit_price) = 15;

-- ✅ SARGABLE (Index Range Scan O(log N), recorre únicamente las hojas B-Tree pertinentes):
SELECT * FROM Inventory 
WHERE unit_price >= 14.50 AND unit_price < 15.50;
\`\`\`

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. El Idioma Canónico de División Segura a Prueba de Fallos
En pipelines de analítica o APIs de negocio, jamás debes permitir que una división por cero se propague o genere registros vacíos:
\`\`\`sql
-- Patrón Staff Engineer: NULLIF convierte 0 a NULL; COALESCE sustituye el resultado por 0.00
SELECT 
    campaign_id,
    ROUND(
        COALESCE(
            (100.0 * conversions) / NULLIF(impressions, 0),
            0.00
        ), 
        2
    ) AS conversion_rate_pct
FROM MarketingCampaigns;
\`\`\`

### 2. Promedios Ponderados Exactos (Weighted Average / SUMPRODUCT)
En valoración de inventarios (método FIFO/PMP) y métricas de satisfacción ponderada por volumen:
\`\`\`sql
SELECT 
    product_id,
    ROUND(
        SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0),
        4
    ) AS weighted_average_cost
FROM StockBatches
GROUP BY product_id;
\`\`\`

### 3. Conversión Explícita con \`CAST\` y Formato de Salida Financiero
Para garantizar precisión en agregaciones o uniones entre esquemas heterogéneos y presentar salidas monetarias con padding estricto:
\`\`\`sql
SELECT 
    order_id,
    CAST(subtotal * (1 + tax_rate) AS DECIMAL(12, 2)) AS invoice_total
FROM OrderHeaders;
\`\`\`

### 4. Normalización de Céntimos con \`TRUNCATE\` vs \`ROUND\`
En cobro de comisiones e intereses moratorios bancarios, las normativas legales a menudo prohíben redondear hacia arriba a favor de la entidad, exigiendo truncamiento estricto:
\`\`\`sql
-- Trunca exactamente al segundo decimal sin sumar céntimos fraccionarios:
SELECT account_id, TRUNCATE(accrued_interest, 2) AS payable_interest
FROM SavingsAccounts;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: El Desastre del Redondeo Prematuro (*Cumulative Penny Drift*)
Uno de los errores más costosos en software empresarial es aplicar \`ROUND()\` fila a fila antes de agregar:
\`\`\`sql
-- ❌ ERROR GRAVE: Redondear antes de sumar acumula sesgo fraccionario:
SELECT SUM(ROUND(item_price * quantity, 2)) AS reported_revenue FROM OrderItems;

-- 🔍 Demostración del Descuadre en 1,000,000 de ítems:
-- Ítem A: 10.004 ➔ ROUND = 10.00 (pérdida de +0.004)
-- Ítem B: 10.004 ➔ ROUND = 10.00 (pérdida de +0.004)
-- Tras 10,000 filas, el libro contable pierde $40.00 dólares reales.

-- ✅ REGLA DE ORO DE PRODUCCIÓN: Sumar con precisión total y redondear al final:
SELECT ROUND(SUM(item_price * quantity), 2) AS reported_revenue FROM OrderItems;
\`\`\`

### Antipatrón 2: Comparación de Igualdad sobre Tipos Flotantes
\`\`\`sql
-- ❌ BUG SILENCIOSO: Falla intermitentemente según la arquitectura del procesador:
SELECT * FROM Transactions WHERE float_amount = 99.95;

-- ✅ SOLUCIÓN CON TOLERANCIA ÉPSILON O MIGRACIÓN A DECIMAL:
SELECT * FROM Transactions WHERE ABS(float_amount - 99.95) < 0.0001;
\`\`\`

### Antipatrón 3: Desbordamiento Silencioso por Escala Insuficiente
Declarar \`DECIMAL(5, 2)\` permite un valor máximo de \`999.99\`. Al procesar una transacción de \`1000.00\`, MySQL en modo estricto aborta con \`Out of range value for column\`. Siempre dimensiona holgadamente la precisión entera:
\`\`\`sql
-- DECIMAL(precision, scale):
-- precision = total de dígitos (enteros + decimales)
-- Para almacenar hasta 999,999,999.99 necesitas DECIMAL(11, 2)
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Heurística de la Multiplicación Previa por 100.0:** En problemas de HackerRank donde se evalúa el cálculo de porcentajes (*"calculate the percentage of completed orders rounded to 2 decimal places"*), nunca hagas \`(completed / total) * 100\`. Multiplica siempre el numerador por el literal flotante \`100.0\` antes de dividir: \`ROUND((100.0 * completed) / total, 2)\`. Esto blinda la operación contra truncamientos de división entera en cualquier dialecto SQL.
2. **Chequeo Inmediato de Casos Vacíos:** Los evaluadores automatizados inyectan pruebas de estrés donde la tabla de entrada no tiene filas coincidentes. Asegúrate de que tu solución entregue \`0.00\` o \`NULL\` según lo especificado en la rúbrica usando \`COALESCE(ROUND(...), 0.00)\`.
3. **Aislamiento de Precisión en Capas CTE:** Mantén todos los cálculos numéricos con precisión decimal extendida en las capas intermedias del pipeline (\`DECIMAL(18, 6)\`) y reserva la función \`ROUND()\` exclusivamente para la cláusula \`SELECT\` terminal de presentación.
`
  },
  {
    id: "joins",
    title: "Joins Avanzados y Topologías Multitabla",
    badge: "Álgebra Relacional",
    icon: "Network",
    summary: "Diferencia crítica entre ON y WHERE en LEFT JOIN, joins de 3+ tablas, self-joins y optimización de predicados.",
    guide: `
# 🔗 Joins Avanzados y Topologías Multitabla en SQL

En el álgebra relacional de Edgar F. Codd, los operadores de reunión (*Joins*) constituyen el núcleo algorítmico del lenguaje SQL. Dominar la mecánica interna de acoplamiento de tuplas, el **orden de procesamiento lógico** y las estrategias del optimizador de MySQL 8.0 (Nested Loop vs Hash Join) es lo que separa a un desarrollador promedio de un Staff Data Engineer capaz de diseñar arquitecturas analíticas que escalen a cientos de millones de registros sin colapsar la memoria del motor.

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Joins

### Las 4 Etapas Formales del Procesamiento Lógico
A nivel conceptual y formal, el motor relacional procesa un \`JOIN\` a través de cuatro transformaciones sucesivas:
1. **Producto Cartesiano ($A \times B$):** Genera conceptualmente una tabla cruzada con todas las combinaciones posibles de tuplas entre la tabla izquierda ($N$ filas) y la tabla derecha ($M$ filas), produciendo $N \times M$ tuplas virtuales.
2. **Evaluación del Predicado \`ON\`:** Se aplica el predicado de enlace. Solo aquellas tuplas combinadas cuya condición evalúa estrictamente a \`TRUE\` avanzan a la siguiente etapa.
3. **Adición de Filas Externas (*Outer Row Generation*):** Si el join es externo (\`LEFT\`, \`RIGHT\` o \`FULL OUTER\`), cualquier fila de la tabla preservada que no encontró coincidencia en el paso 2 es reinyectada en el conjunto de resultados, rellenando todos los atributos de la tabla opuesta con valores \`NULL\`.
4. **Filtrado Posterior en Cláusula \`WHERE\`:** Se evalúan las condiciones de filtrado global sobre el conjunto extendido proveniente del paso 3.

### La Trampa de Oro: \`ON\` vs \`WHERE\` en un \`LEFT JOIN\`
Comprender la separación entre el paso 2 y el paso 4 explica el bug más común en código SQL empresarial:
\`\`\`sql
-- CASO A: Condición en la cláusula ON (Paso 2)
SELECT c.id, c.name, o.amount
FROM Customers c
LEFT JOIN Orders o ON c.id = o.customer_id AND o.status = 'COMPLETED';
-- RESULTADO: Preserva al 100% de los clientes. Si un cliente no posee órdenes completadas,
-- sus columnas de orden retornan como NULL. La preservación externa sigue activa.

-- CASO B: Condición en la cláusula WHERE (Paso 4)
SELECT c.id, c.name, o.amount
FROM Customers c
LEFT JOIN Orders o ON c.id = o.customer_id
WHERE o.status = 'COMPLETED';
-- RESULTADO: ¡EL LEFT JOIN SE CONVIERTE SILENCIOSAMENTE EN UN INNER JOIN!
-- En el Paso 3 se generaron filas con o.status = NULL para clientes sin órdenes.
-- En el Paso 4, el WHERE evalúa: NULL = 'COMPLETED' ➔ UNKNOWN.
-- Por la regla de 3VL, todas esas filas son descartadas silenciosamente.
\`\`\`

### Emulación de \`FULL OUTER JOIN\` en MySQL 8.0
MySQL no cuenta con la palabra clave nativa \`FULL OUTER JOIN\`. El modismo canónico y formal para lograrlo consiste en unir un \`LEFT JOIN\` con un \`RIGHT JOIN\` mediante el operador de conjunto \`UNION\` (el cual deduplica las tuplas del producto interior central):
\`\`\`sql
SELECT a.id AS a_id, a.name, b.id AS b_id, b.salary
FROM Employees a
LEFT JOIN Contractors b ON a.id = b.id
UNION
SELECT a.id AS a_id, a.name, b.id AS b_id, b.salary
FROM Employees a
RIGHT JOIN Contractors b ON a.id = b.id;
\`\`\`

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Diagramas de Conjuntos y Ruteo de Tuplas
\`\`\`text
 INNER JOIN: (Intersección Pura)     LEFT OUTER JOIN: (Preserva Izquierda)
   Tabla A       Tabla B               Tabla A       Tabla B
  ┌───────┬───────┬───────┐           ┌───────┬───────┬───────┐
  │       │ A ∩ B │       │           │ █ █ █ │ A ∩ B │       │
  │   A   │ █ █ █ │   B   │           │ █ █ █ │ █ █ █ │ (NULL)│
  │       │ █ █ █ │       │           │ █ █ █ │ █ █ █ │       │
  └───────┴───────┴───────┘           └───────┴───────┴───────┘
   Descarta tuplas sin match           Preserva toda A; rellena B con NULL

 ANTI-JOIN: (Exclusión Relacional)    FULL OUTER JOIN: (Unión Completa)
   Tabla A       Tabla B               Tabla A       Tabla B
  ┌───────┬───────┬───────┐           ┌───────┬───────┬───────┐
  │ █ █ █ │       │       │           │ █ █ █ │ A ∩ B │ █ █ █ │
  │ █ █ █ │ (NULL)│   B   │           │ █ █ █ │ █ █ █ │ █ █ █ │
  │ █ █ █ │       │       │           │ █ █ █ │ █ █ █ │ █ █ █ │
  └───────┴───────┴───────┘           └───────┴───────┴───────┘
   A sin correspondencia en B          Preserva A y B completas con NULLs
\`\`\`

### Topología en Estrella (Star Schema) en Data Warehousing
\`\`\`text
          ┌───────────────────────────┐
          │   DimCustomers (1)        │
          └─────────────┬─────────────┘
                        │ (1:N)
                        ▼
┌──────────────┐ (N:1) ┌───────────────────────────┐ (1:N) ┌───────────────────┐
│ DimDates (1) ├──────►│      FACT_SALES (N)       │◄──────┤ DimProducts (1)   │
└──────────────┘       └─────────────┬─────────────┘       └───────────────────┘
                                     │ (N:1)
                                     ▼
                        ┌───────────────────────────┐
                        │    DimStores (1)          │
                        └───────────────────────────┘
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### 1. Index Nested Loop Join (NLJ)
Es el algoritmo de más alta velocidad cuando la tabla secundaria dispone de un índice B+ Tree sobre la columna de reunión:
- **Mecánica:** Para cada fila calificada en la tabla conductora (*Driving Table*), el motor ejecuta una búsqueda logarítmica puntual sobre el índice B-Tree de la tabla interior:
  $$\text{Complejidad Temporal: } O(N \times \log M)$$
- **En EXPLAIN:** Aparece con \`type: ref\` o \`type: eq_ref\`.

### 2. Hash Join (MySQL 8.0.18+)
MySQL 8.0.18 eliminó el obsoleto y lento *Block Nested Loop (BNL)* en favor del moderno **Hash Join**:
- **Fase de Construcción (Build Phase):** El motor toma la tabla de menor tamaño estimado (después de aplicar filtros) y construye una tabla hash en memoria RAM dentro del búfer de sesión (\`join_buffer_size\`).
- **Fase de Sondeo (Probe Phase):** Escanea secuencialmente la tabla mayor y busca coincidencias instantáneas $O(1)$ en la tabla hash:
  $$\text{Complejidad Temporal: } O(N + M)$$
- **En EXPLAIN FORMAT=TREE:** Verás la anotación explícita \`Inner hash join (b.customer_id = a.id)\`.

### 3. Selección de la Tabla Conductora (*Driving Table*)
El optimizador basado en costos (CBO) de MySQL evalúa las estadísticas de índices y calcula qué tabla produce la menor cantidad de filas intermedias para colocarla como tabla conductora. Si las estadísticas son obsoletas o el plan es ineficiente, un Staff Engineer puede forzar el orden con \`STRAIGHT_JOIN\`:
\`\`\`sql
-- Fuerza a MySQL a procesar 'BigDimension' primero sin reordenar:
SELECT STRAIGHT_JOIN *
FROM BigDimension b
JOIN SmallFactTable s ON b.id = s.dim_id;
\`\`\`

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Anti-Join Canónico de Alta Eficiencia
Encontrar registros huérfanos o ausentes sin incurrir en subconsultas lentas:
\`\`\`sql
SELECT u.id, u.email
FROM Users u
LEFT JOIN Orders o ON u.id = o.user_id
WHERE o.user_id IS NULL;
\`\`\`

### 2. Joins No Equitativos (*Non-Equi Joins*) para Dimensiones de Cambio Lento (SCD Tipo 2)
En arquitecturas de Data Warehouse, los hechos deben unirse a la versión histórica de la dimensión vigente al momento exacto en que ocurrió la transacción:
\`\`\`sql
SELECT 
    f.transaction_id,
    f.amount,
    d.customer_segment,
    d.assigned_rep
FROM FactTransactions f
INNER JOIN DimCustomerHistory d 
   ON f.customer_id = d.customer_id
  AND f.transaction_time >= d.valid_from 
  AND f.transaction_time <  d.valid_to;
\`\`\`

### 3. Self-Joins Deterministas para Jerarquías y Redes de Dependencia
Modelado de jerarquías organizacionales (empleado y supervisor directo):
\`\`\`sql
SELECT 
    emp.id AS employee_id,
    emp.name AS employee_name,
    COALESCE(mgr.name, 'TOP EXECUTIVE / BOARD') AS direct_manager
FROM Employees emp
LEFT JOIN Employees mgr ON emp.manager_id = mgr.id;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: La Catástrofe del Doble Fan-Out (Multiplicación Cartesiana)
Ocurre cuando una tabla dimensional se une simultáneamente a dos o más tablas que mantienen una relación 1:N independiente:
\`\`\`sql
-- ❌ BUG CRÍTICO EN FINANZAS:
-- Un Cliente tiene 5 Facturas (1:N) y 10 Tickets de Soporte (1:N).
-- Al unirlos en una sola consulta plana, el join genera 5 * 10 = 50 filas!
SELECT 
    c.id,
    SUM(i.invoice_amount) AS total_invoiced,
    COUNT(t.ticket_id) AS total_tickets
FROM Customers c
LEFT JOIN Invoices i ON c.id = i.customer_id
LEFT JOIN SupportTickets t ON c.id = t.customer_id
GROUP BY c.id;
-- 💥 RESULTADO: ¡total_invoiced se multiplica por 10 y total_tickets se multiplica por 5!

-- ✅ PATRÓN DE ARQUITECTURA STAFF ENGINEER: Pre-agregación en CTEs independientes:
WITH CustomerInvoices AS (
    SELECT customer_id, SUM(invoice_amount) AS total_invoiced
    FROM Invoices
    GROUP BY customer_id
),
CustomerTickets AS (
    SELECT customer_id, COUNT(ticket_id) AS total_tickets
    FROM SupportTickets
    GROUP BY customer_id
)
SELECT 
    c.id,
    c.name,
    COALESCE(ci.total_invoiced, 0.00) AS total_invoiced,
    COALESCE(ct.total_tickets, 0) AS total_tickets
FROM Customers c
LEFT JOIN CustomerInvoices ci ON c.id = ci.customer_id
LEFT JOIN CustomerTickets ct ON c.id = ct.customer_id;
\`\`\`

### Antipatrón 2: El Uso de \`SELECT DISTINCT\` para Enmascarar Joins Rotos
Si un join produce duplicados no deseados debido a una clave foránea no única, aplicar \`SELECT DISTINCT\` oculta el síntoma pero causa estragos:
- Dispara un ordenamiento masivo en disco (*filesort*).
- Oculta errores estructurales en el modelo relacional.
- Incrementa la latencia de la consulta de milisegundos a minutos.

### Antipatrón 3: Discordancia de Tipos o Collation en la Cláusula \`ON\`
\`\`\`sql
-- Si users.code es VARCHAR(20) COLLATE utf8mb4_bin
-- y audit.code es VARCHAR(20) COLLATE utf8mb4_0900_ai_ci:
-- 💥 MySQL no puede comparar las cadenas directamente por índice B-Tree.
-- Fuerza una conversión de collation fila por fila, degradando a Full Table Scan O(N*M).
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **La Regla de Oro de la Cardinalidad:** Antes de escribir una sola línea de código SQL, declara explícitamente la cardinalidad de cada enlace: ¿es 1:1, 1:N o N:M? Si detectas dos ramas 1:N partiendo de la misma entidad raíz, prohíbete a ti mismo unirlas en el mismo \`FROM\`; sepáralas de inmediato en CTEs de pre-agregación.
2. **Inspección Obligatoria con \`EXPLAIN ANALYZE\`:** En cualquier entrevista de diseño de bases de datos o diagnóstico de lentitud, ejecuta \`EXPLAIN ANALYZE\`. Busca si el motor ejecutó un \`Index lookup\` ($O(\log M)$) o un \`Hash join\` en memoria, y vigila si el número de filas reales (*actual rows*) coincide con el estimado (*rows*).
3. **Índices de Cobertura en Claves Foráneas:** Asegúrate de que todas las columnas que figuren en la cláusula \`ON\` de una tabla secundaria dispongan de un índice B+ Tree. La ausencia de un índice en una clave foránea convierte un join de alta concurrencia en un cuello de botella global de contención y bloqueos.
`
  },
  {
    id: "dates",
    title: "Fechas, Marcas de Tiempo e Intervalos",
    badge: "Sintaxis Temporal",
    icon: "Calendar",
    summary: "Manejo completo de DATE, DATETIME y TIMESTAMP: DATEDIFF, DATE_SUB/SUBDATE, rangos, LAST_DAY y la trampa de BETWEEN.",
    guide: `
# 📅 Fechas, Marcas de Tiempo e Intervalos en MySQL

El modelado y filtrado temporal es uno de los temas con mayor tasa de reprobación en entrevistas técnicas de Data Engineering y una fuente inagotable de incidentes de producción. Desde la degradación catastrófica de índices B-Tree por pérdida de SARGabilidad hasta la pérdida silenciosa de transacciones al usar \`BETWEEN\` sobre marcas de tiempo (\`DATETIME\`), dominar la aritmética temporal de MySQL 8.0 es un requerimiento innegociable para el nivel Staff Engineer.

---

## 1. Fundamentos Teóricos y Arquitectura de Tipos Temporales

MySQL 8.0 proporciona tres estructuras primarias para representar tiempo, cada una con un footprint físico y comportamiento de zona horaria radicalmente diferente:

| Tipo | Espacio en Disco | Rango Válido | Comportamiento frente a Husos Horarios (\`time_zone\`) |
| :--- | :--- | :--- | :--- |
| \`DATE\` | 3 bytes | \`1000-01-01\` a \`9999-12-31\` | Inmutable. Almacena únicamente año, mes y día en formato empaquetado. |
| \`DATETIME\` | 5 bytes (+ 0 a 3 bytes fraccionales) | \`1000-01-01 00:00:00\` a \`9999-12-31 23:59:59\` | **Literal Inmutable:** Almacena la fecha y hora exactamente como se ingresó, sin conversión de zona horaria al guardar ni leer. |
| \`TIMESTAMP\` | 4 bytes (+ 0 a 3 bytes fraccionales) | \`1970-01-01 00:00:01\` UTC a \`2038-01-19 03:14:07\` UTC | **Conversión Dinámica UTC:** Almacena segundos desde Unix Epoch. Convierte de la zona local a UTC al escribir y de UTC a la zona local al leer. |

### La Amenaza del Año 2038 (The Year 2038 Problem)
Dado que \`TIMESTAMP\` utiliza un entero con signo de 32 bits, se desbordará el 19 de enero de 2038 a las 03:14:07 UTC. En arquitecturas modernas, toda nueva tabla transaccional debe estandarizarse sobre **\`DATETIME(6)\`** almacenando siempre valores normalizados en **UTC**.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Límites de Intervalo Temporal y Escaneo SARGable en Índices B+ Tree
Cuando una columna almacena componentes de hora, minuto o microsegundo, filtrar con \`BETWEEN '2026-10-01' AND '2026-10-31'\` omite todas las transacciones ocurridas el 31 de octubre a partir de las 00:00:01:

\`\`\`text
┌──────────────────┐
│ TIMELINE & SARGABLE │
├──────────────────┤
│ 01-Oct ➔ 31-Oct     │
│ │──────────────│ │
│ BETWEEN: Omite > 00 │
│ SARGable: >= 01-Oct │
│ └──► 100% en B+ Tree│
└──────────────────┘
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y SARGabilidad

Una consulta es **SARGable** (*Search Argument Able*) cuando el motor puede usar un índice B+ Tree directamente sin evaluar funciones fila por fila. Envolver columnas temporales en funciones matemáticas o de extracción destruye la velocidad de ejecución:

\`\`\`sql
-- ❌ NO SARGABLE: Fuerza un Full Table Scan O(N) leyendo millones de páginas:
SELECT * FROM Orders WHERE DATE(created_at) = '2026-10-31';
SELECT * FROM Orders WHERE YEAR(created_at) = 2026 AND MONTH(created_at) = 10;
SELECT * FROM Orders WHERE created_at LIKE '2026-10-31%';

-- ✅ 100% SARGABLE: Ejecuta un Index Range Scan O(log N) sobre el árbol B-Tree:
SELECT * FROM Orders 
WHERE created_at >= '2026-10-31 00:00:00' 
  AND created_at <  '2026-11-01 00:00:00';
\`\`\`

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. \`DATEDIFF\` vs \`TIMESTAMPDIFF\`
\`\`\`sql
-- DATEDIFF(fecha_fin, fecha_inicio): Retorna (fecha_fin - fecha_inicio) en DÍAS ENTEROS:
SELECT DATEDIFF('2026-10-31', '2026-10-25'); -- ➔ Retorna 6
SELECT DATEDIFF('2026-10-25', '2026-10-31'); -- ➔ Retorna -6 (¡Ojo con el orden!)

-- TIMESTAMPDIFF(unidad, fecha_inicio, fecha_fin): ¡EL ORDEN DE PARÁMETROS SE INVIERTE!
-- Retorna la diferencia exacta en la unidad especificada:
SELECT TIMESTAMPDIFF(HOUR,   '2026-10-31 08:00:00', '2026-10-31 14:30:00'); -- ➔ 6 horas
SELECT TIMESTAMPDIFF(MINUTE, '2026-10-31 08:00:00', '2026-10-31 08:45:00'); -- ➔ 45 minutos
SELECT TIMESTAMPDIFF(MONTH,  '2026-01-15',          '2026-03-15');          -- ➔ 2 meses
\`\`\`

### 2. Aritmética de Intervalos: \`DATE_ADD\`, \`DATE_SUB\` y Operadores
\`\`\`sql
-- Sintaxis de Función vs Operador Estándar:
SELECT DATE_ADD('2026-10-01', INTERVAL 1 MONTH); -- '2026-11-01'
SELECT '2026-10-01' + INTERVAL 1 MONTH;          -- '2026-11-01' (Sintaxis limpia)
SELECT '2026-10-01' - INTERVAL 7 DAY;            -- '2026-09-24'
\`\`\`

### 3. Delimitación y Agrupación Mensual: \`LAST_DAY\` y \`DATE_FORMAT\`
\`\`\`sql
-- LAST_DAY: Retorna la última fecha del mes correspondiente:
SELECT LAST_DAY('2026-02-14'); -- ➔ '2026-02-28' (detecta bisiestos automáticamente)

-- Truncamiento a primer día del mes para métricas agrupadas por cohorte:
SELECT 
    DATE_FORMAT(trans_date, '%Y-%m-01') AS month_bucket,
    COUNT(*) AS total_transactions,
    SUM(amount) AS gross_volume
FROM Transactions
GROUP BY DATE_FORMAT(trans_date, '%Y-%m-01');
\`\`\`

### 4. Ventanas Móviles Relativas (Rolling Windows de 7 y 30 Días)
Al calcular métricas de actividad de usuario reciente (ej. Daily Active Users vs Monthly Active Users):
\`\`\`sql
-- Patrón SARGable para ventana deslizante de los últimos 30 días respecto a una fecha pivote:
SELECT 
    COUNT(DISTINCT user_id) AS mau_count
FROM UserLogins
WHERE login_time >= '2026-10-31 23:59:59' - INTERVAL 30 DAY
  AND login_time <= '2026-10-31 23:59:59';
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: Asumir que "Un Mes" equivale a 30 Días
\`\`\`sql
-- ❌ BUG FRECUENTE EN ANÁLISIS DE CHURN / RETENCIÓN:
-- Restar 30 días produce desfases de calendario en febrero y meses de 31 días:
SELECT * FROM Subscriptions WHERE expiration_date = user_created + INTERVAL 30 DAY;

-- ✅ FORMA CORRECTA BASADA EN CALENDARIO CIVIL:
SELECT * FROM Subscriptions WHERE expiration_date = user_created + INTERVAL 1 MONTH;
\`\`\`

### Antipatrón 2: Desfase por Años Bisiestos y Febrero
Sumar \`INTERVAL 1 YEAR\` sobre una fecha bisiesta como \`'2024-02-29'\` en MySQL retorna \`'2025-02-28'\` de manera automática y segura. Sin embargo, realizar cálculos manuales asumiendo que un año consta de 365 días (\`INTERVAL 365 DAY\`) provoca que en años bisiestos el evento se evalúe con 24 horas de adelanto. Emplea siempre intervalos semánticos (\`INTERVAL 1 YEAR\`, \`INTERVAL 1 MONTH\`) en lugar de multiplicadores de días.

### Antipatrón 3: Comparar Fechas Cruzando Zonas Horarias sin Normalización
Si tu aplicación web opera en servidores con hora \`America/El_Salvador\` (UTC-6) y la base de datos corre en \`UTC\`, comparar \`NOW()\` directo contra \`DATETIME\` generará un sesgo de 6 horas en todos los cortes diarios.
*Regla Staff Engineer:* Configura la sesión de base de datos a UTC (\`SET time_zone = '+00:00';\`) o utiliza siempre \`UTC_TIMESTAMP()\`.

### Antipatrón 4: Tratar Fechas como Cadenas con \`LIKE\`
\`\`\`sql
-- ❌ Provoca conversión implícita de tipo fecha a VARCHAR por cada fila, invalidando índices:
WHERE created_at LIKE '2026-10%';
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

### 1. Generación de Series Continuas de Fechas con \`WITH RECURSIVE\`
En analítica es mandatorio reportar días sin actividad (con métricas en \`0\`) en lugar de omitirlos:
\`\`\`sql
WITH RECURSIVE DateRange AS (
    SELECT CAST('2026-10-01' AS DATE) AS calendar_date
    UNION ALL
    SELECT calendar_date + INTERVAL 1 DAY
    FROM DateRange
    WHERE calendar_date < '2026-10-07'
)
SELECT 
    d.calendar_date,
    COALESCE(SUM(o.amount), 0.00) AS daily_revenue
FROM DateRange d
LEFT JOIN Orders o ON d.calendar_date = CAST(o.created_at AS DATE)
GROUP BY d.calendar_date
ORDER BY d.calendar_date;
\`\`\`

### 2. Patrón de Retención de Día 1 (LeetCode 550 / FAANG Core)
Identificar la proporción de usuarios que iniciaron sesión el día inmediatamente posterior a su primera fecha de registro:
\`\`\`sql
WITH FirstLogins AS (
    SELECT player_id, MIN(event_date) AS first_login
    FROM Activity
    GROUP BY player_id
)
SELECT 
    ROUND(
        COUNT(a.player_id) / (SELECT COUNT(*) FROM FirstLogins),
        2
    ) AS fraction
FROM FirstLogins fl
JOIN Activity a 
  ON fl.player_id = a.player_id 
 AND a.event_date = fl.first_login + INTERVAL 1 DAY;
\`\`\`
### 3. Conversión Dinámica de Zonas con \`CONVERT_TZ\`
Cuando se generan reportes para usuarios en diferentes regiones geográficas, transforma marcas UTC al huso horario local de presentación usando:
\`\`\`sql
SELECT 
    order_id,
    CONVERT_TZ(created_at, '+00:00', '-06:00') AS local_created_at_sv
FROM Orders;
\`\`\`
`
  },
  {
    id: "deduplication",
    title: "Deduplicación Analítica vs Física",
    badge: "Modelado & Calidad",
    icon: "CopyCheck",
    summary: "DISTINCT vs GROUP BY y el patrón canónico empresarial con ROW_NUMBER() para conservar trazabilidad e idempotencia.",
    guide: `
# ✂️ Deduplicación Analítica vs Física en Data Engineering

En arquitecturas distribuidas, pipelines de captura de datos de cambio (*Change Data Capture - CDC*) e ingestas batch/streaming (Kafka, Datastream, BigQuery, MySQL), recibir registros duplicados no es una anomalía, sino una certeza inevitable regida por la semántica de entrega *at-least-once*. Un Staff Data Engineer debe dominar tanto la deduplicación analítica en capa de lectura (sin alterar el historial transaccional) como la deduplicación física (purgado DML seguro) con ordenamiento determinista y mínimo costo de cómputo.

---

## 1. Fundamentos Teóricos: Los Tres Arquetipos de Duplicación

En entornos empresariales, los datos no se duplican de una única forma; existen tres arquetipos formales:

1. **Arquetipo 1: Duplicación Idéntica Completa (Exact Tuple Duplication):**
   Todas las columnas de la fila son idénticas en un 100%. Se genera por fallas transitorias de red, reintentos ciegos de clientes HTTP o fallos en la fase de carga de ETL.
2. **Arquetipo 2: Duplicación por Evolución de Estado (Business Key Collision / CDC):**
   Múltiples eventos comparten la misma clave de negocio primaria (\`user_id\`, \`order_id\`), pero representan mutaciones temporales de estado (ej. orden *PENDING*, luego *SHIPPED*, luego *DELIVERED*). El objetivo de negocio es conservar el estado más reciente (patrón *SCD Tipo 1* o *Snapshot*).
3. **Arquetipo 3: Colisión de Marca de Tiempo con Ambigüedad (Tied Timestamps):**
   Dos o más mutaciones para la misma entidad registran exactamente el mismo microsegundo de actualización (\`updated_at\`). Requiere un criterio de desempate algebraico y determinista mediante una clave sustituta monotónica creciente (\`id\`, \`offset\`).

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Ciclo de Vida del Pipeline de Deduplicación Analítica
\`\`\`text
 Flujo de Eventos Crudos (CDC / Log):
  [ID: 1, User: 'A', Saldo: 100, Time: 10:00]
  [ID: 2, User: 'B', Saldo: 250, Time: 10:05]
  [ID: 3, User: 'A', Saldo: 120, Time: 10:15] ──► (Versión más reciente de A)
  [ID: 4, User: 'B', Saldo: 250, Time: 10:05] ──► (Duplicado idéntico de ID 2)
  [ID: 5, User: 'A', Saldo: 110, Time: 10:10]
                         │
                         ▼
   PARTITION BY User ORDER BY Time DESC, ID DESC
                         │
    ┌────────────────────┴────────────────────┐
    ▼                                         ▼
 Partición Usuario 'A':                    Partición Usuario 'B':
 ┌ [ID: 3, Saldo: 120] ➔ rn = 1 (WINNER)   ┌ [ID: 4, Saldo: 250] ➔ rn = 1 (WINNER)
 │ [ID: 5, Saldo: 110] ➔ rn = 2            └ [ID: 2, Saldo: 250] ➔ rn = 2
 └ [ID: 1, Saldo: 100] ➔ rn = 3
                         │
                         ▼
                 Filtro: WHERE rn = 1
                         │
                         ▼
        [ID: 3, User: 'A', Saldo: 120]  (Estado Snapshot Final de 'A')
        [ID: 4, User: 'B', Saldo: 250]  (Estado Snapshot Final de 'B')
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Costo Algorítmico

| Estrategia | Complejidad Temporal | Complejidad Espacial | Preserva Columnas Originales | Maneja Desempates |
| :--- | :--- | :--- | :--- | :--- |
| \`DISTINCT\` | $O(N \log N)$ (Filesort) o $O(N)$ (Hash) | Alta (almacena toda la tupla) | Solo si la tupla completa es idéntica | No (falla ante cambios parciales) |
| \`GROUP BY\` | $O(N \log N)$ | Media | No (bloqueado por \`ONLY_FULL_GROUP_BY\`) | No |
| Auto-Join con \`MAX(date)\` | $O(N^2)$ (sin índice) / $O(N \log N)$ | Alta (doble escaneo) | Sí | Requiere subconsultas adicionales |
| **\`ROW_NUMBER()\` en CTE** | **$O(N \log K)$ (con índice)** | **Mínima (streaming por ventana)** | **Sí (100% de la fila ganadora)** | **Sí (determinismo estricto)** |

### Optimización con Índices B+ Tree: Eliminando el Filesort
Para que el motor ejecute la función de ventana en tiempo lineal $O(N)$ sin recurrir a ordenamiento temporal en memoria o disco (*filesort*), se requiere un **índice compuesto que refleje exactamente la anatomía de la cláusula OVER**:
\`\`\`sql
-- Índice B-Tree óptimo: (partición, ordenamiento descendente, desempate):
CREATE INDEX idx_audit_dedup 
ON UserEventsStream (entity_id, updated_at DESC, event_id DESC);
\`\`\`
Al contar con este índice, el optimizador de MySQL 8.0 anota en el plan \`Using index for window\`, leyendo las tuplas directamente ordenadas desde las hojas del árbol sin consumir espacio en \`sort_buffer_size\`.

### Desbordamiento de Memoria Temporal (TempTable Engine a Disco)
Si la partición o el ordenamiento de una tabla masiva no cuenta con índice, MySQL almacena las tuplas intermedias en el motor en memoria \`TempTable\`. Si el tamaño total excede el límite de la variable de sistema \`temptable_max_ram\` (por defecto 1 GB en MySQL 8.0), el motor desborda automáticamente los datos a tablas temporales en disco InnoDB (\`Created_tmp_disk_tables\`), incrementando la latencia en dos órdenes de magnitud. Monitorea siempre esta métrica en pipelines de alta carga.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. El Patrón Analítico Definitivo con \`ROW_NUMBER()\`
Permite aislar la tupla más reciente por entidad conservando todos sus atributos originales intactos:
\`\`\`sql
WITH RankedEvents AS (
    SELECT 
        entity_id,
        user_name,
        account_status,
        updated_at,
        event_id,
        ROW_NUMBER() OVER (
            PARTITION BY entity_id 
            ORDER BY updated_at DESC, event_id DESC -- Regla de desempate innegociable
        ) AS rn
    FROM UserEventsStream
)
SELECT 
    entity_id,
    user_name,
    account_status,
    updated_at
FROM RankedEvents
WHERE rn = 1;
\`\`\`

### 2. Purga y Deduplicación Física en MySQL (DML Atómico con Self-Join)
Cuando se requiere limpiar físicamente duplicados en una tabla relacional transaccional, conservando únicamente el registro con el mayor ID:
\`\`\`sql
DELETE t1 
FROM CustomerAuditLog t1
INNER JOIN CustomerAuditLog t2 
  ON t1.business_key = t2.business_key 
 AND t1.id < t2.id;
-- t1.id < t2.id garantiza que si existen IDs 101 y 105 para la misma clave,
-- la fila 101 califica para ser borrada y la 105 sobrevive intacta.
\`\`\`

### 3. Deduplicación Física con Tabla Intermedia (Estrategia Zero-Lock para Millones de Filas)
Borrar millones de filas directamente con \`DELETE\` satura el *Undo Log* y adquiere bloqueos de rango excesivos (*next-key locks*). En producción masiva, el patrón Staff consiste en crear una tabla sombra deduplicada y efectuar un swap atómico:
\`\`\`sql
-- 1. Crear tabla destino con la estructura de la original
CREATE TABLE CustomerAuditLog_Clean LIKE CustomerAuditLog;

-- 2. Insertar únicamente las tuplas ganadoras mediante ventana
INSERT INTO CustomerAuditLog_Clean
WITH Deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY business_key ORDER BY updated_at DESC, id DESC
    ) AS rn
    FROM CustomerAuditLog
)
SELECT id, business_key, payload, updated_at
FROM Deduplicated
WHERE rn = 1;

-- 3. Intercambio atómico de metadatos en microsegundos (Zero Downtime)
RENAME TABLE CustomerAuditLog TO CustomerAuditLog_Old,
             CustomerAuditLog_Clean TO CustomerAuditLog;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: El Uso Inadecuado de \`RANK()\` o \`DENSE_RANK()\`
\`\`\`sql
-- ❌ BUG GRAVE: Ante colisión exacta de updated_at, ambas filas reciben rn = 1:
WITH BadDeduplication AS (
    SELECT *, RANK() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rnk
    FROM UserLogins
)
SELECT * FROM BadDeduplication WHERE rnk = 1;
-- 💥 RESULTADO: Los duplicados sobreviven silenciosamente en la capa Silver/Gold!
-- REGLA STAFF: Usa SIEMPRE ROW_NUMBER() para deduplicación estricta 1:1.
\`\`\`

### Antipatrón 2: Creación de Registros "Frankenstein" con \`GROUP BY\`
\`\`\`sql
-- ❌ ERROR COMÚN: Mezclar columnas de eventos temporales diferentes:
SELECT 
    user_id,
    MAX(email) AS email,               -- Podría venir del evento de enero
    MAX(phone) AS phone,               -- Podría venir del evento de marzo
    MAX(updated_at) AS last_updated    -- Marca de tiempo de mayo
FROM UserActivityLog
GROUP BY user_id;
-- 💥 Genera un registro híbrido ficticio con datos que jamás coexistieron en la realidad!
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **La Invariante del Desempate Determinista:** En cualquier ejercicio de entrevista que pida "el registro más reciente" (*"find the latest transaction for each user"*), asume que habrá timestamps duplicados en el conjunto de evaluación oculto. Agrega siempre una segunda columna única al ordenamiento (\`ORDER BY event_time DESC, id DESC\`).
2. **Idempotencia Absoluta en Pipelines:** Todo pipeline de deduplicación debe ser matemáticamente idempotente: ejecutar la consulta 1 vez o 10 veces seguidas sobre el mismo dataset debe arrojar un resultado estrictamente idéntico tupla por tupla.
3. **Preservación de Capa Raw (Medallion Architecture):** En arquitecturas de datos modernas (Lakehouse / GCP / BigQuery), jamás purges los duplicados en la capa Bronze/Raw. Almacena todos los eventos para auditoría forense y aplica el patrón \`ROW_NUMBER() = 1\` en la vista o tabla incremental de la capa Silver.
4. **Transición a Dimensiones Históricas (SCD Tipo 2) con \`LEAD\`:** Si el requerimiento de negocio evoluciona de "conservar el último" a "trazar todo el histórico con rangos de vigencia", extiende la ventana deduplicadora utilizando la función de navegación \`LEAD\`:
\`\`\`sql
SELECT 
    entity_id,
    account_status,
    updated_at AS valid_from,
    COALESCE(
        LEAD(updated_at) OVER (PARTITION BY entity_id ORDER BY updated_at, event_id),
        '9999-12-31 23:59:59'
    ) AS valid_to,
    CASE 
        WHEN LEAD(updated_at) OVER (PARTITION BY entity_id ORDER BY updated_at, event_id) IS NULL 
        THEN 1 ELSE 0 
    END AS is_current
FROM UserEventsStream;
\`\`\`
`
  },
  {
    id: "strings",
    title: "Manipulación de Strings y Limpieza",
    badge: "Data Wrangling",
    icon: "Type",
    summary: "CONCAT, CONCAT_WS, SUBSTRING, CHAR_LENGTH vs LENGTH, funciones de normalización y expresiones regulares.",
    guide: `
# 🔤 Manipulación de Strings, Collation y Limpieza en MySQL 8.0

En la ingeniería de datos moderna, más del 40% del tiempo de cómputo en capas de ingestión y data wrangling se dedica a la normalización, tokenización, deduplicación y saneamiento de cadenas de texto. Comprender la distinción entre caracteres y bytes bajo la codificación \`utf8mb4\`, el impacto de los *collations* en la seguridad y el uso de expresiones regulares nativas de MySQL 8.0 distingue a un desarrollador junior de un Staff Engineer.

---

## 1. Fundamentos Teóricos: Caracteres vs Bytes en UTF-8 (\`utf8mb4\`)

MySQL 8.0 utiliza por defecto el conjunto de caracteres **\`utf8mb4\`** (soporte completo de Unicode hasta 4 bytes por caracter):
- **\`CHAR_LENGTH(str)\` (o \`CHARACTER_LENGTH\`):** Retorna la cantidad lógica de **glifos o caracteres legibles**, independientemente de cuántos bytes ocupen en memoria o disco.
- **\`LENGTH(str)\` (o \`OCTET_LENGTH\`):** Retorna la cantidad física de **bytes** consumidos por la cadena codificada en almacenamiento binario.

### Distribución Física de Bytes en \`utf8mb4\`
\`\`\`text
┌───────────────────────────┬──────────────┬──────────────┬──────────────┐
│ Categoría de Caracteres   │ Bytes/Glifo  │ Ejemplos     │ Demostración │
├───────────────────────────┼──────────────┼──────────────┼──────────────┤
│ ASCII Estándar (0-127)    │ 1 byte       │ 'A', '7', '$'│ LENGTH('A') = 1              │
│ Latinos con tilde / Ñ     │ 2 bytes      │ 'é', 'ñ', 'ü'│ LENGTH('é') = 2, CHAR_LEN = 1 │
│ Símbolos orientales / CJK │ 3 bytes      │ '中', '文', '★'│ LENGTH('中') = 3, CHAR_LEN = 1 │
│ Emojis / Planos Suplement.│ 4 bytes      │ '🚀', '🔥', '💻'│ LENGTH('🚀') = 4, CHAR_LEN = 1 │
└───────────────────────────┴──────────────┴──────────────┴──────────────┘
\`\`\`

### El Caso Canónico de Entrevistas (LeetCode 1527 / Invalid Tweets)
Validar si un tweet excede 140 caracteres usando \`LENGTH(tweet) > 140\` generará falsos positivos si el usuario incluye acentos o emojis. La regla innegociable es **usar siempre \`CHAR_LENGTH()\` para validar longitud de texto humano**.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Indexación Basada en 1 (1-Based Indexing) y Slicing con \`SUBSTRING\`
A diferencia de Python o JavaScript (base 0), en SQL las posiciones de cadenas comienzan estrictamente en **1**:
\`\`\`text
 Cadena:       '  D  I  E  G  O  '
 Posición:        1  2  3  4  5
 SUBSTRING('DIEGO', 1, 3) ──► 'DIE'  (Inicio en pos 1, longitud 3)
 SUBSTRING('DIEGO', 2)    ──► 'IEGO' (Desde pos 2 hasta el final)
\`\`\`

### El Patrón de Partición Rápida con \`SUBSTRING_INDEX\`
\`SUBSTRING_INDEX(str, delim, count)\` es hasta 10 veces más rápido que una expresión regular para separar tuplas delimitadas:
\`\`\`text
 Cadena Objetivo: 'diego.escobar@empresa.corp.sv'
                      Delimitador: '@'
 
 count = 1 (De izquierda a derecha):
 'diego.escobar@empresa.corp.sv' ──► 'diego.escobar' (Nombre de Usuario)
 
 count = -1 (De derecha a izquierda):
 'diego.escobar@empresa.corp.sv' ──► 'empresa.corp.sv' (Dominio Completo)

 Delimitador Secundario: '.' sobre el dominio:
 SUBSTRING_INDEX('empresa.corp.sv', '.', -1) ──► 'sv' (TLD País)
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Collations

### El Estándar \`utf8mb4_0900_ai_ci\`
En MySQL 8.0, la intercalación predeterminada es \`utf8mb4_0900_ai_ci\`:
- \`ai\` = *Accent-Insensitive* (insensible a acentos y tildes).
- \`ci\` = *Case-Insensitive* (insensible a mayúsculas y minúsculas).

### La Trampa de Seguridad y Unicidad
\`\`\`sql
-- Bajo utf8mb4_0900_ai_ci, todas estas comparaciones evalúan a TRUE:
SELECT 'admin' = 'ADMIN'; -- ➔ 1 (TRUE)
SELECT 'cafe' = 'café';   -- ➔ 1 (TRUE)
SELECT 'resume' = 'résumé'; -- ➔ 1 (TRUE)

-- 💥 VULNERABILIDAD: Un atacante podría registrar 'ADMIN' y colisionar con 'admin'!
-- ✅ FORMA SEGURA: Forzar intercalación binaria exacta (utf8mb4_bin):
SELECT 'admin' = 'ADMIN' COLLATE utf8mb4_bin; -- ➔ 0 (FALSE)
SELECT BINARY 'admin' = 'ADMIN';             -- ➔ 0 (FALSE)
\`\`\`

### Pérdida de SARGabilidad al Normalizar Cadenas
\`\`\`sql
-- ❌ NO SARGABLE (Full Table Scan O(N), descarta el índice B-Tree sobre 'email'):
SELECT * FROM Users WHERE LOWER(email) = 'diego@domain.com';

-- ✅ SARGABLE: Si la columna ya es ci (case-insensitive), compara directamente:
SELECT * FROM Users WHERE email = 'diego@domain.com';
\`\`\`

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. \`CONCAT\` vs \`CONCAT_WS\` (Con Separador y Nulo-Seguro)
\`\`\`sql
-- ❌ CONCAT ordinario: Si un solo valor es NULL, destruye toda la cadena retornando NULL:
SELECT CONCAT(first_name, ' ', middle_name, ' ', last_name) AS full_name FROM Users;

-- ✅ CONCAT_WS: Define el separador en el primer argumento e IGNORA automáticamente los nulos:
SELECT CONCAT_WS(' ', first_name, middle_name, last_name) AS full_name FROM Users;
\`\`\`

### 2. Formateo y Relleno con Ceros (\`LPAD\` / \`RPAD\`)
Indispensable para estandarizar códigos de barras, identificadores contables o números de cuenta:
\`\`\`sql
-- Rellena con ceros a la izquierda hasta alcanzar 8 dígitos:
SELECT LPAD(account_id, 8, '0') AS padded_account_number FROM BankAccounts;
-- 42 ➔ '00000042'
\`\`\`

### 3. Capitalización Canónica (Title Case / Initcap)
MySQL no posee la función \`INITCAP()\`. El modismo Staff Engineer para capitalizar la primera letra y pasar el resto a minúsculas es:
\`\`\`sql
SELECT 
    user_id,
    CONCAT(
        UPPER(SUBSTRING(raw_name, 1, 1)),
        LOWER(SUBSTRING(raw_name, 2))
    ) AS formatted_name
FROM RawUsers;
\`\`\`

### 4. Motor de Expresiones Regulares en MySQL 8.0
MySQL 8.0 reemplazó el motor regex básico con una implementación conforme a ICU:
\`\`\`sql
-- 1. REGEXP_LIKE: Búsqueda booleana en WHERE:
SELECT * FROM Products WHERE REGEXP_LIKE(sku, '^[A-Z]{3}-[0-9]{4}$');

-- 2. REGEXP_SUBSTR: Extracción de tokens coincidentes:
SELECT REGEXP_SUBSTR('Error Code: 404 Not Found', '[0-9]+') AS error_code; -- ➔ '404'

-- 3. REGEXP_REPLACE: Sanitización y remoción de caracteres no alfanuméricos:
SELECT REGEXP_REPLACE('+503 (2222)-5555', '[^0-9]', '') AS clean_phone; -- ➔ '50322225555'

-- 4. REGEXP_INSTR: Retorna el índice de inicio del patrón:
SELECT REGEXP_INSTR('Order-9981', '[0-9]+') AS match_position; -- ➔ 7
\`\`\`

### 5. Comparaciones Fonéticas con \`SOUNDEX\`
En limpieza de datos de clientes con posibles errores tipográficos en nombres (ej. 'Smith' vs 'Smyth'):
\`\`\`sql
-- Evalúa si dos palabras suenan fonéticamente similares en inglés:
SELECT 
    user_id, raw_name
FROM Customers
WHERE SOUNDEX(raw_name) = SOUNDEX('Claire'); -- Coincide con 'Clare', 'Clair', etc.
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: Comportamiento de Espacios al Final en \`CHAR\` vs \`VARCHAR\`
En MySQL, el tipo de longitud fija \`CHAR(N)\` rellena automáticamente con espacios a la derecha al almacenar tuplas, pero al recuperarlas **los espacios finales son eliminados silenciosamente**. En contraste, \`VARCHAR(N)\` preserva los espacios finales exactos. Si tu aplicación almacena contraseñas con padding o tokens de longitud fija con espacios significativos, usar \`CHAR\` corromperá el valor.

### Antipatrón 2: Búsqueda con Comodín Inicial (\`LIKE '%termino'\`)
\`\`\`sql
-- ❌ INEFICIENTE: Un comodín '%' al inicio del patrón impide usar el índice B-Tree:
SELECT * FROM Customers WHERE email LIKE '%@gmail.com'; -- Full Table Scan O(N)

-- ✅ ALTERNATIVA DE ARQUITECTURA:
-- Para sufijos fijos recurrentes, almacena el dominio en una columna separada indexada,
-- o utiliza una columna generada con Reverse: WHERE email_domain = 'gmail.com'.
\`\`\`

### Antipatrón 3: Truncamiento Silencioso en DDL al Migrar a UTF-8
Si una columna se definió como \`VARCHAR(10)\` bajo \`latin1\` (1 byte por caracter) y se almacena texto con emojis bajo \`utf8mb4\`, el límite de 10 caracteres no cambia, pero si el sistema exterior valida bytes (\`10 bytes\`), un string de 3 emojis (12 bytes) provocará un error de desbordamiento en el consumidor.

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Patrón HackerRank: Identificadores que Inician y Terminan con Vocales:**
   \`\`\`sql
   -- Clásico de HackerRank SQL Advanced (Weather Observation Station):
   SELECT DISTINCT city
   FROM Station
   WHERE REGEXP_LIKE(city, '^[aeiouAEIOU].*[aeiouAEIOU]$');
   \`\`\`
2. **Priorización de Funciones Nativas sobre Regex:** Las expresiones regulares añaden una sobrecarga computacional de parseo de autómatas finitos. Siempre que puedas resolver el filtrado con \`LEFT()\`, \`RIGHT()\`, \`SUBSTRING_INDEX()\` o \`LIKE 'prefijo%'\`, el rendimiento será de 3x a 10x superior en datasets de millones de tuplas.
3. **Defensa contra Nulos en Limpieza de Cadenas:** En cualquier ETL de extracción de texto, envuelve siempre las transformaciones en \`TRIM(COALESCE(col, ''))\` para erradicar espacios invisibles y prevenir que \`NULL\` contamine la concatenación de la clave sustituta (*hash surrogate key*).
`
  },
  {
    id: "ctes",
    title: "Common Table Expressions (CTEs) & Chained CTEs",
    badge: "Legibilidad & Modularidad",
    icon: "Layers",
    summary: "Estructura WITH, CTEs encadenadas y dependientes, descomposición de pipelines de datos y rendimiento.",
    guide: `
# 🧱 Common Table Expressions (CTEs) y Chained Pipelines en MySQL 8.0

En la ingeniería de analítica moderna y herramientas de transformación de datos (dbt, Dataform, pipelines ELT), las **Common Table Expressions (CTEs)** representan el cambio de paradigma más significativo para abandonar el código SQL monolítico y adoptar una **Arquitectura de Pipelines en Capas**. Diseñar consultas como un Grafo Acíclico Dirigido (DAG) desacoplado, modular y depurable es una habilidad distintiva de un Staff Engineer.

---

## 1. Fundamentos Teóricos: Consultas como Grafos DAG

### Del Código Monolítico al Pipeline por Capas
Tradicionalmente, las consultas analíticas complejas recurrían a subconsultas profundamente anidadas (*nested subqueries*), obligando a leer el código desde la capa más interna hacia afuera. Las CTEs (\`WITH ...\`) invierten esta dinámica, estructurando el procesamiento lógico de arriba hacia abajo como un flujo unidireccional de datos:

\`\`\`sql
WITH 
  Layer1_BaseIngestion AS (
      -- Capa 1: Filtrado SARGable estricto y proyecciones mínimas
      SELECT id, customer_id, amount, created_at
      FROM Orders
      WHERE created_at >= '2026-01-01' AND status = 'COMPLETED'
  ),
  Layer2_Enrichment AS (
      -- Capa 2: Cálculo de métricas analíticas y funciones de ventana
      SELECT 
          id, customer_id, amount, created_at,
          ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS purchase_seq,
          SUM(amount) OVER (PARTITION BY customer_id) AS lifetime_value
      FROM Layer1_BaseIngestion
  ),
  Layer3_Aggregations AS (
      -- Capa 3: Resumen de negocio a nivel de cliente
      SELECT 
          customer_id,
          MAX(lifetime_value) AS total_spent,
          COUNT(id) AS total_orders
      FROM Layer2_Enrichment
      GROUP BY customer_id
  )
-- Capa Terminal: Selección, ordenamiento y límites para presentación
SELECT customer_id, total_spent, total_orders
FROM Layer3_Aggregations
WHERE total_spent >= 1000.00
ORDER BY total_spent DESC;
\`\`\`

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Topología DAG de una Consulta Analítica Modular
\`\`\`text
  [Tabla Orders] ──► (Filtro Fecha & Estado)
                           │
                           ▼
              ┌──────────────────────────┐
              │ 1. Layer1_BaseIngestion  │  (Tuplas limpias y reducidas)
              └─────────────┬────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │ 2. Layer2_Enrichment     │  (Ventanas: running totals, ranks)
              └─────────────┬────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │ 3. Layer3_Aggregations   │  (GROUP BY customer_id)
              └─────────────┬────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │ 4. Final SELECT Terminal │  (Ordenamiento, paginación, filtros KPI)
              └──────────────────────────┘
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

El optimizador de consultas de MySQL 8.0 evalúa cada CTE y decide entre dos estrategias de ejecución diametralmente opuestas:

### 1. Fusión en Línea (*Inline Merging*)
- **Mecánica:** El optimizador expande la definición de la CTE y la fusiona directamente con la consulta contenedora externa (como si fuera una vista en línea).
- **Ventaja de Rendimiento:** Habilita el **empuje de predicados hacia abajo (*Predicate Pushdown*)**. Si la consulta exterior tiene \`WHERE customer_id = 42\`, ese filtro se inyecta en la lectura original de la tabla base, permitiendo usar índices B-Tree y minimizando lecturas de páginas.
- **Cuándo Aplica:** En CTEs sencillas que solo realizan proyecciones, filtros o joins simples sin agregaciones bloqueantes.

### 2. Materialización (*Materialization*)
- **Mecánica:** El motor evalúa la CTE **una sola vez** y escribe el conjunto de resultados completo en una tabla temporal interna anónima gestionada por el motor de almacenamiento \`TempTable\` en memoria RAM.
- **Ventaja de Rendimiento:** Si una CTE es referenciada múltiples veces en la consulta principal (por ejemplo, en un join de una tabla contra sus propios percentiles), la lógica pesada se calcula una única vez en lugar de recalcularse $N$ veces.
- **Condiciones que Disparan Materialización:** Presencia de \`DISTINCT\`, \`GROUP BY\`, funciones de ventana, cláusulas \`UNION\`, o cuando la CTE es referenciada 2 o más veces.
- **Hints del Optimizador:** Un Staff Engineer puede gobernar esta decisión explícitamente:
  \`\`\`sql
  WITH CustomerTotals AS (
      SELECT /*+ MERGE(CustomerTotals) */ customer_id, SUM(amount) AS total
      FROM Orders GROUP BY customer_id
  ) ...
  \`\`\`

### Monitoreo del Desbordamiento a Disco (\`Created_tmp_disk_tables\`)
Si una CTE materializada excede el espacio de \`temptable_max_ram\` (1 GB por defecto en MySQL 8.0), el motor desborda la tabla temporal a disco en formato InnoDB. Esto se detecta monitoreando el contador de estado de la sesión:
\`\`\`sql
SHOW SESSION STATUS LIKE 'Created_tmp_disk_tables';
\`\`\`

### Indexación Automática en Tablas Temporales Materializadas
Cuando el optimizador materializa una CTE y detecta que la consulta principal realiza un join sobre sus columnas, MySQL 8.0 **crea automáticamente un índice hash en memoria** sobre la clave de unión de la tabla temporal interna. Esto garantiza que las lecturas posteriores se resuelvan en $O(1)$ en lugar de realizar escaneos completos repetitivos.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Reutilización de CTEs para Comparación contra Agregados Globales
Evita duplicar subconsultas costosas uniendo la tabla detallada contra una CTE escalar calculada previamente:
\`\`\`sql
WITH DeptAvgSalaries AS (
    SELECT department_id, AVG(salary) AS avg_sal
    FROM Employees
    GROUP BY department_id
)
SELECT 
    e.id, 
    e.name, 
    e.salary, 
    d.avg_sal,
    ROUND(e.salary - d.avg_sal, 2) AS diff_from_dept_avg
FROM Employees e
JOIN DeptAvgSalaries d ON e.department_id = d.department_id
WHERE e.salary > d.avg_sal;
\`\`\`

### 2. Pipeline Encadenado para Cálculo de Crecimiento MoM (Month-over-Month)
Ejemplo de flujo encadenado de 3 capas sin lógica duplicada:
\`\`\`sql
WITH MonthlySales AS (
    -- Capa 1: Agregación mensual
    SELECT 
        DATE_FORMAT(order_date, '%Y-%m-01') AS sales_month,
        SUM(amount) AS monthly_revenue
    FROM Orders
    GROUP BY DATE_FORMAT(order_date, '%Y-%m-01')
),
LaggedMetrics AS (
    -- Capa 2: Desfase temporal con LAG
    SELECT 
        sales_month,
        monthly_revenue,
        LAG(monthly_revenue, 1) OVER (ORDER BY sales_month) AS prev_month_revenue
    FROM MonthlySales
)
-- Capa 3: Proyección y cálculo de tasa de crecimiento porcentual
SELECT 
    sales_month,
    monthly_revenue,
    prev_month_revenue,
    ROUND(
        COALESCE(
            100.0 * (monthly_revenue - prev_month_revenue) / NULLIF(prev_month_revenue, 0),
            0.00
        ),
        2
    ) AS mom_growth_pct
FROM LaggedMetrics;
\`\`\`

### 3. Alcance Estricto (Scope) de las CTEs
Una CTE **no persiste en el catálogo de base de datos** ni sobrevive a sentencias múltiples. Su ciclo de vida está ligado exclusivamente a la única sentencia (\`SELECT\`, \`INSERT\`, \`UPDATE\`, \`DELETE\`) que le sigue inmediatamente. Para persistir transformaciones en sesiones posteriores, debe crearse una vista (\`CREATE VIEW\`) o una tabla física.

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: La "God-CTE" Monolítica
\`\`\`sql
-- ❌ ANTIPATRÓN: Crear una CTE gigantesca de 150 líneas que realiza 8 joins,
-- 4 agregaciones y 3 transformaciones de strings a la vez.
-- Consecuencia: Imposible de depurar, destruye la modularidad y confunde al optimizador de costos.
-- ✅ REGLA STAFF: Cada CTE debe responder a una sola pregunta relacional concreta.
\`\`\`

### Antipatrón 2: Materialización Prematura de Millones de Filas
\`\`\`sql
-- ❌ ERROR CRÍTICO: No filtrar dentro de la CTE inicial:
WITH AllEvents AS (
    SELECT * FROM Logs -- ➔ Materializa 50 millones de filas en memoria/disco!
)
SELECT * FROM AllEvents WHERE event_date = '2026-10-31';

-- ✅ REGLA INNEGOCIABLE: Filtra siempre en la primera capa para minimizar cardinalidad.
\`\`\`

### Antipatrón 3: CTEs Pasamanos Inútiles (Pass-Through CTEs)
\`\`\`sql
-- ❌ ANTIPATRÓN: Declarar CTEs que solo hacen SELECT * sin transformación alguna:
WITH raw_customers AS (SELECT * FROM Customers) ... -- Agrega overhead sintáctico sin valor.
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Principio de Responsabilidad Única (SRP) en SQL:** Cada CTE debe cumplir un único propósito: o filtra, o enriquece con ventanas, o agrega. Nunca mezcles agregación pesada con enriquecimiento de ventana en la misma capa.
2. **Nomenclatura Semántica Auto-documentada:** En entrevistas técnicas y código empresarial, prohíbete nombrar CTEs como \`CTE1\`, \`T1\`, \`Temp\`. Usa nombres de entidades de negocio: \`ActiveSubscriptions\`, \`RankedSalaries\`, \`MonthlyCohortTotals\`. El evaluador mide tu claridad arquitectónica.
3. **Depuración Aislada Paso a Paso:** Durante el desarrollo, si una consulta de 5 CTEs devuelve datos anómalos, cambia la cláusula \`SELECT\` final para inspeccionar directamente la salida de \`SELECT * FROM Layer2_Enrichment\`. Esta capacidad de inspección modular es la mayor ventaja operativa de las CTEs.
`
  },
  {
    id: "subqueries",
    title: "Subconsultas en Todas sus Formas",
    badge: "Lógica Avanzada",
    icon: "FolderTree",
    summary: "Subconsultas escalares, derivadas en FROM, predicados IN / EXISTS y el costo de las subconsultas correlacionadas.",
    guide: `
# 🔍 Subconsultas (Subqueries), Semi-Joins y Optimizador en MySQL 8.0

Las subconsultas constituyen uno de los constructos más expresivos del álgebra relacional en SQL, pero al mismo tiempo representan una de las mayores fuentes de regresiones de rendimiento si no se comprende cómo el optimizador de costos (CBO) de MySQL 8.0 las descorrelaciona o reescribe en transformaciones de **Semi-Join** y **Anti-Join**.

---

## 1. Fundamentos Teóricos y Taxonomía de Subconsultas

Según su dimensionalidad de retorno y su ubicación en la gramática SQL, las subconsultas se clasifican formalmente en tres tipos:

### 1. Subconsulta Escalar (Scalar Subquery)
Retorna estrictamente **1 fila y 1 columna** (un único valor atómico).
- **Ubicación Permitida:** Cláusulas \`SELECT\`, \`WHERE\`, \`HAVING\` y como operando en comparaciones relacionales (\`=\`, \`<\`, \`>\`).
- **En Cláusula HAVING:** Permite filtrar grupos comparándolos contra métricas globales de la base de datos sin necesidad de joins previos:
  \`\`\`sql
  SELECT department_id, AVG(salary) AS dept_avg
  FROM Employees
  GROUP BY department_id
  HAVING AVG(salary) > (SELECT AVG(salary) FROM Employees);
  \`\`\`
- **Riesgo:** Si la subconsulta en tiempo de ejecución arroja 2 o más filas, el motor aborta la consulta inmediatamente con el error fatal \`Subquery returns more than 1 row\`.

### 2. Subconsulta de Fila / Multi-Columna (Row Constructor Subquery)
Compara tuplas enteras de atributos simultáneamente en una sola expresión relacional:
\`\`\`sql
-- Encuentra los empleados que ostentan el salario más alto dentro de su propio departamento:
SELECT id, name, department_id, salary
FROM Employees
WHERE (department_id, salary) IN (
    SELECT department_id, MAX(salary)
    FROM Employees
    GROUP BY department_id
);
\`\`\`
Este patrón de constructor de fila (\`(a, b) IN (...)\`) simplifica consultas que de otro modo requerirían complejos joins o ventanas.

### 3. Subconsulta de Tabla Derivada (Derived Table en \`FROM\`)
Genera un conjunto de datos tabular en memoria intermedia para ser tratado como una tabla física.
- **Regla Estricta de MySQL:** En MySQL 8.0, **toda tabla derivada en la cláusula \`FROM\` debe tener obligatoriamente un alias de tabla** (\`AS dt\`), incluso si no se utiliza posteriormente.

### 4. Subconsultas de Predicado (\`IN\`, \`EXISTS\`, \`ANY\`, \`ALL\`)
Evalúan la existencia o pertenencia de tuplas entre conjuntos para gobernar el filtrado de la consulta principal.

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Comparación de Flujos de Ejecución: Bucle Correlacionado vs Materialización Semi-Join
\`\`\`text
┌──────────────────┐
│ BUCLE vs SEMI-JOIN  │
├──────────────────┤
│ 1. Bucle: O(N * M)  │
│    Fila Ext ──► Subq│
│ 2. Semi-Join: O(N+M)│
│    Subq ──► TempHash│
│    ┌─────────────┘
│    └─► Lookup O(1)  │
└──────────────────┘
\`\`\`

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Semi-Joins

Cuando escribes un predicado como \`WHERE foreign_key IN (SELECT ...)\`, el optimizador de MySQL 8.0 no ejecuta una subconsulta ingenua, sino que intenta reescribirla internamente como un **Semi-Join** utilizando una de cinco estrategias algorítmicas:

1. **\`FirstMatch\`:** Escanea la tabla externa y busca en el índice de la tabla interna; tan pronto encuentra la primera coincidencia, detiene la búsqueda (*early-exit*), evitando duplicados sin necesidad de ordenar.
2. **\`MaterializeScan\` / \`MaterializeLookup\`:** Evalúa la subconsulta una sola vez, deduplica sus claves y las guarda en una tabla temporal en memoria \`TempTable\` indexada por hash. La tabla externa realiza lookups directos en $O(1)$.
3. **\`LooseScan\`:** Recorre un índice agrupado de la tabla interna leyendo solo la primera tupla de cada grupo de valores duplicados (equivalente a un distinct de índice), uniéndola con la tabla externa.
4. **\`DuplicateWeedout\`:** Ejecuta un join ordinario y elimina los duplicados de la tabla externa utilizando una tabla temporal oculta en memoria.

### Visualización de Estrategias de Semi-Join en EXPLAIN FORMAT=TREE
Al inspeccionar un plan de ejecución con \`EXPLAIN FORMAT=TREE\`, el optimizador de MySQL 8.0 explicita cómo resolvió la subconsulta:
\`\`\`text
-> Nested loop inner join
   -> Filter: <in_optimizer>(e.dept_id, e.dept_id in (subquery#2))
      -> Table scan on e (Employees)
   -> Single-row index lookup on d using PRIMARY (id = e.dept_id)
      -> Materialize with deduplication
         -> Filter: (d.budget > 1000000)
            -> Table scan on d (Departments)
\`\`\`
Observar \`Materialize with deduplication\` confirma que MySQL transformó el predicado \`IN\` en una tabla hash deduplicada en memoria, evitando evaluar la subconsulta fila por fila.

### Regla Staff Engineer: ¿Cuándo usar \`EXISTS\` y cuándo usar \`IN\`?
- **Usa \`EXISTS\`:** Cuando la subconsulta apunta a una tabla masiva pero la clave de acoplamiento tiene un **índice B+ Tree secundario**. \`EXISTS\` aprovecha el índice y corta la ejecución tras la primera coincidencia (*short-circuit*).
- **Usa \`IN\`:** Cuando la subconsulta retorna un conjunto pequeño de valores y no hay índices directos para correlacionar; MySQL materializa el conjunto pequeño en una tabla hash rápida.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### Subconsultas Cuantificadas (\`ALL\` y \`ANY\` / \`SOME\`)

Las palabras clave \`ALL\` y \`ANY\` permiten evaluar relaciones frente a conjuntos completos sin requerir funciones agregadas explícitas:

\`\`\`sql
-- val > ALL (subquery): El valor debe ser mayor que el MÁXIMO absoluto del conjunto:
SELECT name, salary FROM Employees
WHERE salary > ALL (SELECT salary FROM Employees WHERE department_id = 2);

-- val > ANY (subquery): El valor debe ser mayor que el MÍNIMO del conjunto:
SELECT name, salary FROM Employees
WHERE salary > ANY (SELECT salary FROM Employees WHERE department_id = 2);
\`\`\`

### Comparación de Rendimiento: \`> ALL\` vs \`> (SELECT MAX(...))\`
Aunque conceptualmente \`salary > ALL (SELECT salary FROM ...)\` y \`salary > (SELECT MAX(salary) FROM ...)\` retornan el mismo resultado para conjuntos no vacíos:
- **\`MAX()\` Escalar:** Suele ejecutarse con mayor velocidad porque el motor puede resolver el máximo directamente desde el extremo derecho de un índice B+ Tree sin evaluar tupla por tupla.
- **Tratamiento de Nulos:** Si el conjunto retornado por \`ALL\` contiene un valor \`NULL\`, la comparación puede degradarse a \`UNKNOWN\` para candidatos que de otro modo calificarían. Usar \`MAX()\` evita esta anomalía.

### El Caso Borde del Subconjunto Vacío
- Si la subconsulta retorna un conjunto vacío, **\`x > ALL (vacío)\` evalúa formalmente a \`TRUE\`** para todas las filas (por definición de verdad vacua en lógica matemática).
- Por el contrario, **\`x > ANY (vacío)\` evalúa formalmente a \`FALSE\`**.

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

### Antipatrón 1: Subconsulta Escalar en la Lista del \`SELECT\` (El Problema N+1 Interno)
\`\`\`sql
-- ❌ GRAVE ANTIPATRÓN EN PRODUCCIÓN:
SELECT 
    e.id, 
    e.name,
    (SELECT COUNT(*) FROM Orders o WHERE o.employee_id = e.id) AS order_count
FROM Employees e;
-- Consecuencia: El motor dispara una lectura por cada empleado individual.
-- Si Employees tiene 100,000 registros, ejecuta 100,001 consultas conceptuales.

-- ✅ SOLUCIÓN CANÓNICA STAFF: LEFT JOIN con pre-agregación en CTE o GROUP BY:
SELECT 
    e.id, 
    e.name, 
    COALESCE(oc.order_count, 0) AS order_count
FROM Employees e
LEFT JOIN (
    SELECT employee_id, COUNT(*) AS order_count
    FROM Orders
    GROUP BY employee_id
) oc ON e.id = oc.employee_id;
\`\`\`

### Antipatrón 2: La Trampa de \`NOT IN\` con Valores \`NULL\` en Subconsultas
Si la subconsulta ejecutada por \`NOT IN\` contiene al menos un valor nulo, la condición completa evalúa a \`UNKNOWN\` para todas las tuplas externas:
\`\`\`sql
-- ❌ FALLO SILENCIOSO EN PRODUCCIÓN:
-- Si un cliente nunca realizó órdenes y en la tabla Orders hay un registro con customer_id NULL:
SELECT customer_id, name FROM Customers 
WHERE customer_id NOT IN (SELECT customer_id FROM Orders);
-- ➔ Retorna 0 filas vacías, ignorando a clientes válidos sin pedidos.

-- ✅ REFACTORIZACIÓN ROBUSTA CON NOT EXISTS:
SELECT c.customer_id, c.name FROM Customers c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders o WHERE o.customer_id = c.customer_id
);
\`\`\`

### Antipatrón 3: Anidamiento Excesivo (> 3 Niveles) y Pérdida de Estadísticas
Anidar subconsultas dentro de subconsultas a más de 3 niveles destruye la capacidad del optimizador de costos para estimar cardinalidades intermedias. El motor pierde la capacidad de elegir adecuadamente el orden de join y recurre a tablas temporales no indexadas en disco (\`Created_tmp_disk_tables\`).
*Solución Staff Engineer:* Descompón siempre subconsultas anidadas de más de 2 niveles en CTEs encadenadas y documentadas.

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **Refactorización Refleja a Window Functions:** En ejercicios de entrevistas que piden comparar un registro contra su grupo (ej. "empleados con salario mayor al promedio de su departamento"), evita subconsultas correlacionadas en el \`WHERE\`. Utiliza una función de ventana en una CTE (\`AVG(salary) OVER (PARTITION BY dept_id)\`) y filtra en la capa superior. La complejidad se reduce de $O(N \times M)$ a $O(N \log N)$.
2. **Preferencia Incondicional por \`NOT EXISTS\`:** En cualquier problema de exclusión relacional de HackerRank, \`NOT EXISTS\` es invulnerable a la presencia de nulos y permite al motor aplicar optimizaciones de *Anti-Join* de forma nativa.
3. **Verificación de Alias en Tablas Derivadas:** En MySQL, olvidar el alias \`AS derived_table\` al final de una subconsulta en \`FROM\` provoca un error sintáctico inmediato (\`Every derived table must have its own alias\`). Acostúmbrate a nombrar siempre la tabla derivada.
`
  },
  {
    id: "window_functions",
    title: "Window Functions (El Corazón de SQL Avanzado)",
    badge: "Nivel Enterprise",
    icon: "Trophy",
    summary: "Anatomía de OVER(), ROW_NUMBER vs RANK vs DENSE_RANK, funciones de navegación LAG/LEAD y marcos de ventana ROWS BETWEEN.",
    guide: `
# 🏆 Window Functions (El Corazón de SQL Avanzado) en MySQL 8.0

Las **Window Functions** (incorporadas formalmente en el estándar ANSI SQL:2003 y disponibles nativamente en MySQL desde la versión 8.0) representan la evolución técnica más potente del lenguaje SQL. Permiten calcular métricas contextuales, acumulados móviles, rankings y desfases temporales **sin colapsar la granularidad de las tuplas individuales**, resolviendo en tiempo lineal $O(N \log N)$ problemas que antes requerían auto-uniones cuadráticas $O(N^2)$ o cursores lentos.

---

## 1. Fundamentos Teóricos y Procesamiento Lógico de Consultas

### La Diferencia Fundamental frente a \`GROUP BY\`
- **\`GROUP BY\`:** Colapsa múltiples registros en un único resumen agregado, perdiendo el detalle de las filas individuales.
- **\`WINDOW FUNCTIONS\`:** Conservan cada una de las filas físicas originales intactas, proyectando el cálculo agregado o analítico como una columna adicional en el contexto de cada tupla.

### El Pipeline Lógico Estricto de Ejecución
En la arquitectura del optimizador de MySQL, las etapas se evalúan en una secuencia inmutable:
\`\`\`text
1. FROM / JOIN        (Acoplamiento relacional de tuplas)
2. WHERE              (Filtrado fila por fila)
3. GROUP BY           (Agrupación relacional)
4. HAVING             (Filtrado de grupos agregados)
5. WINDOW FUNCTIONS   ◄── [SE EVALÚAN AQUÍ, TRAS FILTRAR Y AGRUPAR]
6. SELECT             (Proyección final de columnas)
7. DISTINCT           (Deduplicación de tuplas proyectadas)
8. ORDER BY           (Ordenamiento global de salida)
9. LIMIT              (Corte de paginación)
\`\`\`

### La Consecuencia Innegociable: Prohibición en \`WHERE\` y \`HAVING\`
Debido a que las funciones de ventana se ejecutan en el **Paso 5** (después de \`WHERE\` en el Paso 2 y \`HAVING\` en el Paso 4), **es sintácticamente imposible colocar una función de ventana directamente en \`WHERE\` o \`HAVING\`**:
\`\`\`sql
-- ❌ ERROR SINTÁCTICO FATAL EN MYSQL:
SELECT name, salary FROM Employees WHERE ROW_NUMBER() OVER (...) = 1;

-- ✅ REGLA DE ORO STAFF ENGINEER: Encapsular obligatoriamente en una CTE o Derived Table:
WITH RankedSalaries AS (
    SELECT name, salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
    FROM Employees
)
SELECT name, salary FROM RankedSalaries WHERE rnk = 1;
\`\`\`

---

## 2. Modelos Mentales Visuales en Diagramas ASCII / Unicode

### Anatomía del Marco Deslizante en una Partición Ordenada
\`\`\`text
┌──────────────────────────┐
│ MARCO SLIDING WINDOW        │
├──────────────────────────┤
│ Tupla 1 │ UNBOUNDED         │
│ Tupla 2 │ 1 PRECED          │
│ Tupla 3 │ CURRENT           │
│ Tupla 4 │ 1 FOLLOW          │
│ Tupla 5 │ UNBOUNDED         │
├─────────┴────────────────┤
│ ROW_NUM │ RANK│ DENS        │
└──────────────────────────┘
\`\`\`

### Comparación Rigurosa de Funciones de Ranking
\`\`\`text
 Puntaje de Entrada:    100      100      90       80       80       70
 ------------------------------------------------------------------------
 ROW_NUMBER()             1        2       3        4        5        6  (Secuencia estricta)
 RANK()                   1        1       3        4        4        6  (Empates generan huecos)
 DENSE_RANK()             1        1       2        3        3        4  (Empates sin huecos)
\`\`\`

### Anatomía de la Cláusula \`OVER()\` y Especificación de Marcos (Frames)
La sintaxis universal de una función de ventana está compuesta por tres modificadores:
\`\`\`sql
FUNCTION() OVER (
    [PARTITION BY col1, col2]  -- Delimita el subconjunto / partición
    [ORDER BY col_sort [ASC|DESC]]  -- Establece la secuencia temporal o métrica
    [ROWS|RANGE BETWEEN marco_inicio AND marco_fin] -- Delimita el marco móvil
)
\`\`\`

### La Gran Trampa del Marco por Defecto (\`RANGE\` vs \`ROWS\`)
Cuando incluyes un \`ORDER BY\` pero omites la especificación explícita del marco, el estándar SQL y MySQL 8.0 aplican por defecto:
\`\`\`sql
RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
\`\`\`
- **La Falla de \`RANGE\`:** \`RANGE\` no opera sobre filas físicas, sino sobre **valores lógicos**. Si existen tuplas con valores duplicados (*peers*) en la columna del \`ORDER BY\`, el marco abarca a todos los duplicados juntos, provocando que la suma acumulada (*running total*) salte en bloque con el total sumado de todos ellos en lugar de acumularse fila por fila.
- **El Modismo de Producción Staff Engineer:** Especifica siempre de forma explícita el marco físico basado en filas: \`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`.

---

## 3. Comportamiento Interno en MySQL 8.0 InnoDB y Query Planner

### Ejecución Interna en el Motor
1. **Paso Window Iterator:** En el árbol de ejecución de MySQL 8.0 (\`EXPLAIN FORMAT=TREE\`), las funciones de ventana se ejecutan a través de un iterador de ventana (*Window Iterator*) que consume un flujo de tuplas ordenado.
2. **Índice B+ Tree Óptimo:** Si existe un índice compuesto \`(partition_col, order_col)\`, el motor lee las tuplas ya ordenadas directamente de las páginas hoja de InnoDB, anotando en el plan \`Using index for window\`.
3. **Eliminación de Filesort:** Si el índice no existe o no cubre la partición y el ordenamiento, MySQL se ve obligado a disparar un costoso **Filesort** en memoria (\`sort_buffer_size\`) o en disco (\`Created_tmp_disk_tables\`), degradando drásticamente el rendimiento en tablas masivas.

---

## 4. Patrones de Producción y Modismos Canónicos (Staff Engineer Idioms)

### 1. Catálogo de Funciones Analíticas Canónicas
- **Ranking:** \`ROW_NUMBER()\` (únicos estrictos), \`RANK()\` (empates con huecos), \`DENSE_RANK()\` (empates sin huecos).
- **Navegación:** \`LAG(col, n, def)\` y \`LEAD(col, n, def)\` para desfases temporales.
- **Límites de Marco:** \`FIRST_VALUE(col)\` y \`LAST_VALUE(col)\` (declarando siempre \`ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING\` para ver el final del marco).
- **Distribución:** \`NTILE(k)\` (cuartiles, percentiles), \`CUME_DIST()\` (probabilidad acumulada).

### 2. Medias Móviles de 3 y 7 Días (Rolling Moving Averages)
\`\`\`sql
SELECT 
    record_date,
    daily_revenue,
    ROUND(
        AVG(daily_revenue) OVER (
            ORDER BY record_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ), 
        2
    ) AS rolling_7d_avg
FROM DailyFinancials;
\`\`\`

### 3. Crecimiento Período sobre Período (MoM / YoY Growth) con LAG
Calcular la tasa de crecimiento mensual protegiendo contra divisiones por cero:
\`\`\`sql
SELECT 
    sales_month,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY sales_month) AS prev_revenue,
    ROUND(
        COALESCE(
            100.0 * (revenue - LAG(revenue, 1) OVER (ORDER BY sales_month)) 
            / NULLIF(LAG(revenue, 1) OVER (ORDER BY sales_month), 0),
            0.00
        ),
        2
    ) AS mom_growth_pct
FROM MonthlyFinancials;
\`\`\`

### 4. Detección de Rachas Consecutivas (El Problema de Gaps & Islands)
Para identificar rachas ininterrumpidas de actividad diaria (LeetCode / HackerRank Hard):
\`\`\`sql
-- La diferencia matemática entre una fecha continua y un ROW_NUMBER() secuencial
-- produce una fecha base idéntica si y solo si los días son consecutivos:
WITH RankedActivity AS (
    SELECT 
        user_id,
        login_date,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS rn
    FROM UserLogins
),
GroupedIslands AS (
    SELECT 
        user_id,
        login_date,
        login_date - INTERVAL rn DAY AS island_group
    FROM RankedActivity
)
SELECT 
    user_id,
    island_group,
    MIN(login_date) AS streak_start,
    MAX(login_date) AS streak_end,
    COUNT(*) AS streak_length_days
FROM GroupedIslands
GROUP BY user_id, island_group
HAVING COUNT(*) >= 3;
\`\`\`

---

## 5. Antipatrones Reales de Producción y Escenarios de Falla

- **Antipatrón 1: Emular Acumulados con Auto-Joins Cuadráticos:** Usar \`LEFT JOIN Orders o2 ON o1.user_id = o2.user_id AND o2.date <= o1.date\` escala a $O(N^2)$, degradando la base de datos a latencias inaceptables. Sustitúyelo siempre por \`SUM(...) OVER (... ROWS BETWEEN ...)\`.
- **Antipatrón 2: Omitir \`PARTITION BY\` en Entornos Multi-Tenant:** Si olvidas la partición por cliente o empresa (\`PARTITION BY tenant_id\`), el ranking o acumulado mezclará registros de diferentes clientes, provocando una fuga crítica de aislamiento de datos en reportes.
- **Antipatrón 3: Sobreutilizar Ventanas sin Índices en Tablas Masivas:** Múltiples funciones de ventana con distintos \`PARTITION BY\` u \`ORDER BY\` en la misma consulta obligan al motor a ejecutar múltiples pasos de *filesort* sucesivos. Consolida las ventanas compatibles bajo una cláusula común con la sintaxis \`WINDOW w AS (PARTITION BY ... ORDER BY ...)\`:
\`\`\`sql
-- Consolida múltiples cálculos analíticos bajo una única definición de ventana:
SELECT 
    emp_id, department_id, salary,
    ROW_NUMBER() OVER w AS row_num,
    DENSE_RANK() OVER w AS dense_rk,
    SUM(salary)  OVER w AS running_dept_total
FROM Employees
WINDOW w AS (PARTITION BY department_id ORDER BY salary DESC ROWS UNBOUNDED PRECEDING);
\`\`\`

---

## 6. Heurísticas Avanzadas para Entrevistas FAANG / HackerRank y Producción

1. **La Regla de Oro del Filtrado por Ventana:** Jamás intentes filtrar por una función de ventana en el \`WHERE\`. Encapsula siempre la consulta en una CTE y filtra \`WHERE rnk = 1\` en la consulta exterior.
2. **Elección de Función de Ranking según Regla de Negocio:**
   - Si piden *"el empleado con mayor salario"* (estrictamente 1 fila por departamento): usa \`ROW_NUMBER()\` con desempate determinista (\`ORDER BY salary DESC, id DESC\`).
   - Si piden *"el top 3 de salarios distintos"* (admitiendo empates): usa \`DENSE_RANK() <= 3\`.
   - Si piden *"la posición en la tabla de clasificación"* (donde un empate deja vacante el siguiente puesto): usa \`RANK()\`.
3. **Optimización con Ventanas Nombradas (\`WINDOW\` Clause):** Cuando uses la misma especificación de partición y orden en múltiples columnas (\`ROW_NUMBER()\`, \`DENSE_RANK()\`, \`COUNT()\`), reutiliza una ventana nombrada (\`WINDOW w AS (...)\`) para reducir duplicación de código y facilitar la optimización del plan de ejecución.
`
  }
];

// List of progressive exercises
const problems = [
  // 1. NULLS
  {
    id: "nulls-1",
    topicId: "nulls",
    title: "1. Bono de Empleados (Employee Bonus)",
    difficulty: "Easy",
    description: `
Escribe una consulta SQL para reportar el nombre de cada empleado y el monto de su bono para todos los empleados que tengan un bono **menor a 1000** o **que no tengan ningún bono** (valor \`NULL\`).

### Tabla: \`Employee\`
| Column Name | Type |
| :--- | :--- |
| empId | int |
| name | varchar |
| supervisor | int |
| salary | int |

### Tabla: \`Bonus\`
| Column Name | Type |
| :--- | :--- |
| empId | int |
| bonus | int |

### Formato de Salida
| name | bonus |
| :--- | :--- |
| Brad | null |
| John | null |
| Dan | 500 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Bonus;
DROP TABLE IF EXISTS Employee;
CREATE TABLE Employee (empId INT PRIMARY KEY, name VARCHAR(50), supervisor INT, salary INT);
CREATE TABLE Bonus (empId INT PRIMARY KEY, bonus INT);
`,
    seedDML: `
INSERT INTO Employee VALUES (1, 'John', 3, 1000), (2, 'Dan', 3, 2000), (3, 'Brad', NULL, 4000), (4, 'Thomas', 3, 4000);
INSERT INTO Bonus VALUES (2, 500), (4, 2000);
`,
    starterCode: `SELECT \nFROM Employee e\nLEFT JOIN Bonus b ON ...;\n`,
    solutionSQL: `
SELECT e.name, b.bonus
FROM Employee e
LEFT JOIN Bonus b ON e.empId = b.empId
WHERE b.bonus < 1000 OR b.bonus IS NULL;
`,
    expectedColumns: ["name", "bonus"],
    orderMatters: false
  },
  {
    id: "nulls-2",
    topicId: "nulls",
    title: "2. Reconciliación de Nulos con IFNULL",
    difficulty: "Medium",
    description: `
Reporta todos los empleados con su salario total (\`salary + bonus\`). Si el empleado no tiene bono, el bono debe considerarse como 0. 
Renombra la columna calculada como \`total_payout\`.

### Formato de Salida
| name | total_payout |
| :--- | :--- |
| John | 1000 |
| Dan | 2500 |
| Brad | 4000 |
| Thomas | 6000 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Bonus;
DROP TABLE IF EXISTS Employee;
CREATE TABLE Employee (empId INT PRIMARY KEY, name VARCHAR(50), supervisor INT, salary INT);
CREATE TABLE Bonus (empId INT PRIMARY KEY, bonus INT);
`,
    seedDML: `
INSERT INTO Employee VALUES (1, 'John', 3, 1000), (2, 'Dan', 3, 2000), (3, 'Brad', NULL, 4000), (4, 'Thomas', 3, 4000);
INSERT INTO Bonus VALUES (2, 500), (4, 2000);
`,
    starterCode: `SELECT \nFROM Employee e\nLEFT JOIN Bonus b ON ...;\n`,
    solutionSQL: `
SELECT e.name, e.salary + IFNULL(b.bonus, 0) AS total_payout
FROM Employee e
LEFT JOIN Bonus b ON e.empId = b.empId;
`,
    expectedColumns: ["name", "total_payout"],
    orderMatters: false
  },

  // 2. ROUNDING
  {
    id: "rounding-1",
    topicId: "rounding",
    title: "3. Tiempo Promedio de Procesamiento por Máquina",
    difficulty: "Easy",
    description: `
Hay una tabla con logs de máquinas de fábrica. Cada proceso tiene un evento \`start\` y un evento \`end\`.
Calcula el tiempo promedio que le toma a cada máquina completar un proceso.
El tiempo debe redondearse a **3 decimales** con el nombre \`processing_time\`.

### Tabla: \`Activity\`
| machine_id | process_id | activity_type | timestamp |
| :--- | :--- | :--- | :--- |
| 0 | 0 | start | 0.712 |
| 0 | 0 | end | 1.520 |
| 0 | 1 | start | 3.140 |
| 0 | 1 | end | 4.120 |
| 1 | 0 | start | 0.550 |
| 1 | 0 | end | 1.550 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Activity;
CREATE TABLE Activity (machine_id INT, process_id INT, activity_type VARCHAR(10), timestamp FLOAT);
`,
    seedDML: `
INSERT INTO Activity VALUES 
(0, 0, 'start', 0.712), (0, 0, 'end', 1.520),
(0, 1, 'start', 3.140), (0, 1, 'end', 4.120),
(1, 0, 'start', 0.550), (1, 0, 'end', 1.550);
`,
    starterCode: `SELECT \nFROM Activity\nGROUP BY machine_id;\n`,
    solutionSQL: `
SELECT 
    a1.machine_id,
    ROUND(AVG(a2.timestamp - a1.timestamp), 3) AS processing_time
FROM Activity a1
JOIN Activity a2 
  ON a1.machine_id = a2.machine_id 
 AND a1.process_id = a2.process_id 
 AND a1.activity_type = 'start' 
 AND a2.activity_type = 'end'
GROUP BY a1.machine_id;
`,
    expectedColumns: ["machine_id", "processing_time"],
    orderMatters: false
  },

  // 3. JOINS
  {
    id: "joins-1",
    topicId: "joins",
    title: "4. Visitas sin Transacción (Anti-Join con ON AND)",
    difficulty: "Easy",
    description: `
Encuentra los IDs de los usuarios que visitaron el centro comercial pero no realizaron ninguna transacción, y el conteo de cuántas veces ocurrió esto.
Nombra las columnas \`customer_id\` y \`count_no_trans\`.

### Tabla: \`Visits\`
| visit_id | customer_id |
| :--- | :--- |
| 1 | 23 |
| 2 | 9 |
| 4 | 30 |
| 5 | 54 |

### Tabla: \`Transactions\`
| transaction_id | visit_id | amount |
| :--- | :--- | :--- |
| 2 | 5 | 310 |
| 3 | 5 | 300 |
| 9 | 5 | 200 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Visits;
CREATE TABLE Visits (visit_id INT PRIMARY KEY, customer_id INT);
CREATE TABLE Transactions (transaction_id INT PRIMARY KEY, visit_id INT, amount INT);
`,
    seedDML: `
INSERT INTO Visits VALUES (1, 23), (2, 9), (4, 30), (5, 54);
INSERT INTO Transactions VALUES (2, 5, 310), (3, 5, 300);
`,
    starterCode: `SELECT \nFROM Visits v\nLEFT JOIN Transactions t ON ...;\n`,
    solutionSQL: `
SELECT v.customer_id, COUNT(v.visit_id) AS count_no_trans
FROM Visits v
LEFT JOIN Transactions t ON v.visit_id = t.visit_id
WHERE t.transaction_id IS NULL
GROUP BY v.customer_id;
`,
    expectedColumns: ["customer_id", "count_no_trans"],
    orderMatters: false
  },

  // 4. DATES
  {
    id: "dates-1",
    topicId: "dates",
    title: "5. Temperaturas Crecientes (DATEDIFF & SUBDATE)",
    difficulty: "Easy",
    description: `
Escribe una consulta para encontrar todos los \`id\` de las fechas con temperaturas mayores comparadas con su fecha anterior previa (ayer).

### Tabla: \`Weather\`
| id | recordDate | temperature |
| :--- | :--- | :--- |
| 1 | 2015-01-01 | 10 |
| 2 | 2015-01-02 | 25 |
| 3 | 2015-01-03 | 20 |
| 4 | 2015-01-04 | 30 |

### Salida Esperada:
| id |
| :--- |
| 2 |
| 4 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Weather;
CREATE TABLE Weather (id INT PRIMARY KEY, recordDate DATE, temperature INT);
`,
    seedDML: `
INSERT INTO Weather VALUES 
(1, '2015-01-01', 10), 
(2, '2015-01-02', 25), 
(3, '2015-01-03', 20), 
(4, '2015-01-04', 30);
`,
    starterCode: `SELECT \nFROM Weather w1\nJOIN Weather w2 ON ...;\n`,
    solutionSQL: `
SELECT w1.id
FROM Weather w1
JOIN Weather w2 ON DATEDIFF(w1.recordDate, w2.recordDate) = 1
WHERE w1.temperature > w2.temperature;
`,
    expectedColumns: ["id"],
    orderMatters: false
  },

  // 5. STRINGS
  {
    id: "strings-1",
    topicId: "strings",
    title: "6. Corrección de Nombres (CONCAT, UPPER, LOWER)",
    difficulty: "Easy",
    description: `
Corrige los nombres para que solo el primer carácter sea mayúscula y el resto minúsculas.
Ordena el resultado por \`user_id\`.

### Tabla: \`Users\`
| user_id | name |
| :--- | :--- |
| 1 | aLice |
| 2 | bOB |

### Salida Esperada:
| user_id | name |
| :--- | :--- |
| 1 | Alice |
| 2 | Bob |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Users;
CREATE TABLE Users (user_id INT PRIMARY KEY, name VARCHAR(50));
`,
    seedDML: `
INSERT INTO Users VALUES (1, 'aLice'), (2, 'bOB');
`,
    starterCode: `SELECT \nFROM Users\nORDER BY user_id;\n`,
    solutionSQL: `
SELECT 
    user_id,
    CONCAT(UPPER(SUBSTRING(name, 1, 1)), LOWER(SUBSTRING(name, 2))) AS name
FROM Users
ORDER BY user_id;
`,
    expectedColumns: ["user_id", "name"],
    orderMatters: true
  },

  // 6. CTES
  {
    id: "ctes-1",
    topicId: "ctes",
    title: "7. Salarios por Encima del Promedio Departamental (CTEs Encadenadas)",
    difficulty: "Medium",
    description: `
Usa una CTE para calcular el salario promedio por departamento, y luego en la consulta principal reporta los empleados cuyo salario supere el promedio de su departamento.
Columnas: \`name\`, \`salary\`, \`dept_id\`.
`,
    schemaDDL: `
DROP TABLE IF EXISTS Staff;
CREATE TABLE Staff (id INT PRIMARY KEY, name VARCHAR(50), dept_id INT, salary INT);
`,
    seedDML: `
INSERT INTO Staff VALUES 
(1, 'Alice', 1, 70000), 
(2, 'Bob', 1, 60000), 
(3, 'Charlie', 2, 80000), 
(4, 'David', 2, 95000);
`,
    starterCode: `WITH DeptAvg AS (\n    SELECT \n)\nSELECT \nFROM Staff s\nJOIN DeptAvg d ON ...;\n`,
    solutionSQL: `
WITH DeptAvg AS (
    SELECT dept_id, AVG(salary) AS avg_sal
    FROM Staff
    GROUP BY dept_id
)
SELECT s.name, s.salary, s.dept_id
FROM Staff s
JOIN DeptAvg d ON s.dept_id = d.dept_id
WHERE s.salary > d.avg_sal;
`,
    expectedColumns: ["name", "salary", "dept_id"],
    orderMatters: false
  },

  // 7. WINDOW FUNCTIONS
  {
    id: "window-1",
    topicId: "window_functions",
    title: "8. Números Consecutivos (LEAD / LAG)",
    difficulty: "Medium",
    description: `
Encuentra todos los números que aparecen al menos tres veces consecutivas en la tabla de logs.
Retorna el resultado en la columna \`ConsecutiveNums\` sin duplicados.

### Tabla: \`Logs\`
| id | num |
| :--- | :--- |
| 1 | 1 |
| 2 | 1 |
| 3 | 1 |
| 4 | 2 |
| 5 | 1 |
| 6 | 2 |
| 7 | 2 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Logs;
CREATE TABLE Logs (id INT PRIMARY KEY, num INT);
`,
    seedDML: `
INSERT INTO Logs VALUES 
(1, 1), (2, 1), (3, 1), (4, 2), (5, 1), (6, 2), (7, 2);
`,
    starterCode: `SELECT DISTINCT num AS ConsecutiveNums\nFROM (\n    SELECT \n) t\nWHERE ...;\n`,
    solutionSQL: `
WITH RankedLogs AS (
    SELECT 
        num,
        LAG(num, 1) OVER (ORDER BY id) AS prev_num,
        LEAD(num, 1) OVER (ORDER BY id) AS next_num
    FROM Logs
)
SELECT DISTINCT num AS ConsecutiveNums
FROM RankedLogs
WHERE num = prev_num AND num = next_num;
`,
    expectedColumns: ["ConsecutiveNums"],
    orderMatters: false
  },
  {
    id: "window-2",
    topicId: "window_functions",
    title: "9. Top Salario por Departamento con DENSE_RANK",
    difficulty: "Medium",
    description: `
Encuentra los empleados que tienen el salario más alto en cada uno de los departamentos.
Si hay empates en el salario más alto, repórtalos a todos.
Columnas: \`Department\`, \`Employee\`, \`Salary\`.
`,
    schemaDDL: `
DROP TABLE IF EXISTS EmployeeDept;
DROP TABLE IF EXISTS Department;
CREATE TABLE Department (id INT PRIMARY KEY, name VARCHAR(50));
CREATE TABLE EmployeeDept (id INT PRIMARY KEY, name VARCHAR(50), salary INT, departmentId INT);
`,
    seedDML: `
INSERT INTO Department VALUES (1, 'IT'), (2, 'Sales');
INSERT INTO EmployeeDept VALUES 
(1, 'Joe', 85000, 1), 
(2, 'Henry', 80000, 2), 
(3, 'Sam', 60000, 2), 
(4, 'Max', 90000, 1), 
(5, 'Janet', 90000, 1);
`,
    starterCode: `WITH RankedSalaries AS (\n    SELECT \n)\nSELECT \nFROM RankedSalaries\nWHERE rnk = 1;\n`,
    solutionSQL: `
WITH RankedSalaries AS (
    SELECT 
        d.name AS Department,
        e.name AS Employee,
        e.salary AS Salary,
        DENSE_RANK() OVER (PARTITION BY e.departmentId ORDER BY e.salary DESC) AS rnk
    FROM EmployeeDept e
    JOIN Department d ON e.departmentId = d.id
)
SELECT Department, Employee, Salary
FROM RankedSalaries
WHERE rnk = 1;
`,
    expectedColumns: ["Department", "Employee", "Salary"],
    orderMatters: false
  }
];

export { topics };

const allTopics = [
  ...topics.filter(t => !advancedTopics.some(a => a.id === t.id)),
  ...advancedTopics
];

fs.writeFileSync(path.join(__dirname, 'curriculum', 'topics.json'), JSON.stringify(allTopics, null, 2), 'utf-8');

console.log(`[OK] Generados ${allTopics.length} temas (${topics.length} base + ${advancedTopics.length} avanzados) y ${problems.length} problemas en JSON.`);


