// 21 Progressive Problems covering all 9 technical areas
export const allProblems = [
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
INSERT INTO Employee VALUES (1, 'John', 3, 1000), (2, 'Dan', 3, 2000), (3, 'Brad', NULL, 4000), (4, 'Thomas', 3, 4000), (5, 'Evelyn', 3, 3000);
INSERT INTO Bonus VALUES (2, 500), (4, 2000), (5, 1000);
`,
    starterCode: `SELECT \nFROM Employee e\nLEFT JOIN Bonus b ON e.empId = b.empId\nWHERE ...;\n`,
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
    starterCode: `SELECT e.name, ... AS total_payout\nFROM Employee e\nLEFT JOIN Bonus b ON e.empId = b.empId;\n`,
    solutionSQL: `
SELECT e.name, e.salary + IFNULL(b.bonus, 0) AS total_payout
FROM Employee e
LEFT JOIN Bonus b ON e.empId = b.empId;
`,
    expectedColumns: ["name", "total_payout"],
    orderMatters: false
  },
  {
    id: "nulls-3",
    topicId: "nulls",
    title: "3. La Trampa de NOT IN con Nulos (Anti-Join Seguro)",
    difficulty: "Medium",
    description: `
Tienes una tabla de clientes y una tabla de pedidos. Algunos pedidos tienen \`customer_id\` nulo (pedidos anónimos).
Encuentra los nombres de los clientes que **nunca han realizado un pedido**.
*Ojo: Un \`NOT IN\` tradicional fallará si la subconsulta contiene nulos. Demuestra cómo resolverlo con \`NOT EXISTS\` o \`LEFT JOIN ... WHERE IS NULL\`.*

### Tabla: \`Customers\`
| id | name |
| :--- | :--- |
| 1 | Joe |
| 2 | Henry |
| 3 | Sam |
| 4 | Max |

### Tabla: \`Orders\`
| id | customerId |
| :--- | :--- |
| 1 | 3 |
| 2 | 1 |
| 3 | NULL |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Customers;
CREATE TABLE Customers (id INT PRIMARY KEY, name VARCHAR(50));
CREATE TABLE Orders (id INT PRIMARY KEY, customerId INT);
`,
    seedDML: `
INSERT INTO Customers VALUES (1, 'Joe'), (2, 'Henry'), (3, 'Sam'), (4, 'Max');
INSERT INTO Orders VALUES (1, 3), (2, 1), (3, NULL);
`,
    starterCode: `SELECT name AS Customers\nFROM Customers c\nWHERE ...;\n`,
    solutionSQL: `
SELECT c.name AS Customers
FROM Customers c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders o WHERE o.customerId = c.id
);
`,
    expectedColumns: ["Customers"],
    orderMatters: false
  },

  // 2. ROUNDING
  {
    id: "rounding-1",
    topicId: "rounding",
    title: "4. Tiempo Promedio por Máquina (ROUND)",
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
    starterCode: `SELECT machine_id, ... AS processing_time\nFROM Activity\nGROUP BY machine_id;\n`,
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
  {
    id: "rounding-2",
    topicId: "rounding",
    title: "5. Tasa de Confirmación (Confirmation Rate)",
    difficulty: "Medium",
    description: `
La tasa de confirmación de un usuario es el número de mensajes \`confirmed\` dividido por el número total de solicitudes enviadas.
Si un usuario no envió ninguna solicitud, su tasa de confirmación debe ser \`0.00\`.
Redondea el resultado a **2 decimales** con el alias \`confirmation_rate\`.

### Tabla: \`Signups\`
| user_id |
| :--- |
| 3 |
| 7 |
| 2 |

### Tabla: \`Confirmations\`
| user_id | action |
| :--- | :--- |
| 3 | timeout |
| 3 | confirmed |
| 7 | confirmed |
| 7 | confirmed |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Confirmations;
DROP TABLE IF EXISTS Signups;
CREATE TABLE Signups (user_id INT PRIMARY KEY);
CREATE TABLE Confirmations (user_id INT, action VARCHAR(20));
`,
    seedDML: `
INSERT INTO Signups VALUES (3), (7), (2);
INSERT INTO Confirmations VALUES (3, 'timeout'), (3, 'confirmed'), (7, 'confirmed'), (7, 'confirmed');
`,
    starterCode: `SELECT s.user_id, ... AS confirmation_rate\nFROM Signups s\nLEFT JOIN Confirmations c ON s.user_id = c.user_id\nGROUP BY s.user_id;\n`,
    solutionSQL: `
SELECT 
    s.user_id,
    ROUND(IFNULL(AVG(c.action = 'confirmed'), 0), 2) AS confirmation_rate
FROM Signups s
LEFT JOIN Confirmations c ON s.user_id = c.user_id
GROUP BY s.user_id;
`,
    expectedColumns: ["user_id", "confirmation_rate"],
    orderMatters: false
  },

  // 3. JOINS
  {
    id: "joins-1",
    topicId: "joins",
    title: "6. Visitas sin Transacción (Anti-Join con ON AND)",
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
    starterCode: `SELECT v.customer_id, COUNT(...) AS count_no_trans\nFROM Visits v\nLEFT JOIN Transactions t ON ...;\n`,
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
  {
    id: "joins-2",
    topicId: "joins",
    title: "7. Triple Join: Clientes, Pedidos y Catálogo",
    difficulty: "Medium",
    description: `
Calcula el gasto total realizado por cada cliente sumando \`quantity * price\`.
Incluye a todos los clientes registrados, incluso si no han realizado compras (en cuyo caso su gasto total debe ser \`0\`).
Nombra las columnas \`customer_name\` y \`total_spent\`. Ordena por \`total_spent\` descendente.

### Tabla: \`Customers\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| name | varchar |

### Tabla: \`Products\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| name | varchar |
| price | decimal |

### Tabla: \`Orders\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| customer_id | int |
| product_id | int |
| quantity | int |

### Formato de Salida
| customer_name | total_spent |
| :--- | :--- |
| Alice | 1050.00 |
| Bob | 25.00 |
| Charlie | 0.00 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Products;
DROP TABLE IF EXISTS Customers;
CREATE TABLE Customers (id INT PRIMARY KEY, name VARCHAR(50));
CREATE TABLE Products (id INT PRIMARY KEY, name VARCHAR(50), price DECIMAL(10,2));
CREATE TABLE Orders (id INT PRIMARY KEY, customer_id INT, product_id INT, quantity INT);
`,
    seedDML: `
INSERT INTO Customers VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Charlie');
INSERT INTO Products VALUES (10, 'Laptop', 1000.00), (20, 'Mouse', 25.00);
INSERT INTO Orders VALUES (1, 1, 10, 1), (2, 1, 20, 2), (3, 2, 20, 1);
`,
    starterCode: `SELECT c.name AS customer_name, ...\nFROM Customers c\nLEFT JOIN Orders o ON ...\nLEFT JOIN Products p ON ...\nGROUP BY c.id, c.name\nORDER BY total_spent DESC;\n`,
    solutionSQL: `
SELECT 
    c.name AS customer_name,
    IFNULL(SUM(o.quantity * p.price), 0) AS total_spent
FROM Customers c
LEFT JOIN Orders o ON c.id = o.customer_id
LEFT JOIN Products p ON o.product_id = p.id
GROUP BY c.id, c.name
ORDER BY total_spent DESC;
`,
    expectedColumns: ["customer_name", "total_spent"],
    orderMatters: true
  },
  {
    id: "joins-3",
    topicId: "joins",
    title: "8. Self-Join: Empleados y sus Supervisores",
    difficulty: "Medium",
    description: `
Para cada empleado que sea supervisor (es decir, que al menos un empleado le reporte directamente), reporta su \`employee_id\`, su \`name\`, la cantidad de personas que le reportan (\`reports_count\`), y el promedio de edad de sus subordinados redondeado al entero más cercano (\`average_age\`).
Ordena por \`employee_id\`.

### Tabla: \`Employees\`
| Column Name | Type |
| :--- | :--- |
| employee_id | int |
| name | varchar |
| reports_to | int |
| age | int |

### Formato de Salida
| employee_id | name | reports_count | average_age |
| :--- | :--- | :--- | :--- |
| 9 | Hercy | 2 | 39 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Employees;
CREATE TABLE Employees (employee_id INT PRIMARY KEY, name VARCHAR(50), reports_to INT, age INT);
`,
    seedDML: `
INSERT INTO Employees VALUES 
(9, 'Hercy', NULL, 43),
(6, 'Alice', 9, 41),
(4, 'Bob', 9, 36),
(2, 'Winston', NULL, 37);
`,
    starterCode: `SELECT mgr.employee_id, mgr.name, ...\nFROM Employees emp\nJOIN Employees mgr ON ...\nGROUP BY mgr.employee_id, mgr.name\nORDER BY mgr.employee_id;\n`,
    solutionSQL: `
SELECT 
    mgr.employee_id,
    mgr.name,
    COUNT(emp.employee_id) AS reports_count,
    ROUND(AVG(emp.age)) AS average_age
FROM Employees emp
JOIN Employees mgr ON emp.reports_to = mgr.employee_id
GROUP BY mgr.employee_id, mgr.name
ORDER BY mgr.employee_id;
`,
    expectedColumns: ["employee_id", "name", "reports_count", "average_age"],
    orderMatters: true
  },

  // 4. DATES
  {
    id: "dates-1",
    topicId: "dates",
    title: "9. Temperaturas Crecientes (DATEDIFF)",
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
| 5 | 2015-01-10 | 35 |
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
(4, '2015-01-04', 30),
(5, '2015-01-10', 35);
`,
    starterCode: `SELECT w1.id\nFROM Weather w1\nJOIN Weather w2 ON DATEDIFF(...) = 1\nWHERE ...;\n`,
    solutionSQL: `
SELECT w1.id
FROM Weather w1
JOIN Weather w2 ON DATEDIFF(w1.recordDate, w2.recordDate) = 1
WHERE w1.temperature > w2.temperature;
`,
    expectedColumns: ["id"],
    orderMatters: false
  },
  {
    id: "dates-2",
    topicId: "dates",
    title: "10. Ventana Móvil de 30 Días (SUBDATE / DATE_SUB)",
    difficulty: "Medium",
    description: `
Encuentra los usuarios activos diarios para un período de 30 días que finaliza el \`2019-07-27\` inclusive.
Un usuario activo es aquel que realizó al menos una actividad en ese día.
Columnas: \`day\`, \`active_users\`.

### Tabla: \`UserActivity\`
| user_id | session_id | activity_date | activity_type |
| :--- | :--- | :--- | :--- |
| 1 | 1 | 2019-07-20 | open_session |
| 1 | 1 | 2019-07-20 | scroll_down |
| 2 | 4 | 2019-07-20 | open_session |
| 2 | 4 | 2019-07-21 | open_session |
| 3 | 2 | 2019-06-25 | open_session |
| 4 | 3 | 2019-06-27 | open_session |
`,
    schemaDDL: `
DROP TABLE IF EXISTS UserActivity;
CREATE TABLE UserActivity (user_id INT, session_id INT, activity_date DATE, activity_type VARCHAR(20));
`,
    seedDML: `
INSERT INTO UserActivity VALUES 
(1, 1, '2019-07-20', 'open_session'),
(1, 1, '2019-07-20', 'scroll_down'),
(2, 4, '2019-07-20', 'open_session'),
(2, 4, '2019-07-21', 'open_session'),
(3, 2, '2019-06-25', 'open_session'),
(4, 3, '2019-06-27', 'open_session');
`,
    starterCode: `SELECT activity_date AS day, COUNT(DISTINCT user_id) AS active_users\nFROM UserActivity\nWHERE activity_date BETWEEN ... AND ...\nGROUP BY activity_date;\n`,
    solutionSQL: `
SELECT 
    activity_date AS day, 
    COUNT(DISTINCT user_id) AS active_users
FROM UserActivity
WHERE activity_date BETWEEN DATE_SUB('2019-07-27', INTERVAL 29 DAY) AND '2019-07-27'
GROUP BY activity_date;
`,
    expectedColumns: ["day", "active_users"],
    orderMatters: false
  },

  // 5. DEDUPLICATION
  {
    id: "dedup-1",
    topicId: "deduplication",
    title: "11. Deduplicación Analítica con ROW_NUMBER()",
    difficulty: "Medium",
    description: `
En una tabla con registros duplicados por \`email\`, mantén únicamente el registro con el menor \`id\` para cada email.
Reporta las filas deduplicadas completas: \`id\`, \`email\`, \`name\`.
Ordena por \`id\` ascendente.

### Tabla: \`Person\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| email | varchar |
| name | varchar |

### Formato de Salida
| id | email | name |
| :--- | :--- | :--- |
| 1 | john@example.com | John Doe |
| 2 | bob@example.com | Bob Ross |
| 4 | alice@example.com | Alice Smith |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Person;
CREATE TABLE Person (id INT PRIMARY KEY, email VARCHAR(100), name VARCHAR(50));
`,
    seedDML: `
INSERT INTO Person VALUES 
(1, 'john@example.com', 'John Doe'),
(2, 'bob@example.com', 'Bob Ross'),
(3, 'john@example.com', 'John Aaron'),
(4, 'alice@example.com', 'Alice Smith');
`,
    starterCode: `WITH RankedPersons AS (\n    SELECT id, email, name, ... AS rn\n    FROM Person\n)\nSELECT id, email, name\nFROM RankedPersons\nWHERE rn = 1\nORDER BY id;\n`,
    solutionSQL: `
WITH RankedPersons AS (
    SELECT 
        id, 
        email, 
        name,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY id ASC) AS rn
    FROM Person
)
SELECT id, email, name
FROM RankedPersons
WHERE rn = 1
ORDER BY id;
`,
    expectedColumns: ["id", "email", "name"],
    orderMatters: true
  },
  {
    id: "dedup-2",
    topicId: "deduplication",
    title: "12. Materias Únicas por Profesor (COUNT DISTINCT)",
    difficulty: "Easy",
    description: `
Calcula el número de materias únicas que imparte cada profesor en la universidad.
Columnas: \`teacher_id\`, \`cnt\`.

### Tabla: \`Teacher\`
| teacher_id | subject_id | dept_id |
| :--- | :--- | :--- |
| 1 | 2 | 3 |
| 1 | 2 | 4 |
| 1 | 3 | 3 |
| 2 | 1 | 1 |
| 2 | 2 | 1 |
| 2 | 3 | 1 |
| 2 | 4 | 1 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Teacher;
CREATE TABLE Teacher (teacher_id INT, subject_id INT, dept_id INT);
`,
    seedDML: `
INSERT INTO Teacher VALUES 
(1, 2, 3), (1, 2, 4), (1, 3, 3),
(2, 1, 1), (2, 2, 1), (2, 3, 1), (2, 4, 1);
`,
    starterCode: `SELECT teacher_id, COUNT(...) AS cnt\nFROM Teacher\nGROUP BY teacher_id;\n`,
    solutionSQL: `
SELECT teacher_id, COUNT(DISTINCT subject_id) AS cnt
FROM Teacher
GROUP BY teacher_id;
`,
    expectedColumns: ["teacher_id", "cnt"],
    orderMatters: false
  },

  // 6. STRINGS
  {
    id: "strings-1",
    topicId: "strings",
    title: "13. Corrección de Nombres (CONCAT, UPPER, LOWER)",
    difficulty: "Easy",
    description: `
Corrige los nombres para que solo el primer carácter sea mayúscula y el resto minúsculas.
Ordena el resultado por \`user_id\`.

### Tabla: \`Users\`
| user_id | name |
| :--- | :--- |
| 1 | aLice |
| 2 | bOB |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Users;
CREATE TABLE Users (user_id INT PRIMARY KEY, name VARCHAR(50));
`,
    seedDML: `
INSERT INTO Users VALUES (1, 'aLice'), (2, 'bOB');
`,
    starterCode: `SELECT user_id, ... AS name\nFROM Users\nORDER BY user_id;\n`,
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
  {
    id: "strings-2",
    topicId: "strings",
    title: "14. Tweets Inválidos (CHAR_LENGTH vs LENGTH)",
    difficulty: "Easy",
    description: `
Encuentra los IDs de los tweets inválidos. Un tweet es inválido si el número de caracteres utilizados en el contenido del tweet es **estrictamente mayor a 15**.
*Atención al Staff Engineer:* Asegúrate de contar caracteres lógicos (\`CHAR_LENGTH\`) y no bytes físicos (\`LENGTH\`), para soportar caracteres multibyte y emojis.

### Tabla: \`Tweets\`
| tweet_id | content |
| :--- | :--- |
| 1 | Vote for Biden |
| 2 | Let us make America great again! |
| 3 | ñandú ñoño café |
| 4 | 🎉🎉🎉🎉🎉🎉🎉🎉 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Tweets;
CREATE TABLE Tweets (tweet_id INT PRIMARY KEY, content VARCHAR(100)) DEFAULT CHARSET=utf8mb4;
`,
    seedDML: `
INSERT INTO Tweets VALUES 
(1, 'Vote for Biden'),
(2, 'Let us make America great again!'),
(3, 'ñandú ñoño café'),
(4, '🎉🎉🎉🎉🎉🎉🎉🎉');
`,
    starterCode: `SELECT tweet_id\nFROM Tweets\nWHERE CHAR_LENGTH(...) > 15;\n`,
    solutionSQL: `
SELECT tweet_id
FROM Tweets
WHERE CHAR_LENGTH(content) > 15;
`,
    expectedColumns: ["tweet_id"],
    orderMatters: false
  },

  // 7. CTES
  {
    id: "ctes-1",
    topicId: "ctes",
    title: "15. Salarios Superiores al Promedio Departamental",
    difficulty: "Medium",
    description: `
Usa una CTE para calcular el salario promedio por departamento, y luego en la consulta principal reporta los empleados cuyo salario supere el promedio de su departamento.
Columnas: \`name\`, \`salary\`, \`dept_id\`.

### Tabla: \`Staff\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| name | varchar |
| dept_id | int |
| salary | int |

### Formato de Salida
| name | salary | dept_id |
| :--- | :--- | :--- |
| Alice | 70000 | 1 |
| David | 95000 | 2 |
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
    starterCode: `WITH DeptAvg AS (\n    SELECT \n)\nSELECT s.name, s.salary, s.dept_id\nFROM Staff s\nJOIN DeptAvg d ON s.dept_id = d.dept_id\nWHERE ...;\n`,
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
  {
    id: "ctes-2",
    topicId: "ctes",
    title: "16. Chained CTEs: Región Líder en Ventas",
    difficulty: "Hard",
    description: `
Tienes las ventas por sucursal y la región a la que pertenece cada una.
Usa **dos CTEs encadenadas**:
1. \`RegionalSales\`: Calcula la venta total por región.
2. \`TopRegion\`: Selecciona la región con la venta total máxima.
En la consulta final, reporta los nombres de las sucursales y sus ventas individuales que pertenezcan a dicha región líder.
Columnas: \`branch_name\`, \`sales\`. Ordena por \`sales\` desc.

### Tabla: \`Branches\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| branch_name | varchar |
| region | varchar |
| sales | decimal |

### Formato de Salida
| branch_name | sales |
| :--- | :--- |
| Soyapango Plaza | 22000.00 |
| San Salvador Central | 15000.00 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Branches;
CREATE TABLE Branches (id INT PRIMARY KEY, branch_name VARCHAR(50), region VARCHAR(20), sales DECIMAL(10,2));
`,
    seedDML: `
INSERT INTO Branches VALUES 
(1, 'San Salvador Central', 'Central', 15000.00),
(2, 'Soyapango Plaza', 'Central', 22000.00),
(3, 'Santa Ana Centro', 'Occidente', 12000.00),
(4, 'Sonsonate Puerto', 'Occidente', 8000.00),
(5, 'San Miguel Triángulo', 'Oriente', 19000.00);
`,
    starterCode: `WITH RegionalSales AS (\n    SELECT region, SUM(sales) AS total_sales\n    FROM Branches\n    GROUP BY region\n),\nTopRegion AS (\n    SELECT region\n    FROM RegionalSales\n    ORDER BY total_sales DESC\n    LIMIT 1\n)\nSELECT b.branch_name, b.sales\nFROM Branches b\nJOIN TopRegion tr ON b.region = tr.region\nORDER BY b.sales DESC;\n`,
    solutionSQL: `
WITH RegionalSales AS (
    SELECT region, SUM(sales) AS total_sales
    FROM Branches
    GROUP BY region
),
TopRegion AS (
    SELECT region
    FROM RegionalSales
    ORDER BY total_sales DESC
    LIMIT 1
)
SELECT b.branch_name, b.sales
FROM Branches b
JOIN TopRegion tr ON b.region = tr.region
ORDER BY b.sales DESC;
`,
    expectedColumns: ["branch_name", "sales"],
    orderMatters: true
  },

  // 8. SUBQUERIES
  {
    id: "subqueries-1",
    topicId: "subqueries",
    title: "17. Gerentes con al menos 5 Reportes Directos",
    difficulty: "Medium",
    description: `
Escribe una consulta para reportar a los gerentes que tienen al menos **5 subordinados directos**.
Retorna la columna \`name\`.

### Tabla: \`Employee\`
| id | name | department | managerId |
| :--- | :--- | :--- | :--- |
| 101 | John | A | null |
| 102 | Dan | A | 101 |
| 103 | James | A | 101 |
| 104 | Amy | A | 101 |
| 105 | Anne | A | 101 |
| 106 | Ron | B | 101 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Employee;
CREATE TABLE Employee (id INT PRIMARY KEY, name VARCHAR(50), department VARCHAR(5), managerId INT);
`,
    seedDML: `
INSERT INTO Employee VALUES 
(101, 'John', 'A', NULL),
(102, 'Dan', 'A', 101),
(103, 'James', 'A', 101),
(104, 'Amy', 'A', 101),
(105, 'Anne', 'A', 101),
(106, 'Ron', 'B', 101),
(107, 'Peter', 'B', NULL);
`,
    starterCode: `SELECT name\nFROM Employee\nWHERE id IN (\n    SELECT ...\n);\n`,
    solutionSQL: `
SELECT name
FROM Employee
WHERE id IN (
    SELECT managerId
    FROM Employee
    GROUP BY managerId
    HAVING COUNT(*) >= 5
);
`,
    expectedColumns: ["name"],
    orderMatters: false
  },
  {
    id: "subqueries-2",
    topicId: "subqueries",
    title: "18. Empleados Cuyo Manager Dejó la Empresa",
    difficulty: "Easy",
    description: `
Encuentra los IDs de los empleados cuyo salario es **estrictamente menor a $30,000** y cuyo manager directo ha dejado la compañía (es decir, el \`manager_id\` no existe en la columna \`employee_id\` de la tabla, pero es distinto de \`NULL\`).
Ordena por \`employee_id\`.

### Tabla: \`Employees\`
| Column Name | Type |
| :--- | :--- |
| employee_id | int |
| name | varchar |
| manager_id | int |
| salary | int |

### Formato de Salida
| employee_id |
| :--- |
| 11 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Employees;
CREATE TABLE Employees (employee_id INT PRIMARY KEY, name VARCHAR(50), manager_id INT, salary INT);
`,
    seedDML: `
INSERT INTO Employees VALUES 
(3, 'Mila', 9, 60301),
(12, 'Antonella', NULL, 31000),
(13, 'Emery', NULL, 67084),
(1, 'Kalel', 11, 21241),
(9, 'Mikaela', NULL, 50937),
(11, 'Joziah', 6, 28485);
`,
    starterCode: `SELECT employee_id\nFROM Employees\nWHERE salary < 30000\n  AND manager_id IS NOT NULL\n  AND manager_id NOT IN (SELECT employee_id FROM Employees)\nORDER BY employee_id;\n`,
    solutionSQL: `
SELECT employee_id
FROM Employees
WHERE salary < 30000
  AND manager_id IS NOT NULL
  AND manager_id NOT IN (
      SELECT employee_id FROM Employees WHERE employee_id IS NOT NULL
  )
ORDER BY employee_id;
`,
    expectedColumns: ["employee_id"],
    orderMatters: true
  },

  // 9. WINDOW FUNCTIONS
  {
    id: "window-1",
    topicId: "window_functions",
    title: "19. Números Consecutivos (LEAD / LAG)",
    difficulty: "Medium",
    description: `
Encuentra todos los números que aparecen al menos tres veces consecutivas en la tabla de logs.
Retorna el resultado en la columna \`ConsecutiveNums\` sin duplicados.

### Tabla: \`Logs\`
| id | num |
| :--- | :--- |
| 1 | 1 |
| 2 | 2 |
| 3 | 1 |
| 7 | 2 |
| 8 | 1 |
| 9 | 1 |
| 15 | 1 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS Logs;
CREATE TABLE Logs (id INT PRIMARY KEY, num INT);
`,
    seedDML: `
INSERT INTO Logs VALUES 
(1, 1), (2, 2), (3, 1), (7, 2), (8, 1), (9, 1), (15, 1);
`,
    starterCode: `WITH RankedLogs AS (\n    SELECT \n        num,\n        LAG(num, 1) OVER (ORDER BY id) AS prev_num,\n        LEAD(num, 1) OVER (ORDER BY id) AS next_num\n    FROM Logs\n)\nSELECT DISTINCT num AS ConsecutiveNums\nFROM RankedLogs\nWHERE ...;\n`,
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
    title: "20. Top Salario por Departamento (DENSE_RANK)",
    difficulty: "Medium",
    description: `
Encuentra los empleados que tienen el salario más alto en cada uno de los departamentos.
Si hay empates en el salario más alto, repórtalos a todos.
Columnas: \`Department\`, \`Employee\`, \`Salary\`.

### Tabla: \`Department\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| name | varchar |

### Tabla: \`EmployeeDept\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| name | varchar |
| salary | int |
| departmentId | int |

### Formato de Salida
| Department | Employee | Salary |
| :--- | :--- | :--- |
| IT | Max | 90000 |
| IT | Janet | 90000 |
| Sales | Henry | 80000 |
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
    starterCode: `WITH RankedSalaries AS (\n    SELECT \n        d.name AS Department,\n        e.name AS Employee,\n        e.salary AS Salary,\n        DENSE_RANK() OVER (PARTITION BY ... ORDER BY ... DESC) AS rnk\n    FROM EmployeeDept e\n    JOIN Department d ON e.departmentId = d.id\n)\nSELECT Department, Employee, Salary\nFROM RankedSalaries\nWHERE rnk = 1;\n`,
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
  },
  {
    id: "window-3",
    topicId: "window_functions",
    title: "21. Suma Acumulativa Móvil (Running Total)",
    difficulty: "Hard",
    description: `
Calcula la suma acumulativa de transacciones (\`running_total\`) para cada cliente a lo largo del tiempo ordenada cronológicamente por \`transaction_date\` y \`id\`.
Columnas: \`customer_id\`, \`transaction_date\`, \`amount\`, \`running_total\`.

### Tabla: \`BankTransactions\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| customer_id | int |
| transaction_date | date |
| amount | decimal |

### Formato de Salida
| customer_id | transaction_date | amount | running_total |
| :--- | :--- | :--- | :--- |
| 101 | 2023-01-01 | 500.00 | 500.00 |
| 101 | 2023-01-05 | 250.00 | 750.00 |
| 101 | 2023-01-10 | -100.00 | 650.00 |
| 102 | 2023-01-02 | 1200.00 | 1200.00 |
| 102 | 2023-01-08 | -300.00 | 900.00 |
`,
    schemaDDL: `
DROP TABLE IF EXISTS BankTransactions;
CREATE TABLE BankTransactions (id INT PRIMARY KEY, customer_id INT, transaction_date DATE, amount DECIMAL(10,2));
`,
    seedDML: `
INSERT INTO BankTransactions VALUES 
(1, 101, '2023-01-01', 500.00),
(2, 101, '2023-01-05', 250.00),
(3, 101, '2023-01-10', -100.00),
(4, 102, '2023-01-02', 1200.00),
(5, 102, '2023-01-08', -300.00);
`,
    starterCode: `SELECT \n    customer_id,\n    transaction_date,\n    amount,\n    SUM(amount) OVER (\n        PARTITION BY ...\n        ORDER BY ...\n        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n    ) AS running_total\nFROM BankTransactions\nORDER BY customer_id, transaction_date, id;\n`,
    solutionSQL: `
SELECT 
    customer_id,
    transaction_date,
    amount,
    SUM(amount) OVER (
        PARTITION BY customer_id
        ORDER BY transaction_date, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total
FROM BankTransactions
ORDER BY customer_id, transaction_date, id;
`,
    expectedColumns: ["customer_id", "transaction_date", "amount", "running_total"],
    orderMatters: true
  }
];


import { advancedProblems } from './problems_advanced.js';
allProblems.push(...advancedProblems);

// Harden dates-4 seed to catch NULL on zero approved transactions
const dates4Problem = allProblems.find(p => p.id === 'dates-4');
if (dates4Problem) {
  dates4Problem.seedDML = `\nINSERT INTO Transactions VALUES (121,'US','approved',1000,'2018-12-18'),(122,'US','declined',2000,'2018-12-19'),(123,'US','approved',2000,'2019-01-01'),(124,'DE','approved',2000,'2019-01-07'),(125,'CA','declined',500,'2019-01-15');\n`;
  dates4Problem.description = dates4Problem.description.replace(
    "| 124 | DE | approved | 2000 | 2019-01-07 |",
    "| 124 | DE | approved | 2000 | 2019-01-07 |\n| 125 | CA | declined | 500 | 2019-01-15 |"
  );
}

