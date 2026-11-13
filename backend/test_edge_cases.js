import assert from 'node:assert/strict';
import pool from './db.js';
import { executeQuery, splitStatements } from './runner.js';
import { allProblems } from './problems_data.js';
import { reloadCurriculum } from './server.js';
import { logSubmission, getTelemetrySummary } from './telemetry.js';

async function runEdgeCaseTests() {
  console.log('============================================================');
  console.log('STARTING SQL ARENA EDGE CASE & HARNESS VERIFICATION SUITE');
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function testHeader(name) {
    totalTests++;
    console.log(`[TEST ${totalTests}] ${name}...`);
  }

  function testPass(detail) {
    passedTests++;
    console.log(`  PASS: ${detail}\n`);
  }

  const pNulls1 = allProblems.find(p => p.id === 'nulls-1');
  assert.ok(pNulls1, 'Problem nulls-1 must exist');

  // -------------------------------------------------------------
  // TEST 1: Swapped column order detection
  // -------------------------------------------------------------
  testHeader('Swapped column detection (nulls-1: bonus, name instead of name, bonus)');
  const swappedSQL = 'SELECT b.bonus, e.name FROM Employee e LEFT JOIN Bonus b ON e.empId = b.empId WHERE b.bonus < 1000 OR b.bonus IS NULL;';
  const swappedRes = await executeQuery(pNulls1, swappedSQL, true);

  assert.strictEqual(swappedRes.status, 'WRONG_ANSWER', 'Status must be WRONG_ANSWER');
  assert.ok(swappedRes.diff, 'diff object must exist');
  assert.strictEqual(swappedRes.diff.columnOrderMismatch, true, 'diff.columnOrderMismatch must be true');
  assert.strictEqual(swappedRes.diff.columnMismatch, false, 'diff.columnMismatch should be false when column names match as set');
  assert.deepStrictEqual(swappedRes.diff.actualColumns, ['bonus', 'name']);
  assert.deepStrictEqual(swappedRes.diff.expectedColumns, ['name', 'bonus']);
  testPass('Swapped columns correctly flagged with columnOrderMismatch: true and WRONG_ANSWER');

  // -------------------------------------------------------------
  // TEST 2: Zero-row column preservation
  // -------------------------------------------------------------
  testHeader('Zero-row column metadata extraction (nulls-1: WHERE 1=0)');
  const zeroRowSQL = 'SELECT e.name, b.bonus FROM Employee e LEFT JOIN Bonus b ON e.empId = b.empId WHERE 1=0;';
  const zeroRowRes = await executeQuery(pNulls1, zeroRowSQL, true);

  assert.strictEqual(zeroRowRes.status, 'WRONG_ANSWER', 'Status must be WRONG_ANSWER due to row count');
  assert.ok(zeroRowRes.diff, 'diff object must exist');
  assert.deepStrictEqual(zeroRowRes.diff.actualColumns, ['name', 'bonus'], 'actualColumns must preserve projected columns');
  assert.strictEqual(zeroRowRes.diff.columnMismatch, false, 'columnMismatch must be false');
  assert.strictEqual(zeroRowRes.diff.columnOrderMismatch, false, 'columnOrderMismatch must be false');
  assert.strictEqual(zeroRowRes.diff.actualRowCount, 0, 'actualRowCount must be 0');
  assert.strictEqual(zeroRowRes.diff.rowCountMismatch, true, 'rowCountMismatch must be true');
  testPass('0 rows preserved column metadata [name, bonus] from fields array without columnMismatch');

  // -------------------------------------------------------------
  // TEST 3: Stacked query rejection (Security isolation)
  // -------------------------------------------------------------
  testHeader('Stacked statement query rejection & DDL block');
  const stackedSQL = 'SELECT 1; CREATE TABLE hack_verification_tbl (id INT);';
  const stackedRes = await executeQuery(pNulls1, stackedSQL, true);

  assert.strictEqual(stackedRes.status, 'ERROR', 'Status must be ERROR');
  assert.strictEqual(stackedRes.error, 'Multiple statements are not permitted');

  // Verify that the table was NEVER created in MySQL
  const conn = await pool.getConnection();
  try {
    const [tbls] = await conn.query("SHOW TABLES LIKE 'hack_verification_tbl';");
    assert.strictEqual(tbls.length, 0, 'hack_verification_tbl table must NOT exist in database');
  } finally {
    conn.release();
  }
  testPass('Stacked query was rejected without executing or creating physical table');

  // -------------------------------------------------------------
  // TEST 4: Non-SELECT / Non-WITH statement rejection
  // -------------------------------------------------------------
  testHeader('Standalone DDL/DML injection rejection');
  const ddlOnlySQL = 'CREATE TABLE standalone_hack (id INT);';
  const ddlRes = await executeQuery(pNulls1, ddlOnlySQL, true);

  assert.strictEqual(ddlRes.status, 'ERROR', 'Status must be ERROR');
  assert.ok(ddlRes.error.includes('Only SELECT and WITH statements are permitted'), 'Error must specify restriction');

  const conn2 = await pool.getConnection();
  try {
    const [tbls2] = await conn2.query("SHOW TABLES LIKE 'standalone_hack';");
    assert.strictEqual(tbls2.length, 0, 'standalone_hack table must NOT exist in database');
  } finally {
    conn2.release();
  }
  testPass('Direct DDL statement was blocked and table was not created');

  // -------------------------------------------------------------
  // TEST 5: Query timeout protection (SELECT SLEEP(6))
  // -------------------------------------------------------------
  testHeader('Execution timeout protection (SELECT SLEEP(6))');
  const sleepStart = Date.now();
  const sleepRes = await executeQuery(pNulls1, 'SELECT SLEEP(6);', true);
  const sleepElapsed = Date.now() - sleepStart;

  assert.strictEqual(sleepRes.status, 'TIME_LIMIT_EXCEEDED', 'Status must be TIME_LIMIT_EXCEEDED');
  assert.ok(sleepElapsed >= 4800 && sleepElapsed <= 7500, `Elapsed time must be around 5000ms (got ${sleepElapsed}ms)`);
  testPass(`Query timed out after ${sleepElapsed}ms with status: TIME_LIMIT_EXCEEDED`);

  // -------------------------------------------------------------
  // TEST 6: Date & String Normalization (Preserving timestamps and leading zeroes)
  // -------------------------------------------------------------
  testHeader('Date strings, Datetime preservation, and zip code non-truncation');
  const pDates1 = allProblems.find(p => p.id === 'dates-1');
  assert.ok(pDates1, 'Problem dates-1 must exist');

  // Reference solution on dates-1 should pass cleanly with dateStrings: true
  const datesRes = await executeQuery(pDates1, pDates1.solutionSQL, true);
  assert.strictEqual(datesRes.status, 'ACCEPTED', 'dates-1 solution must be ACCEPTED');
  assert.ok(datesRes.output.length > 0, 'Output must have rows');
  testPass('Date problem dates-1 passed with dateStrings: true');

  // Check specific data types with direct queries
  const conn3 = await pool.getConnection();
  try {
    const [rows] = await conn3.query(`
      SELECT 
        '01234' as zip_code,
        '555-1234' as phone,
        CAST('2026-05-10 14:30:00' AS DATETIME) as event_dt,
        CAST('2026-05-10' AS DATE) as event_date,
        12.35 as exact_float
    `);
    const r = rows[0];
    assert.strictEqual(r.zip_code, '01234', 'Zip code must preserve leading zero');
    assert.strictEqual(r.phone, '555-1234', 'Phone must remain intact');
    assert.strictEqual(r.event_dt, '2026-05-10 14:30:00', 'Datetime must preserve exact string and time');
    assert.strictEqual(r.event_date, '2026-05-10', 'Date must preserve exact string');
  } finally {
    conn3.release();
  }
  testPass('Exact string representations (01234, dates, datetimes) preserved without coercion');

  // -------------------------------------------------------------
  // TEST 7: Concurrent Execution Mutex (Eliminating NTFS file collisions)
  // -------------------------------------------------------------
  testHeader('Concurrent execution mutex (5 interleaved concurrent requests)');
  const pJoins2 = allProblems.find(p => p.id === 'joins-2');
  const pJoins3 = allProblems.find(p => p.id === 'joins-3');

  const concurrentPromises = [
    executeQuery(pNulls1, pNulls1.solutionSQL, false),
    executeQuery(pJoins2, pJoins2.solutionSQL, false),
    executeQuery(pJoins3, pJoins3.solutionSQL, false),
    executeQuery(pNulls1, pNulls1.solutionSQL, true),
    executeQuery(pJoins2, pJoins2.solutionSQL, true)
  ];

  const concurrentResults = await Promise.all(concurrentPromises);
  concurrentResults.forEach((res, i) => {
    assert.strictEqual(res.status, 'ACCEPTED', `Concurrent query ${i + 1} must be ACCEPTED`);
    assert.strictEqual(res.error, undefined, `Concurrent query ${i + 1} must not have errors`);
  });
  testPass('All 5 concurrent requests executed sequentially via mutex without table collisions');

  // -------------------------------------------------------------
  // TEST 8: Server In-Memory Curriculum Caching & Reload
  // -------------------------------------------------------------
  testHeader('Curriculum caching & reload');
  reloadCurriculum();
  testPass('Curriculum reloaded in memory without disk contention');

  // -------------------------------------------------------------
  // TEST 9: Telemetry Logging & Bounded Summary
  // -------------------------------------------------------------
  testHeader('Telemetry logging and summary metrics');
  logSubmission({
    problemId: 'test-harness',
    problemTitle: 'Harness Verification Problem',
    difficulty: 'Hard',
    topicTitle: 'Internal QA',
    status: 'ACCEPTED',
    executionTimeMs: 42,
    query: 'SELECT 1;',
    rowCount: 1,
    diff: null,
    error: null
  });

  const summary = getTelemetrySummary();
  assert.ok(summary.totalSubmissions > 0, 'Total submissions must be > 0');
  assert.ok(summary.accepted > 0, 'Accepted count must be > 0');
  assert.ok(Array.isArray(summary.history), 'History must be an array');
  assert.ok(summary.history.length <= 20, 'History must be bounded to 20');
  testPass(`Telemetry logged and bounded summary read successfully (${summary.totalSubmissions} submissions)`);

  console.log('============================================================');
  console.log(`ALL ${passedTests} / ${totalTests} VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log('============================================================\n');

  await pool.end();
}

runEdgeCaseTests().catch(err => {
  console.error('\nVERIFICATION TEST FAILED:', err);
  process.exit(1);
});
