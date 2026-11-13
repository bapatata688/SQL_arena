#!/usr/bin/env node
import { validateTopics } from './validators/validate_topic.js';
import { validateProblem, validateAllProblems } from './validators/validate_problem.js';

const command = process.argv[2] || 'help';
const arg = process.argv[3];

async function run() {
  switch (command) {
    case 'lint-topics': {
      const res = validateTopics();
      process.exit(res.success ? 0 : 1);
      break;
    }

    case 'test-problem': {
      if (!arg) {
        console.error('Error: Debes especificar el ID del problema. Ej: node harness/cli.js test-problem rounding-1');
        process.exit(1);
      }
      try {
        const res = await validateProblem(arg, { checkAdversarialEmpty: true });
        if (res.success) {
          console.log(`\n[PASS] Problema "${res.id}" validado correctamente.`);
          console.log(`   - Filas obtenidas: ${res.rowCount}`);
          console.log(`   - Latencia: ${res.executionTimeMs}ms`);
          if (res.warnings.length > 0) {
            console.log(`   - Advertencias:`);
            res.warnings.forEach(w => console.log(`      ${w}`));
          }
          console.log();
          process.exit(0);
        } else {
          console.error(`\n[FAIL] Problema "${res.id}" tiene errores de validación:`);
          res.errors.forEach(e => console.error(`   - ${e}`));
          console.log();
          process.exit(1);
        }
      } catch (err) {
        console.error(`\nError fatal al validar "${arg}":`, err.message, '\n');
        process.exit(1);
      }
      break;
    }

    case 'test-all-problems': {
      try {
        const res = await validateAllProblems();
        process.exit(res.success ? 0 : 1);
      } catch (err) {
        console.error('Error fatal:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'validate-all': {
      console.log(`\n================================================================`);
      console.log(`INICIANDO HARNESS COMPLETO DE CALIDAD (SSoT) EN SQL ARENA`);
      console.log(`================================================================\n`);

      const topicRes = validateTopics();
      let problemRes;
      try {
        problemRes = await validateAllProblems();
      } catch (err) {
        console.error('Error validando problemas:', err.message);
        process.exit(1);
      }

      console.log(`\n================================================================`);
      console.log(`REPORTE CONSOLIDADO DEL HARNESS`);
      console.log(`================================================================`);
      console.log(`• Guías Teóricas: ${topicRes.passedCount}/${topicRes.totalCount} Aprobadas`);
      console.log(`• Ejercicios Prácticos: ${problemRes.passCount}/${problemRes.results.length} Aprobados`);
      console.log(`================================================================\n`);

      const allSuccess = topicRes.success && problemRes.success;
      process.exit(allSuccess ? 0 : 1);
      break;
    }

    case 'help':
    default: {
      console.log(`
Uso del CLI de Harness para SQL Arena:
  node harness/cli.js lint-topics              Valida que las guías teóricas cumplan el estándar Staff (6 secciones, ASCII, etc.)
  node harness/cli.js test-problem <id>        Ejecuta y verifica un problema en MySQL sandbox con casos borde
  node harness/cli.js test-all-problems        Ejecuta la suite completa de problemas en MySQL sandbox
  node harness/cli.js validate-all             Ejecuta el linter de guías y el harness de todos los ejercicios
      `);
      process.exit(0);
    }
  }
}

run();

