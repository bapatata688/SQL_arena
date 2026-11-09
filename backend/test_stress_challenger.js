import assert from 'node:assert/strict';
import pool from './db.js';
import { executeQuery } from './runner.js';
import { allProblems } from './problems_data.js';

async function runChallengerStressTests() {
  console.log('======================================================================');
  console.log('CHALLENGER STRESS SUITE: CONCURRENCY, TIMEOUTS & RESILIENCE');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function testHeader(name) {
    totalTests++;
    console.log(`[STRESS TEST ${totalTests}] ${name}...`);
  }

  function testPass(detail) {
    passedTests++;
    console.log(`  ✅ PASS: ${detail}\n`);
  }

  const pNulls1 = allProblems.find(p => p.id === 'nulls-1');
  const pNulls2 = allProblems.find(p => p.id === 'nulls-2');
  const pJoins1 = allProblems.find(p => p.id === 'joins-1');
  const pJoins2 = allProblems.find(p => p.id === 'joins-2');
  const pDates1 = allProblems.find(p => p.id === 'dates-1');
  const pWindow1 = allProblems.find(p => p.id === 'window-1');

  assert.ok(pNulls1 && pNulls2 && pJoins1 && pJoins2 && pDates1 && pWindow1, 'Test problems must all exist');

  // -------------------------------------------------------------------
  // TEST 1: High Concurrency Burst (12 concurrent queries across 6 problems)
  // -------------------------------------------------------------------
  testHeader('High Concurrency Burst (12 rapid concurrent queries across 6 problems)');
  const burstProblems = [
    { problem: pNulls1, sql: pNulls1.solutionSQL },
    { problem: pNulls2, sql: pNulls2.solutionSQL },
    { problem: pJoins1, sql: pJoins1.solutionSQL },
    { problem: pJoins2, sql: pJoins2.solutionSQL },
    { problem: pDates1, sql: pDates1.solutionSQL },
    { problem: pWindow1, sql: pWindow1.solutionSQL },
    { problem: pNulls1, sql: pNulls1.solutionSQL },
    { problem: pJoins2, sql: pJoins2.solutionSQL },
    { problem: pDates1, sql: pDates1.solutionSQL },
    { problem: pNulls2, sql: pNulls2.solutionSQL },
    { problem: pWindow1, sql: pWindow1.solutionSQL },
    { problem: pJoins1, sql: pJoins1.solutionSQL }
  ];

  const burstStart = Date.now();
  const burstResults = await Promise.all(
    burstProblems.map((item, idx) =>
      executeQuery(item.problem, item.sql, true).catch(err => ({
        error: err.message,
        status: 'EXCEPTION_THROWN'
      }))
    )
  );
  const burstElapsed = Date.now() - burstStart;

  burstResults.forEach((res, idx) => {
    assert.strictEqual(
      res.status,
      'ACCEPTED',
      `Burst query ${idx + 1} (${burstProblems[idx].problem.id}) failed with status: ${res.status}, error: ${res.error}`
    );
    assert.strictEqual(res.diff, null, `Burst query ${idx + 1} diff should be null`);
  });

  testPass(`All 12 concurrent queries executed sequentially without table collisions in ${burstElapsed}ms`);

  // -------------------------------------------------------------------
  // TEST 2: Timeout Interleaving and Immediate Recovery
  // -------------------------------------------------------------------
  testHeader('Recovery after Timeout: SELECT SLEEP(6) immediately followed by 5 valid queries');
  const timeoutQueryPromise = executeQuery(pNulls1, 'SELECT SLEEP(6);', true);

  // Immediately fire 5 valid queries behind it
  const followUpPromises = [
    executeQuery(pJoins1, pJoins1.solutionSQL, false),
    executeQuery(pNulls2, pNulls2.solutionSQL, true),
    executeQuery(pDates1, pDates1.solutionSQL, false),
    executeQuery(pWindow1, pWindow1.solutionSQL, true),
    executeQuery(pNulls1, pNulls1.solutionSQL, false)
  ];

  const tStart = Date.now();
  const [timeoutResult, ...followUpResults] = await Promise.all([
    timeoutQueryPromise,
    ...followUpPromises
  ]);
  const tElapsed = Date.now() - tStart;

  assert.strictEqual(timeoutResult.status, 'TIME_LIMIT_EXCEEDED', 'Timeout query must return TIME_LIMIT_EXCEEDED');
  assert.ok(
    timeoutResult.executionTimeMs >= 4800,
    `Timeout execution time should be >= 4800ms, got ${timeoutResult.executionTimeMs}ms`
  );

  followUpResults.forEach((res, i) => {
    assert.strictEqual(
      res.status,
      'ACCEPTED',
      `Follow-up query ${i + 1} failed after timeout with status: ${res.status}, error: ${res.error}`
    );
  });

  testPass(`Timeout caught in ${tElapsed}ms and all 5 queued follow-up queries recovered and succeeded cleanly`);

  // -------------------------------------------------------------------
  // TEST 3: Pool Replenishment Under Multiple Successive Timeouts
  // -------------------------------------------------------------------
  testHeader('Pool Replenishment Under Successive Timeouts (2 timeouts followed by valid queries)');
  const multiTimeoutResults = await Promise.all([
    executeQuery(pNulls1, 'SELECT SLEEP(6);', false),
    executeQuery(pJoins1, 'SELECT SLEEP(6);', false),
    executeQuery(pDates1, pDates1.solutionSQL, true)
  ]);

  assert.strictEqual(multiTimeoutResults[0].status, 'TIME_LIMIT_EXCEEDED', 'First timeout must trigger TIME_LIMIT_EXCEEDED');
  assert.strictEqual(multiTimeoutResults[1].status, 'TIME_LIMIT_EXCEEDED', 'Second timeout must trigger TIME_LIMIT_EXCEEDED');
  assert.strictEqual(multiTimeoutResults[2].status, 'ACCEPTED', 'Subsequent query must be ACCEPTED despite destroyed connections');

  testPass('Connection pool replenished destroyed connections without socket leak or pool exhaustion');

  // -------------------------------------------------------------------
  // TEST 4: Syntax Error Recovery & Fault Injection
  // -------------------------------------------------------------------
  testHeader('Syntax Error & Malformed Query Resilience');
  const errorScenarios = [
    { sql: 'SELECT * FROM non_existent_table_xyz;', expectedStatus: 'SYNTAX_ERROR' },
    { sql: 'SELECT FROM WHERE ;;;', expectedStatus: 'SYNTAX_ERROR' },
    { sql: 'SELECT ,,,', expectedStatus: 'SYNTAX_ERROR' },
    { sql: '   ', expectedStatus: 'SYNTAX_ERROR' },
    { sql: 'SELECT 1; CREATE TABLE hack (id INT);', expectedStatus: 'ERROR' },
    { sql: 'DROP TABLE Employee;', expectedStatus: 'ERROR' }
  ];

  for (let i = 0; i < errorScenarios.length; i++) {
    const errItem = errorScenarios[i];
    const errRes = await executeQuery(pNulls1, errItem.sql, false);
    assert.strictEqual(
      errRes.status,
      errItem.expectedStatus,
      `Scenario ${i + 1} (${errItem.sql}) returned unexpected status: ${errRes.status}`
    );
    assert.ok(errRes.error, `Scenario ${i + 1} must include an error message`);

    // Verify system immediately accepts a valid query right after each failure
    const recoveryRes = await executeQuery(pNulls1, pNulls1.solutionSQL, false);
    assert.strictEqual(recoveryRes.status, 'ACCEPTED', `Recovery after error ${i + 1} must be ACCEPTED`);
  }

  testPass('All 6 error/injection scenarios returned safe statuses and immediately recovered');

  // -------------------------------------------------------------------
  // TEST 5: Chaos Concurrency Burst (20 randomized mixed queries simultaneously)
  // -------------------------------------------------------------------
  testHeader('Chaos Concurrency Burst (20 simultaneous mixed queries: valid, errors, timeouts, DDL)');
  const chaosTasks = [
    // 6 valid solutions across diverse problems
    { p: pNulls1, sql: pNulls1.solutionSQL, expected: 'ACCEPTED' },
    { p: pNulls2, sql: pNulls2.solutionSQL, expected: 'ACCEPTED' },
    { p: pJoins1, sql: pJoins1.solutionSQL, expected: 'ACCEPTED' },
    { p: pJoins2, sql: pJoins2.solutionSQL, expected: 'ACCEPTED' },
    { p: pDates1, sql: pDates1.solutionSQL, expected: 'ACCEPTED' },
    { p: pWindow1, sql: pWindow1.solutionSQL, expected: 'ACCEPTED' },

    // 4 syntax / runtime error queries
    { p: pNulls1, sql: 'SELECT * FROM unknown_table_123;', expected: 'SYNTAX_ERROR' },
    { p: pJoins1, sql: 'SELECT invalid syntax @#$%^;', expected: 'SYNTAX_ERROR' },
    { p: pDates1, sql: 'SELECT empId, FROM Weather;', expected: 'SYNTAX_ERROR' },
    { p: pNulls2, sql: 'SELECT , FROM Missing;', expected: 'SYNTAX_ERROR' },

    // 3 wrong answers
    { p: pNulls1, sql: 'SELECT 9999 as bonus, "nobody" as name;', expected: 'WRONG_ANSWER' },
    { p: pJoins1, sql: 'SELECT 1 as customer_id, 2 as count_no_trans;', expected: 'WRONG_ANSWER' },
    { p: pDates1, sql: 'SELECT 1 as id WHERE 1=0;', expected: 'WRONG_ANSWER' },

    // 3 injection / DDL attempts
    { p: pNulls1, sql: 'SELECT 1; DROP TABLE Employee;', expected: 'ERROR' },
    { p: pJoins2, sql: 'CREATE TABLE injected_chaos (val INT);', expected: 'ERROR' },
    { p: pDates1, sql: 'ALTER TABLE Weather ADD COLUMN hack INT;', expected: 'ERROR' },

    // 2 timeout queries
    { p: pNulls2, sql: 'SELECT SLEEP(6);', expected: 'TIME_LIMIT_EXCEEDED' },
    { p: pJoins1, sql: 'SELECT SLEEP(6);', expected: 'TIME_LIMIT_EXCEEDED' },

    // 2 trailing valid queries
    { p: pNulls1, sql: pNulls1.solutionSQL, expected: 'ACCEPTED' },
    { p: pWindow1, sql: pWindow1.solutionSQL, expected: 'ACCEPTED' }
  ];

  const chaosStart = Date.now();
  const chaosResults = await Promise.all(
    chaosTasks.map(t => executeQuery(t.p, t.sql, true))
  );
  const chaosElapsed = Date.now() - chaosStart;

  chaosResults.forEach((res, i) => {
    const expected = chaosTasks[i].expected;
    assert.strictEqual(
      res.status,
      expected,
      `Chaos task ${i + 1} (${chaosTasks[i].p.id}) expected ${expected} but got ${res.status} (error: ${res.error})`
    );
  });

  testPass(`Chaos burst of 20 mixed queries resolved in ${chaosElapsed}ms with 100% status accuracy`);

  // -------------------------------------------------------------------
  // TEST 6: Connection Pool Health & Deadlock Verification
  // -------------------------------------------------------------------
  testHeader('Deadlock & Connection Leak Verification');

  const poolInternal = pool.pool;
  const allConnCount = poolInternal._allConnections.length;
  const freeConnCount = poolInternal._freeConnections.length;
  const queueCount = poolInternal._connectionQueue.length;

  console.log(`  [Pool Stats] All: ${allConnCount}, Free: ${freeConnCount}, Queue: ${queueCount}`);

  // In mysql2 pool, all active connections not currently checked out should be free
  const activeCheckedOut = allConnCount - freeConnCount;
  assert.strictEqual(activeCheckedOut, 0, `All connections in pool should be returned/free, got ${activeCheckedOut} checked out`);
  assert.strictEqual(queueCount, 0, `No requests should be waiting in connection queue, got ${queueCount}`);

  // Health check query through runner
  const finalCheck = await executeQuery(pNulls1, pNulls1.solutionSQL, false);
  assert.strictEqual(finalCheck.status, 'ACCEPTED', 'ExecutionMutex final health check must be ACCEPTED');

  testPass('Zero connection leaks detected, pool queue empty, ExecutionMutex 100% responsive');

  console.log('======================================================================');
  console.log(`STRESS TEST VERDICT: ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('======================================================================\n');

  await pool.end();
}

runChallengerStressTests().catch(err => {
  console.error('\n❌ CHALLENGER STRESS TEST FAILED:', err);
  process.exit(1);
});
