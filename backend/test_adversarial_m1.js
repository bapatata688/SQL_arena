import pool from './db.js';
import { executeQuery, splitStatements } from './runner.js';

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('SQL ARENA EMPIRICAL ADVERSARIAL TEST SUITE (MILESTONE 1)');
  console.log('================================================================\n');

  const dummyProblem = {
    id: 'adversarial-test',
    title: 'Adversarial Test Problem',
    schemaDDL: 'CREATE TABLE IF NOT EXISTS adv_test (id INT, name VARCHAR(50), bonus INT);',
    seedDML: 'DELETE FROM adv_test; INSERT INTO adv_test VALUES (1, "Alice", 500);',
    solutionSQL: 'SELECT 1 AS val;',
    expectedColumns: ['val'],
    orderMatters: false
  };

  const results = [];

  function record(category, testName, passed, details) {
    results.push({ category, testName, passed, details });
    const mark = passed ? 'PASS' : 'FAIL';
    console.log(`${mark} [${category}] ${testName}`);
    if (details) console.log(`   └─> ${details}`);
  }

  // Ensure sandbox clean state
  const conn = await pool.getConnection();
  await conn.query('USE sql_arena_sandbox;');
  conn.release();

  // -------------------------------------------------------------------------
  // SUITE 1: SECURITY & INJECTION BYPASS TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: SECURITY & INJECTION BYPASS TESTS ---');

  // Test 1.1: Stacked query bypass via unary minus without space (--1)
  {
    await pool.query('CREATE TABLE IF NOT EXISTS canary_drop_test (id INT);');
    let thrownError = null;
    let execResult = null;
    try {
      execResult = await executeQuery(dummyProblem, 'SELECT 1--1; DROP TABLE canary_drop_test;');
    } catch (err) {
      thrownError = err;
    }
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_drop_test'");
    const tableExists = tables.length > 0;
    if (!tableExists) {
      record('SECURITY', 'Stacked statement injection via double-minus (--1; DROP TABLE)', false,
        `CRITICAL VULNERABILITY: Table canary_drop_test was DROPPED! Parser bypassed. Thrown: ${thrownError?.message || JSON.stringify(execResult)}`);
    } else {
      record('SECURITY', 'Stacked statement injection via double-minus (--1; DROP TABLE)', true,
        'Table survived');
    }
    await pool.query('DROP TABLE IF EXISTS canary_drop_test;');
  }

  // Test 1.2: Stacked statement CREATE TABLE via --0
  {
    await pool.query('DROP TABLE IF EXISTS canary_create_test;');
    let thrownError = null;
    let execResult = null;
    try {
      execResult = await executeQuery(dummyProblem, 'SELECT 1--0; CREATE TABLE canary_create_test (id INT);');
    } catch (err) {
      thrownError = err;
    }
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_create_test'");
    const tableCreated = tables.length > 0;
    if (tableCreated) {
      record('SECURITY', 'Stacked statement DDL creation via double-minus (--0; CREATE TABLE)', false,
        `CRITICAL VULNERABILITY: Table canary_create_test was CREATED in MySQL! Thrown: ${thrownError?.message || JSON.stringify(execResult)}`);
    } else {
      record('SECURITY', 'Stacked statement DDL creation via double-minus (--0; CREATE TABLE)', true,
        'Table was not created');
    }
    await pool.query('DROP TABLE IF EXISTS canary_create_test;');
  }

  // Test 1.3: Standard stacked query (SELECT 1; DROP TABLE ...)
  {
    await pool.query('CREATE TABLE IF NOT EXISTS canary_std_drop (id INT);');
    const res = await executeQuery(dummyProblem, 'SELECT 1; DROP TABLE canary_std_drop;');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_std_drop'");
    const survived = tables.length > 0 && res.status === 'ERROR' && res.error === 'Multiple statements are not permitted';
    record('SECURITY', 'Standard stacked query blocked (SELECT 1; DROP TABLE)', survived,
      `Status: ${res.status}, Error: ${res.error}`);
    await pool.query('DROP TABLE IF EXISTS canary_std_drop;');
  }

  // Test 1.4: Direct standalone DDL (CREATE TABLE)
  {
    await pool.query('DROP TABLE IF EXISTS canary_direct_ddl;');
    const res = await executeQuery(dummyProblem, 'CREATE TABLE canary_direct_ddl (id INT);');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_direct_ddl'");
    const survived = tables.length === 0 && res.status === 'ERROR';
    record('SECURITY', 'Direct standalone DDL blocked (CREATE TABLE)', survived,
      `Status: ${res.status}, Error: ${res.error}`);
  }

  // Test 1.5: Disguised DDL with leading block comment (/* SELECT */ DROP TABLE)
  {
    await pool.query('CREATE TABLE IF NOT EXISTS canary_disguised_block (id INT);');
    const res = await executeQuery(dummyProblem, '/* SELECT */ DROP TABLE canary_disguised_block;');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_disguised_block'");
    const survived = tables.length > 0 && res.status === 'ERROR';
    record('SECURITY', 'Disguised DDL with block comment (/* SELECT */ DROP TABLE)', survived,
      `Status: ${res.status}, Error: ${res.error}`);
    await pool.query('DROP TABLE IF EXISTS canary_disguised_block;');
  }

  // Test 1.6: Disguised DDL with leading line comment (-- SELECT \n DROP TABLE)
  {
    await pool.query('CREATE TABLE IF NOT EXISTS canary_disguised_line (id INT);');
    const res = await executeQuery(dummyProblem, '-- SELECT\n DROP TABLE canary_disguised_line;');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_disguised_line'");
    const survived = tables.length > 0 && res.status === 'ERROR';
    record('SECURITY', 'Disguised DDL with line comment (-- SELECT \\n DROP TABLE)', survived,
      `Status: ${res.status}, Error: ${res.error}`);
    await pool.query('DROP TABLE IF EXISTS canary_disguised_line;');
  }

  // Test 1.7: Disguised DDL with hash comment (# SELECT \n DROP TABLE)
  {
    await pool.query('CREATE TABLE IF NOT EXISTS canary_disguised_hash (id INT);');
    const res = await executeQuery(dummyProblem, '# SELECT\n DROP TABLE canary_disguised_hash;');
    const [tables] = await pool.query("SHOW TABLES LIKE 'canary_disguised_hash'");
    const survived = tables.length > 0 && res.status === 'ERROR';
    record('SECURITY', 'Disguised DDL with hash comment (# SELECT \\n DROP TABLE)', survived,
      `Status: ${res.status}, Error: ${res.error}`);
    await pool.query('DROP TABLE IF EXISTS canary_disguised_hash;');
  }

  // -------------------------------------------------------------------------
  // SUITE 2: TRICKY COMMENTS & COMMENTS WITH SEMICOLONS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: TRICKY COMMENTS & COMMENTS WITH SEMICOLONS ---');

  // Test 2.1: Semicolon inside leading block comment
  {
    try {
      const res = await executeQuery(dummyProblem, '/* comment ; with ; semicolons */ SELECT 1 AS val;');
      record('COMMENTS', 'Semicolon inside leading block comment', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Semicolon inside leading block comment', false, `Crashed: ${err.message}`);
    }
  }

  // Test 2.2: Semicolon inside leading line comment
  {
    try {
      const res = await executeQuery(dummyProblem, '-- comment ; with ; semicolons\n SELECT 1 AS val;');
      record('COMMENTS', 'Semicolon inside leading line comment', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Semicolon inside leading line comment', false, `Crashed: ${err.message}`);
    }
  }

  // Test 2.3: Semicolon inside leading hash comment
  {
    try {
      const res = await executeQuery(dummyProblem, '# comment ; with ; semicolons\n SELECT 1 AS val;');
      record('COMMENTS', 'Semicolon inside leading hash comment', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Semicolon inside leading hash comment', false, `Crashed: ${err.message}`);
    }
  }

  // Test 2.4: Trailing line comment after query semicolon
  {
    try {
      const res = await executeQuery(dummyProblem, 'SELECT 1 AS val; -- trailing comment');
      record('COMMENTS', 'Trailing line comment after query semicolon (SELECT 1 AS val; -- trailing)', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Trailing line comment after query semicolon (SELECT 1 AS val; -- trailing)', false,
        `UNHANDLED EXCEPTION / CRASH: ${err.message}`);
    }
  }

  // Test 2.5: Trailing block comment after query semicolon
  {
    try {
      const res = await executeQuery(dummyProblem, 'SELECT 1 AS val; /* trailing block comment */');
      record('COMMENTS', 'Trailing block comment after query semicolon (SELECT 1 AS val; /* trailing */)', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Trailing block comment after query semicolon (SELECT 1 AS val; /* trailing */)', false,
        `UNHANDLED EXCEPTION / CRASH: ${err.message}`);
    }
  }

  // Test 2.6: Semicolon inside trailing comment
  {
    try {
      const res = await executeQuery(dummyProblem, 'SELECT 1 AS val; -- trailing ; semicolon');
      record('COMMENTS', 'Semicolon inside trailing line comment', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Semicolon inside trailing line comment', false,
        `UNHANDLED EXCEPTION / CRASH: ${err.message}`);
    }
  }

  // Test 2.7: Tricky comments enclosing query (/* comment */ SELECT ...; -- trailing)
  {
    try {
      const res = await executeQuery(dummyProblem, '/* comment */ SELECT 1 AS val; -- trailing');
      record('COMMENTS', 'Comments enclosing query (/* comment */ SELECT ...; -- trailing)', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('COMMENTS', 'Comments enclosing query (/* comment */ SELECT ...; -- trailing)', false,
        `UNHANDLED EXCEPTION / CRASH: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 3: SEMICOLONS IN STRING LITERALS & IDENTIFIERS
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: SEMICOLONS IN STRING LITERALS & IDENTIFIERS ---');

  const stringProblem = {
    id: 'string-test',
    title: 'String Literal Test',
    solutionSQL: "SELECT ';--' AS val;",
    expectedColumns: ['val'],
    orderMatters: false
  };

  // Test 3.1: Semicolon inside single quote string literal
  {
    try {
      const res = await executeQuery(stringProblem, "SELECT ';--' AS val;");
      record('LITERALS', "Semicolon in single quotes (SELECT ';--' AS val;)", res.status === 'ACCEPTED',
        `Status: ${res.status}, output: ${JSON.stringify(res.output)}`);
    } catch (err) {
      record('LITERALS', "Semicolon in single quotes (SELECT ';--' AS val;)", false, `Crashed: ${err.message}`);
    }
  }

  // Test 3.2: Semicolon inside double quote string literal
  {
    try {
      const res = await executeQuery(stringProblem, 'SELECT ";--" AS val;');
      record('LITERALS', 'Semicolon in double quotes (SELECT ";--" AS val;)', res.status === 'ACCEPTED',
        `Status: ${res.status}, output: ${JSON.stringify(res.output)}`);
    } catch (err) {
      record('LITERALS', 'Semicolon in double quotes (SELECT ";--" AS val;)', false, `Crashed: ${err.message}`);
    }
  }

  // Test 3.3: Semicolon with escaped quote in string literal (\')
  {
    const escProblem = {
      id: 'esc-test',
      title: 'Escaped Quote Test',
      solutionSQL: "SELECT 'O\\'Reilly;--' AS val;",
      expectedColumns: ['val'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(escProblem, "SELECT 'O\\'Reilly;--' AS val;");
      record('LITERALS', "Semicolon with escaped quote (SELECT 'O\\'Reilly;--' AS val;)", res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('LITERALS', "Semicolon with escaped quote", false, `Crashed: ${err.message}`);
    }
  }

  // Test 3.4: Semicolon with doubled single quote in string literal ('')
  {
    const dblProblem = {
      id: 'dbl-test',
      title: 'Doubled Quote Test',
      solutionSQL: "SELECT 'O''Reilly;--' AS val;",
      expectedColumns: ['val'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(dblProblem, "SELECT 'O''Reilly;--' AS val;");
      record('LITERALS', "Semicolon with doubled quote (SELECT 'O''Reilly;--' AS val;)", res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('LITERALS', "Semicolon with doubled quote", false, `Crashed: ${err.message}`);
    }
  }

  // Test 3.5: Semicolon inside backticks identifier
  {
    const bktProblem = {
      id: 'bkt-test',
      title: 'Backtick Semicolon Test',
      solutionSQL: 'SELECT 1 AS `col;name`;',
      expectedColumns: ['col;name'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(bktProblem, 'SELECT 1 AS `col;name`;');
      record('LITERALS', 'Semicolon in backticks identifier (SELECT 1 AS `col;name`;)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('LITERALS', 'Semicolon in backticks identifier', false, `Crashed: ${err.message}`);
    }
  }

  // Test 3.6: Semicolon inside CTE string literal
  {
    const cteProblem = {
      id: 'cte-literal-test',
      title: 'CTE Literal Test',
      solutionSQL: "WITH t AS (SELECT ';--' AS val) SELECT val FROM t;",
      expectedColumns: ['val'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(cteProblem, "WITH t AS (SELECT ';--' AS val) SELECT val FROM t;");
      record('LITERALS', "Semicolon in CTE string literal (WITH t AS (SELECT ';--'...))", res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('LITERALS', "Semicolon in CTE string literal", false, `Crashed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 4: VALID SQL DIALECTS & STATEMENT FORMS (FALSE REJECTIONS)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: VALID SQL DIALECTS & STATEMENT FORMS ---');

  // Test 4.1: Parenthesized SELECT
  {
    try {
      const res = await executeQuery(dummyProblem, '(SELECT 1 AS val);');
      record('SQL_SYNTAX', 'Parenthesized SELECT query ((SELECT 1 AS val);)', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('SQL_SYNTAX', 'Parenthesized SELECT query', false, `Crashed: ${err.message}`);
    }
  }

  // Test 4.2: Parenthesized UNION branches
  {
    const unionProblem = {
      id: 'union-test',
      title: 'Union Test',
      solutionSQL: 'SELECT 1 AS val UNION ALL SELECT 2 AS val;',
      expectedColumns: ['val'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(unionProblem, '(SELECT 1 AS val) UNION ALL (SELECT 2 AS val);');
      record('SQL_SYNTAX', 'Parenthesized UNION branches ((SELECT 1) UNION ALL (SELECT 2))', res.status === 'ACCEPTED',
        `Status: ${res.status}, error: ${res.error || 'none'}`);
    } catch (err) {
      record('SQL_SYNTAX', 'Parenthesized UNION branches', false, `Crashed: ${err.message}`);
    }
  }

  // Test 4.3: Chained CTEs
  {
    const chainedCteProblem = {
      id: 'chained-cte-test',
      title: 'Chained CTE Test',
      solutionSQL: 'SELECT 1 AS a, 2 AS b;',
      expectedColumns: ['a', 'b'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(chainedCteProblem, 'WITH t1 AS (SELECT 1 AS a), t2 AS (SELECT 2 AS b) SELECT a, b FROM t1, t2;');
      record('SQL_SYNTAX', 'Chained CTE query (WITH t1 AS (...), t2 AS (...))', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('SQL_SYNTAX', 'Chained CTE query', false, `Crashed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 5: UNICODE, MULTIBYTE, AND ABNORMAL WHITESPACE
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: UNICODE, MULTIBYTE, AND ABNORMAL WHITESPACE ---');

  // Test 5.1: Multibyte Unicode string literals
  {
    const unicodeProblem = {
      id: 'unicode-test',
      title: 'Unicode Test',
      solutionSQL: "SELECT 'こんにちは世界 — ñ, á, é, í, ó, ú, ü, ¿, ¡, 🚀' AS val;",
      expectedColumns: ['val'],
      orderMatters: false
    };
    try {
      const res = await executeQuery(unicodeProblem, "SELECT 'こんにちは世界 — ñ, á, é, í, ó, ú, ü, ¿, ¡, 🚀' AS val;");
      record('UNICODE', 'Multibyte characters in string literals (Japanese, Spanish, Emojis)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('UNICODE', 'Multibyte characters in string literals', false, `Crashed: ${err.message}`);
    }
  }

  // Test 5.2: Multibyte Unicode in column aliases
  {
    const aliasProblem = {
      id: 'alias-test',
      title: 'Alias Unicode Test',
      solutionSQL: 'SELECT 1 AS `año`, 2 AS `población`, 3 AS `🚀`;',
      expectedColumns: ['año', 'población', ''],
      orderMatters: false
    };
    try {
      const res = await executeQuery(aliasProblem, 'SELECT 1 AS `año`, 2 AS `población`, 3 AS `🚀`;');
      record('UNICODE', 'Multibyte characters in column aliases (`año`, `población`, `🚀`)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('UNICODE', 'Multibyte characters in column aliases', false, `Crashed: ${err.message}`);
    }
  }

  // Test 5.3: Mixed case SQL keywords
  {
    try {
      const res = await executeQuery(dummyProblem, 'sElEcT 1 aS vAl;');
      record('SYNTAX', 'Mixed case keywords (sElEcT 1 aS vAl;)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('SYNTAX', 'Mixed case keywords', false, `Crashed: ${err.message}`);
    }
  }

  // Test 5.4: Mixed case WITH keyword
  {
    try {
      const res = await executeQuery(dummyProblem, 'wItH cTe aS (sElEcT 1 aS vAl) sElEcT * fRoM cTe;');
      record('SYNTAX', 'Mixed case WITH clause (wItH cTe aS...)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('SYNTAX', 'Mixed case WITH clause', false, `Crashed: ${err.message}`);
    }
  }

  // Test 5.5: Abnormal whitespace (tabs, newlines, multiple spaces)
  {
    try {
      const res = await executeQuery(dummyProblem, '\t\r\n   SELECT\t\t1\r\nAS\nval;   \r\n');
      record('SYNTAX', 'Abnormal whitespace (tabs, carriage returns, newlines)', res.status === 'ACCEPTED',
        `Status: ${res.status}`);
    } catch (err) {
      record('SYNTAX', 'Abnormal whitespace', false, `Crashed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`TOTAL ADVERSARIAL TESTS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.log('FAILURES BREAKDOWN:');
    for (const f of results.filter(r => !r.passed)) {
      console.log(`[${f.category}] ${f.testName}`);
      console.log(`   └─> ${f.details}`);
    }
  }

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAdversarialSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
