import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pool from '../../backend/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROBLEMS_PATH = path.join(__dirname, '..', '..', 'backend', 'curriculum', 'problems.json');

export async function validateProblem(problemOrId, options = { checkAdversarialEmpty: false }) {
  let problem = problemOrId;
  if (typeof problemOrId === 'string') {
    if (!fs.existsSync(PROBLEMS_PATH)) {
      throw new Error(`problems.json no existe en ${PROBLEMS_PATH}`);
    }
    const problems = JSON.parse(fs.readFileSync(PROBLEMS_PATH, 'utf-8'));
    problem = problems.find(p => p.id === problemOrId);
    if (!problem) {
      throw new Error(`Problema con ID "${problemOrId}" no fue encontrado en problems.json`);
    }
  }

  const errors = [];
  const warnings = [];

  // 1. Verificación Estática de Propiedades
  const requiredFields = ['id', 'topicId', 'title', 'difficulty', 'description', 'schemaDDL', 'seedDML', 'solutionSQL', 'expectedColumns'];
  for (const field of requiredFields) {
    if (!problem[field]) {
      errors.push(`Campo requerido ausente o vacío: "${field}"`);
    }
  }

  if (problem.expectedColumns && !Array.isArray(problem.expectedColumns)) {
    errors.push('expectedColumns debe ser un arreglo de strings');
  }

  if (errors.length > 0) {
    return { id: problem.id, success: false, errors, warnings };
  }

  // 2. Verificación Dinámica contra MySQL 8 Sandbox
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('USE sql_arena_sandbox;');

    // Ejecutar DDL
    try {
      await conn.query(problem.schemaDDL);
    } catch (ddlErr) {
      errors.push(`Fallo al ejecutar schemaDDL: ${ddlErr.message}`);
      return { id: problem.id, success: false, errors, warnings };
    }

    // Ejecutar DML
    try {
      await conn.query(problem.seedDML);
    } catch (dmlErr) {
      errors.push(`Fallo al ejecutar seedDML: ${dmlErr.message}`);
      return { id: problem.id, success: false, errors, warnings };
    }

    // Ejecutar Solución de Referencia
    const startTime = Date.now();
    let rows, fields;
    try {
      [rows, fields] = await conn.query({
        sql: problem.solutionSQL,
        timeout: 5000
      });
    } catch (sqlErr) {
      errors.push(`Fallo de ejecución en solutionSQL: ${sqlErr.message}`);
      return { id: problem.id, success: false, errors, warnings };
    }
    const executionTimeMs = Date.now() - startTime;

    // Normalizar filas y campos
    const actualRows = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
    const actualFields = Array.isArray(fields) && Array.isArray(fields[0]) ? fields[0] : fields;
    const actualColumns = actualFields?.map(f => f.name.toLowerCase()) || [];
    const expectedCols = (problem.expectedColumns || []).map(c => c.toLowerCase());

    // Validar Columnas
    if (actualColumns.length !== expectedCols.length) {
      errors.push(`Cantidad de columnas no coincide: esperadas ${expectedCols.length} (${expectedCols.join(', ')}), obtenidas ${actualColumns.length} (${actualColumns.join(', ')})`);
    } else {
      for (let i = 0; i < expectedCols.length; i++) {
        if (actualColumns[i] !== expectedCols[i]) {
          errors.push(`Descuadre posicional de columna en índice ${i}: esperada "${expectedCols[i]}", obtenida "${actualColumns[i]}"`);
        }
      }
    }

    // Validar que retorne filas en la semilla estándar
    if (actualRows.length === 0) {
      warnings.push('La solución retornó 0 filas con el seedDML estándar. Verifica si el dataset es suficiente.');
    }

    // Validar tiempo de ejecución razonable
    if (executionTimeMs > 2000) {
      warnings.push(`Tiempo de ejecución elevado: ${executionTimeMs}ms (Umbral óptimo < 200ms)`);
    }

    // 3. Prueba de Estrés: Caso Borde Tabla Vacía (si se solicita)
    if (options.checkAdversarialEmpty) {
      try {
        await conn.query(problem.schemaDDL); // Resetear a tablas vacías sin seedDML
        await conn.query({ sql: problem.solutionSQL, timeout: 5000 });
      } catch (emptyErr) {
        warnings.push(`La solución falló cuando las tablas estaban vacías: ${emptyErr.message}`);
      }
    }

    return {
      id: problem.id,
      title: problem.title,
      success: errors.length === 0,
      executionTimeMs,
      rowCount: actualRows.length,
      errors,
      warnings
    };
  } catch (connErr) {
    errors.push(`Error de conexión con MySQL: ${connErr.message}`);
    return { id: problem.id, success: false, errors, warnings };
  } finally {
    if (conn) conn.release();
  }
}

export async function validateAllProblems() {
  if (!fs.existsSync(PROBLEMS_PATH)) {
    throw new Error(`problems.json no encontrado en ${PROBLEMS_PATH}`);
  }
  const problems = JSON.parse(fs.readFileSync(PROBLEMS_PATH, 'utf-8'));
  console.log(`\n======================================================`);
  console.log(`🔎 VALIDANDO HARNESS DE EJERCICIOS PRACTICOS (${problems.length} problemas)`);
  console.log(`======================================================\n`);

  let passCount = 0;
  let failCount = 0;
  const results = [];

  for (const prob of problems) {
    const res = await validateProblem(prob);
    results.push(res);
    if (res.success) {
      passCount++;
      console.log(`✅ [PASS] ${res.id.padEnd(16)}: "${res.title}" (${res.rowCount} filas, ${res.executionTimeMs}ms)`);
      if (res.warnings.length > 0) {
        res.warnings.forEach(w => console.log(`   ⚠️  Aviso: ${w}`));
      }
    } else {
      failCount++;
      console.log(`❌ [FAIL] ${res.id.padEnd(16)}: "${res.title || prob.id}"`);
      res.errors.forEach(e => console.log(`   - Error: ${e}`));
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`Resumen de Ejercicios: ${passCount}/${problems.length} APROBADOS (${failCount} fallos)`);
  console.log(`------------------------------------------------------\n`);

  return { success: failCount === 0, passCount, failCount, results };
}

// Ejecución directa desde CLI
if (process.argv[1] && process.argv[1].endsWith('validate_problem.js')) {
  const targetId = process.argv[2];
  if (targetId) {
    validateProblem(targetId, { checkAdversarialEmpty: true })
      .then(res => {
        if (res.success) {
          console.log(`✅ [PASS] Problema "${res.id}" validado con éxito (${res.rowCount} filas, ${res.executionTimeMs}ms)`);
          process.exit(0);
        } else {
          console.error(`❌ [FAIL] Problema "${res.id}" falló la validación:`);
          res.errors.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }
      })
      .catch(err => {
        console.error('Error fatal:', err.message);
        process.exit(1);
      });
  } else {
    validateAllProblems()
      .then(res => process.exit(res.success ? 0 : 1))
      .catch(err => {
        console.error('Error fatal:', err.message);
        process.exit(1);
      });
  }
}

