import assert from 'node:assert/strict';
import pool from './db.js';
import { executeQuery } from './runner.js';
import { allProblems } from './problems_data.js';

async function runCurriculumEdgeCaseSuite() {
  console.log('======================================================================');
  console.log('SQL ARENA AUTOMATED CURRICULUM EDGE-CASE VERIFICATION SUITE');
  console.log('======================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function recordTest(testName, passed, detail) {
    totalCount++;
    if (passed) {
      passedCount++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
    if (detail) {
      console.log(`   └─> ${detail}`);
    }
  }

  const edgeCaseCases = [
    {
      problemId: 'nulls-1',
      name: 'nulls-1 Boundary Condition: <= 1000 vs < 1000 (Evelyn bonus = 1000)',
      buggyQuery: `SELECT e.name, b.bonus FROM Employee e LEFT JOIN Bonus b ON e.empId = b.empId WHERE b.bonus <= 1000 OR b.bonus IS NULL;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'Submissions with <= 1000 erroneously include Evelyn ($1000 bonus) who must be excluded.'
    },
    {
      problemId: 'dates-4',
      name: 'dates-4 Approved Amount NULL: Missing ELSE 0 / IFNULL on 0-approved country (CA)',
      buggyQuery: `SELECT DATE_FORMAT(trans_date, '%Y-%m') AS month, country, COUNT(*) AS trans_count, SUM(state = 'approved') AS approved_count, SUM(amount) AS trans_total_amount, SUM(IF(state = 'approved', amount, NULL)) AS approved_total_amount FROM Transactions GROUP BY DATE_FORMAT(trans_date, '%Y-%m'), country ORDER BY month, country;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'SUM(IF(state = approved, amount, NULL)) yields NULL instead of 0 for CA which has 0 approved transactions.'
    },
    {
      problemId: 'dates-1',
      name: 'dates-1 Non-consecutive Dates: Naive LAG() without DATEDIFF = 1',
      buggyQuery: `WITH t AS (SELECT id, temperature, LAG(temperature) OVER (ORDER BY recordDate) AS prev_temp FROM Weather) SELECT id FROM t WHERE temperature > prev_temp;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'LAG() blindly compares 2015-01-10 with 2015-01-04 (6 days gap) without checking DATEDIFF = 1.'
    },
    {
      problemId: 'dates-2',
      name: 'dates-2 30-Day Window Boundary: INTERVAL 30 DAY (spans 31 days) vs INTERVAL 29 DAY',
      buggyQuery: `SELECT activity_date AS day, COUNT(DISTINCT user_id) AS active_users FROM UserActivity WHERE activity_date BETWEEN DATE_SUB('2019-07-27', INTERVAL 30 DAY) AND '2019-07-27' GROUP BY activity_date;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'INTERVAL 30 DAY erroneously includes 2019-06-27 (day 31 back) outside the 30-day inclusive window.'
    },
    {
      problemId: 'window-1',
      name: 'window-1 Non-contiguous IDs: Arithmetic Joins (id = id + 1) vs Window Functions',
      buggyQuery: `SELECT DISTINCT l1.num AS ConsecutiveNums FROM Logs l1 JOIN Logs l2 ON l1.id = l2.id - 1 JOIN Logs l3 ON l1.id = l3.id - 2 WHERE l1.num = l2.num AND l2.num = l3.num;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'Consecutive rows at non-contiguous IDs (8, 9, 15) fail arithmetic join but succeed with LAG/LEAD.'
    },
    {
      problemId: 'dedup-1',
      name: 'dedup-1 Deduplication Tie-Breaker: Sorting by name vs id ASC',
      buggyQuery: `WITH RankedPersons AS (SELECT id, email, name, ROW_NUMBER() OVER (PARTITION BY email ORDER BY name ASC) AS rn FROM Person) SELECT id, email, name FROM RankedPersons WHERE rn = 1 ORDER BY id;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'John Aaron (id 3) alphabetically precedes John Doe (id 1), causing ORDER BY name to select wrong id.'
    },
    {
      problemId: 'strings-2',
      name: 'strings-2 Multibyte Character Encoding: LENGTH() bytes vs CHAR_LENGTH() chars',
      buggyQuery: `SELECT tweet_id FROM Tweets WHERE LENGTH(content) > 15;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'LENGTH() counts UTF-8 physical bytes (ñ, emojis) instead of logical characters, misclassifying short tweets.'
    },
    {
      problemId: 'joins-2',
      name: 'joins-2 Outer Join Integrity: INNER JOIN dropping zero-spending customers',
      buggyQuery: `SELECT c.name AS customer_name, SUM(o.quantity * p.price) AS total_spent FROM Customers c JOIN Orders o ON c.id = o.customer_id JOIN Products p ON o.product_id = p.id GROUP BY c.id, c.name ORDER BY total_spent DESC;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'INNER JOIN drops customers with zero orders (Charlie), failing the requirement to report total_spent = 0.'
    },
    {
      problemId: 'pivot-1',
      name: 'pivot-1 Pivot NULL vs 0: SUM(CASE ...) without ELSE 0',
      buggyQuery: `SELECT product, SUM(CASE WHEN quarter = 'Q1' THEN amount END) AS q1, SUM(CASE WHEN quarter = 'Q2' THEN amount END) AS q2, SUM(CASE WHEN quarter = 'Q3' THEN amount END) AS q3, SUM(CASE WHEN quarter = 'Q4' THEN amount END) AS q4 FROM Sales GROUP BY product ORDER BY product;`,
      buggyExpectedStatus: 'WRONG_ANSWER',
      bugDescription: 'Omitting ELSE 0 produces NULLs instead of 0 for products with no sales in a given quarter.'
    }
  ];

  for (const item of edgeCaseCases) {
    const problem = allProblems.find(p => p.id === item.problemId);
    assert.ok(problem, `Problem ${item.problemId} must exist in allProblems`);

    // 1. Evaluate Buggy/Naive query -> MUST BE WRONG_ANSWER
    const resBuggy = await executeQuery(problem, item.buggyQuery, true);
    const buggyPassed = resBuggy.status === item.buggyExpectedStatus;
    recordTest(
      `[Bug Catch] ${item.name}`,
      buggyPassed,
      `Status: ${resBuggy.status} (expected ${item.buggyExpectedStatus}) | ${item.bugDescription}`
    );

    // 2. Evaluate Reference Solution query -> MUST BE ACCEPTED
    const resRef = await executeQuery(problem, problem.solutionSQL, true);
    const refPassed = resRef.status === 'ACCEPTED';
    recordTest(
      `[Reference Pass] ${item.problemId} reference solutionSQL`,
      refPassed,
      `Status: ${resRef.status} (expected ACCEPTED) | Execution time: ${resRef.executionTimeMs}ms`
    );
  }

  console.log('\n======================================================================');
  console.log(`EDGE CASE SUITE RESULTS: ${passedCount} / ${totalCount} TESTS PASSED`);
  console.log('======================================================================\n');

  await pool.end();
  process.exit(passedCount === totalCount ? 0 : 1);
}

runCurriculumEdgeCaseSuite().catch(err => {
  console.error('Fatal edge-case suite error:', err);
  process.exit(1);
});
