import { allProblems } from './problems_data.js';
import { executeQuery } from './runner.js';
import pool from './db.js';

async function testAll() {
  console.log(`Starting execution test of all ${allProblems.length} problem solutions in MySQL...`);
  let passed = 0;
  let failed = 0;

  for (const problem of allProblems) {
    try {
      const result = await executeQuery(problem, problem.solutionSQL, true);
      if (result.status === 'ACCEPTED') {
        console.log(`✅ [PASS] ${problem.id}: ${problem.title} (${result.executionTimeMs}ms)`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${problem.id}: ${problem.title} -> status: ${result.status}`);
        if (result.diff) console.error(JSON.stringify(result.diff, null, 2));
        if (result.error) console.error(result.error);
        failed++;
      }
    } catch (err) {
      console.error(`💥 [ERROR] ${problem.id}: ${problem.title}`, err);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passed} PASSED / ${failed} FAILED (Total: ${allProblems.length})`);
  console.log(`========================================\n`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

testAll();

