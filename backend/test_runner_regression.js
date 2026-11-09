import { executeQuery } from './runner.js';
import { allProblems as p } from './problems_data.js';
import pool from './db.js';

const cases = [
  ['strings-2', 'SELECT tweet_id FROM Tweets WHERE LENGTH(content)>15', 'WRONG_ANSWER'],
  ['strings-2', 'SELECT tweet_id FROM Tweets WHERE CHAR_LENGTH(content)>15', 'ACCEPTED'],
  ['nulls-1', 'SELECT b.bonus, e.name FROM Employee e LEFT JOIN Bonus b ON e.empId=b.empId WHERE b.bonus<1000 OR b.bonus IS NULL', 'WRONG_ANSWER'],
  ['nulls-1', 'SELECT e.name, b.bonus FROM Employee e LEFT JOIN Bonus b ON e.empId=b.empId WHERE b.bonus<1000 AND 1=0', 'WRONG_ANSWER'],
  ['dates-4', "SELECT DATE_FORMAT(trans_date,'%Y-%m') AS month,country,COUNT(*) trans_count,COUNT(CASE WHEN state='approved' THEN 1 END) approved_count,SUM(amount) trans_total_amount,SUM(IF(state='approved',amount,0)) approved_total_amount FROM Transactions GROUP BY 1,2 ORDER BY 1,2", 'ACCEPTED'],
  ['nulls-1', 'DROP TABLE Employee', 'ERROR'],
  ['nulls-1', 'SELECT 1; DROP TABLE Employee', 'ERROR'],
];
let bad = 0;
for (const [id, q, want] of cases) {
  const r = await executeQuery(p.find(x => x.id === id), q);
  const ok = r.status === want;
  if (!ok) bad++;
  console.log(ok ? 'OK ' : 'BAD', id, '->', r.status, '(want', want + ')');
}
await pool.end();
process.exit(bad ? 1 : 0);

