import pool from './db.js';
import { executeQuery } from './runner.js';

async function runChallengerM2Suite() {
  console.log('======================================================================');
  console.log('SQL ARENA EMPIRICAL CHALLENGER M2: ADVERSARIAL & EDGE-CASE HARNESS');
  console.log('======================================================================\n');

  const dummyProblemVal2 = {
    id: 'test-val-2',
    schemaDDL: '',
    seedDML: '',
    solutionSQL: 'SELECT 2 AS val;',
    expectedColumns: ['val'],
    orderMatters: false
  };

  const dummyProblemVal1 = {
    id: 'test-val-1',
    schemaDDL: '',
    seedDML: '',
    solutionSQL: 'SELECT 1 AS val;',
    expectedColumns: ['val'],
    orderMatters: false
  };

  const dummyProblemVal0 = {
    id: 'test-val-0',
    schemaDDL: '',
    seedDML: '',
    solutionSQL: 'SELECT 0 AS val;',
    expectedColumns: ['val'],
    orderMatters: false
  };

  const results = [];
  const findings = [];

  function record(category, testName, passed, details) {
    results.push({ category, testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${category}] ${testName}`);
    if (details) console.log(`   └─> ${details}`);
  }

  function recordFinding(category, testName, details) {
    findings.push({ category, testName, details });
    console.log(`⚠️ FINDING [${category}] ${testName}`);
    if (details) console.log(`   └─> ${details}`);
  }

  // Ensure sandbox database is active
  const conn = await pool.getConnection();
  await conn.query('USE sql_arena_sandbox;');
  conn.release();

  async function resetCanary() {
    await pool.query('DROP TABLE IF EXISTS canary_m2;');
    await pool.query('CREATE TABLE canary_m2 (id INT, note VARCHAR(50));');
    await pool.query('INSERT INTO canary_m2 VALUES (1, "alive");');
  }

  async function checkCanaryAlive() {
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_m2'");
    return tables.length > 0;
  }

  async function countTableRows(tableName) {
    const [rows] = await pool.query(`SELECT COUNT(*) as c FROM ${tableName}`);
    return rows[0].c;
  }

  // -------------------------------------------------------------------------
  // SUITE 1: ARITHMETIC NEGATION & DOUBLE MINUS VARIATIONS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: ARITHMETIC NEGATION & COMMENTS ---');

  // Test 1: SELECT 1 - - 1;
  {
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1 - - 1 AS val;');
    record('ARITHMETIC', 'SELECT 1 - - 1 AS val (spaced arithmetic negation)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 2: SELECT 1 - -1;
  {
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1 - -1 AS val;');
    record('ARITHMETIC', 'SELECT 1 - -1 AS val (unary negative without space after -)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 3: SELECT 1--1;
  {
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1--1 AS val;');
    record('ARITHMETIC', 'SELECT 1--1 AS val (no spaces, arithmetic minus minus)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 4: SELECT 1 -/**/- 1 AS val;
  {
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1 -/**/- 1 AS val;');
    record('ARITHMETIC', 'SELECT 1 -/**/- 1 AS val (comment between minus signs)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 5: SELECT 1 - - - 1 AS val;
  {
    const res = await executeQuery(dummyProblemVal0, 'SELECT 1 - - - 1 AS val;');
    record('ARITHMETIC', 'SELECT 1 - - - 1 AS val (triple negation)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // -------------------------------------------------------------------------
  // SUITE 2: INJECTION ATTACKS WITH ARITHMETIC NEGATION & COMMENTS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: ATTACK BYPASS ATTEMPTS WITH COMMENTS & ARITHMETIC ---');

  // Test 6: SELECT 1 - - 1; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1 - - 1 AS val; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1 - - 1; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 7: SELECT 1 - -1; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1 - -1 AS val; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1 - -1; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 8: SELECT 1--1; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal2, 'SELECT 1--1 AS val; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1--1; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 9: SELECT 1/*comment*/; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val/*comment*/; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1/*comment*/; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 10: SELECT 1/**/; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val/**/; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1/**/; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 11: SELECT 1/*comment with ; inside*/; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val/*comment with ; inside*/; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1/*comment with ; inside*/; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 12: SELECT 1 - - - 1; CREATE TABLE canary_m2_evil
  {
    await pool.query('DROP TABLE IF EXISTS canary_m2_evil;');
    const res = await executeQuery(dummyProblemVal0, 'SELECT 1 - - - 1 AS val; CREATE TABLE canary_m2_evil (id INT);');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_m2_evil'");
    const created = tables.length > 0;
    record('SECURITY', 'SELECT 1 - - - 1; CREATE TABLE canary_m2_evil',
      res.status === 'ERROR' && !created,
      `Status: ${res.status}, evil table created: ${created}`);
    await pool.query('DROP TABLE IF EXISTS canary_m2_evil;');
  }

  // Test 13: SELECT 1 --\n; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val --\n; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1 --\\n; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, Canary alive: ${alive}`);
  }

  // Test 14: SELECT 1 --\r\n; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val --\r\n; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1 --\\r\\n; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, Canary alive: ${alive}`);
  }

  // Test 15: SELECT 1 --\t\n; DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val --\t\n; DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', 'SELECT 1 --\\t\\n; DROP TABLE canary_m2;',
      res.status === 'ERROR' && alive,
      `Status: ${res.status}, Canary alive: ${alive}`);
  }

  // -------------------------------------------------------------------------
  // SUITE 3: PARENTHESIZED QUERIES WITH COMMENTS (SPECIFIED IN DISPATCH)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: PARENTHESIZED QUERIES WITH COMMENTS ---');

  // Test 16: (/*comment*/ SELECT 1 AS val) (Prompt Explicit Target)
  {
    const res = await executeQuery(dummyProblemVal1, '(/*comment*/ SELECT 1 AS val)');
    record('PARENTHESES', '(/*comment*/ SELECT 1 AS val) [Prompt Explicit Target]',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 17: /*comment*/ (/*comment*/ SELECT 1 AS val)
  {
    const res = await executeQuery(dummyProblemVal1, '/*comment*/ (/*comment*/ SELECT 1 AS val)');
    record('PARENTHESES', '/*comment*/ (/*comment*/ SELECT 1 AS val)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 18: ((SELECT 1 AS val)) (Adjacent nested parentheses)
  {
    const res = await executeQuery(dummyProblemVal1, '((SELECT 1 AS val))');
    record('PARENTHESES', '((SELECT 1 AS val)) [Adjacent nested parentheses]',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 19: (-- comment\n SELECT 1 AS val)
  {
    const res = await executeQuery(dummyProblemVal1, '(-- comment\n SELECT 1 AS val)');
    record('PARENTHESES', '(-- comment\\n SELECT 1 AS val)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 20: (# comment\n SELECT 1 AS val)
  {
    const res = await executeQuery(dummyProblemVal1, '(# comment\n SELECT 1 AS val)');
    record('PARENTHESES', '(# comment\\n SELECT 1 AS val)',
      res.status === 'ACCEPTED',
      `Status: ${res.status}, val: ${JSON.stringify(res.output)}`);
  }

  // Test 21: Disguised DDL inside parentheses: (/*comment*/ DROP TABLE canary_m2)
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, '(/*comment*/ DROP TABLE canary_m2)');
    const alive = await checkCanaryAlive();
    record('SECURITY', '(/*comment*/ DROP TABLE canary_m2) [Disguised DDL Blocked]',
      res.status === 'ERROR' && alive && res.error.includes('Only SELECT and WITH statements are permitted'),
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 22: Disguised DDL in nested parentheses: ((DROP TABLE canary_m2))
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, '((DROP TABLE canary_m2))');
    const alive = await checkCanaryAlive();
    record('SECURITY', '((DROP TABLE canary_m2)) [Nested Disguised DDL Blocked]',
      res.status === 'ERROR' && alive && res.error.includes('Only SELECT and WITH statements are permitted'),
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 23: Disguised DDL with line comment: (-- comment\n DROP TABLE canary_m2)
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, '(-- comment\n DROP TABLE canary_m2)');
    const alive = await checkCanaryAlive();
    record('SECURITY', '(-- comment\\n DROP TABLE canary_m2) [Line Comment Disguised DDL Blocked]',
      res.status === 'ERROR' && alive && res.error.includes('Only SELECT and WITH statements are permitted'),
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // Test 24: Parenthesized query followed by stacked DDL: (/*comment*/ SELECT 1 AS val); DROP TABLE canary_m2;
  {
    await resetCanary();
    const res = await executeQuery(dummyProblemVal1, '(/*comment*/ SELECT 1 AS val); DROP TABLE canary_m2;');
    const alive = await checkCanaryAlive();
    record('SECURITY', '(/*comment*/ SELECT 1 AS val); DROP TABLE canary_m2; [Stacked DDL Blocked]',
      res.status === 'ERROR' && alive && res.error.includes('Multiple statements are not permitted'),
      `Status: ${res.status}, error: "${res.error}", Canary alive: ${alive}`);
  }

  // -------------------------------------------------------------------------
  // SUITE 4: SANDBOX CORE TABLE INTEGRITY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: CORE PROBLEM TABLES INTEGRITY VERIFICATION ---');

  const initialEmployeeCount = await countTableRows('employee');
  const initialBonusCount = await countTableRows('bonus');
  const initialOrdersCount = await countTableRows('orders');

  console.log(`Initial rows: employee=${initialEmployeeCount}, bonus=${initialBonusCount}, orders=${initialOrdersCount}`);

  // Test 25: Attempt stacked drop of 'employee'
  {
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val; DROP TABLE employee;');
    const currentCount = await countTableRows('employee');
    record('INTEGRITY', 'Targeted drop attack on core table `employee`',
      res.status === 'ERROR' && currentCount === initialEmployeeCount,
      `Status: ${res.status}, employee rows before=${initialEmployeeCount}, after=${currentCount}`);
  }

  // Test 26: Attempt stacked truncate of 'bonus'
  {
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val; TRUNCATE TABLE bonus;');
    const currentCount = await countTableRows('bonus');
    record('INTEGRITY', 'Targeted truncate attack on core table `bonus`',
      res.status === 'ERROR' && currentCount === initialBonusCount,
      `Status: ${res.status}, bonus rows before=${initialBonusCount}, after=${currentCount}`);
  }

  // Test 27: Attempt stacked drop of 'orders' via arithmetic comment trick
  {
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1--1; DROP TABLE orders;');
    const currentCount = await countTableRows('orders');
    record('INTEGRITY', 'Targeted drop attack on core table `orders` via 1--1',
      res.status === 'ERROR' && currentCount === initialOrdersCount,
      `Status: ${res.status}, orders rows before=${initialOrdersCount}, after=${currentCount}`);
  }

  // Test 28: Attempt DDL creation in sandbox
  {
    await pool.query('DROP TABLE IF EXISTS unauthorized_tbl;');
    const res = await executeQuery(dummyProblemVal1, 'SELECT 1 AS val; CREATE TABLE unauthorized_tbl (x INT);');
    const [tables] = await pool.query("SHOW TABLES LIKE 'unauthorized_tbl'");
    const exists = tables.length > 0;
    record('INTEGRITY', 'Attempt unauthorized CREATE TABLE in sandbox',
      res.status === 'ERROR' && !exists,
      `Status: ${res.status}, unauthorized table exists: ${exists}`);
    await pool.query('DROP TABLE IF EXISTS unauthorized_tbl;');
  }

  // Cleanup canary
  await pool.query('DROP TABLE IF EXISTS canary_m2;');

  // -------------------------------------------------------------------------
  // SUITE 5: EMPIRICAL EDGE-CASE FINDINGS (FOR MILESTONE 3 ARCHITECTURE REPORT)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: EMPIRICAL EDGE-CASE FINDINGS ---');
  {
    const res1 = await executeQuery(dummyProblemVal1, '( (SELECT 1 AS val))');
    recordFinding('PARSER_EDGE_CASE', 'Spaced nested parentheses: ( (SELECT 1 AS val))',
      `Status: ${res1.status}, error: "${res1.error}". Cause: replace(/^\\(+/, '') in runner.js only strips adjacent '(' without whitespace.`);

    const res2 = await executeQuery(dummyProblemVal1, '(/*comment*/ (SELECT 1 AS val))');
    recordFinding('PARSER_EDGE_CASE', 'Comment-separated parentheses: (/*comment*/ (SELECT 1 AS val))',
      `Status: ${res2.status}, error: "${res2.error}". Cause: comment stripping leaves '( (' which trips adjacent parenthesis stripper.`);
  }

  // Summary
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  console.log('\n======================================================================');
  console.log(`TOTAL ADVERSARIAL CHALLENGE TESTS: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log(`FINDINGS RECORDED: ${findings.length}`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runChallengerM2Suite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
