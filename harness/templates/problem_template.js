/**
 * Plantilla Canónica para Nuevos Ejercicios en SQL Arena
 * Guardar este objeto en problems_data.js o problems_advanced.js
 */
export const problemTemplate = {
  // Identificador único kebab-case
  id: "topic-N",
  
  // ID del tópico al que pertenece (definido en topics.json)
  topicId: "topic_name",
  
  // Título legible numerado con concepto clave
  title: "N. Título del Problema (Concepto Clave)",
  
  // Nivel de dificultad
  difficulty: "Medium", // "Easy" | "Medium" | "Hard"
  
  // Descripción completa en Markdown con enunciados claros y tablas de ejemplo
  description: `
Escribe una consulta SQL para reportar...

### Tabla: \`NombreTabla\`
| Column Name | Type |
| :--- | :--- |
| id | int |
| value | varchar(50) |

### Formato de Salida
| result_col_1 | result_col_2 |
| :--- | :--- |
| ... | ... |
`,

  // Sentencias DDL para inicializar el sandbox (debe ser idempotente con DROP TABLE)
  schemaDDL: `
DROP TABLE IF EXISTS NombreTabla;
CREATE TABLE NombreTabla (
    id INT PRIMARY KEY,
    value VARCHAR(50)
);
`,

  // Datos semilla DML (debe contener casos estándar y casos borde: nulos, empates o extremos)
  seedDML: `
INSERT INTO NombreTabla VALUES 
(1, 'Ejemplo 1'),
(2, 'Ejemplo 2'),
(3, NULL);
`,

  // Código con el que arranca el estudiante en el Monaco Editor
  starterCode: `SELECT \nFROM NombreTabla\nWHERE ...;\n`,

  // Solución SQL canónica de referencia (óptima y determinista)
  solutionSQL: `
SELECT id AS result_col_1, COALESCE(value, 'N/A') AS result_col_2
FROM NombreTabla
WHERE id > 0;
`,

  // Nombres exactos de las columnas esperadas en el resultado
  expectedColumns: ["result_col_1", "result_col_2"],

  // Si el orden de las filas es parte estricta del contrato del problema
  orderMatters: false
};

