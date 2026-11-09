import pool from './db.js';

class ExecutionMutex {
  constructor() {
    this.queue = Promise.resolve();
  }

  runExclusive(task) {
    const res = this.queue.then(() => task(), () => task());
    this.queue = res.then(() => {}, () => {});
    return res;
  }
}

const sandboxMutex = new ExecutionMutex();

export function splitStatements(sql) {
  if (typeof sql !== 'string') return [];
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n' || char === '\r') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === '\\') {
        if (i + 1 < sql.length) {
          current += sql[++i];
        }
      } else if (char === "'") {
        if (nextChar === "'") {
          current += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '\\') {
        if (i + 1 < sql.length) {
          current += sql[++i];
        }
      } else if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (inBacktick) {
      current += char;
      if (char === '`') {
        if (nextChar === '`') {
          current += nextChar;
          i++;
        } else {
          inBacktick = false;
        }
      }
      continue;
    }

    // Comment detection: in MySQL/ANSI SQL, -- must be followed by whitespace, control char, or EOF
    if (char === '-' && nextChar === '-') {
      const afterDash = sql[i + 2];
      if (afterDash === undefined || /\s/.test(afterDash)) {
        inLineComment = true;
        current += char + nextChar;
        i++;
        continue;
      }
    }
    if (char === '#') {
      inLineComment = true;
      current += char;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += char + nextChar;
      i++;
      continue;
    }

    // Quote detection
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }
    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    if (char === ';') {
      statements.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    statements.push(current);
  }

  return statements.filter(stmt => {
    const stripped = stmt
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--(?:\s|$).*$/gm, '')
      .replace(/#.*$/gm, '')
      .trim();
    return stripped.length > 0;
  });
}

function isTimeoutError(err) {
  if (!err) return false;
  if (err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') return true;
  if (err.code === 'ER_QUERY_TIMEOUT') return true;
  if (err.errno === 3024 || err.errno === 1317) return true;
  if (err.message && /timeout|max_statement_time|max_execution_time/i.test(err.message)) return true;
  return false;
}

function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    const pad = n => String(n).padStart(2, '0');
    const y = val.getFullYear();
    const m = pad(val.getMonth() + 1);
    const day = pad(val.getDate());
    const h = pad(val.getHours());
    const min = pad(val.getMinutes());
    const s = pad(val.getSeconds());
    if (h === '00' && min === '00' && s === '00') {
      return `${y}-${m}-${day}`;
    }
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : Number(val.toFixed(4));
  }
  if (typeof val === 'string') {
    // Only format decimal strings with fractional points (e.g. "12.345600" or "-0.50"),
    // but preserve exact strings like zip codes ('01234'), text, or date/timestamp strings ('2026-05-10')
    // Numéricos como string (DECIMAL / BIGINT con supportBigNumbers): comparar como número.
    // Se preservan strings con ceros a la izquierda ('01234').
    if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (!isNaN(num)) {
        return Number.isInteger(num) ? num : Number(num.toFixed(4));
      }
    }
    return val;
  }
  return String(val);
}

function normalizeRow(row) {
  const norm = {};
  for (const key of Object.keys(row)) {
    norm[key.toLowerCase()] = normalizeValue(row[key]);
  }
  return norm;
}

function rowHash(row) {
  const sortedKeys = Object.keys(row).sort();
  return sortedKeys.map(k => `${k}:${JSON.stringify(row[k])}`).join('|');
}

export async function executeQuery(problem, studentSQL, isSubmit = false) {
  // Input validation
  if (!studentSQL || typeof studentSQL !== 'string' || studentSQL.trim() === '') {
    return {
      status: 'SYNTAX_ERROR',
      error: 'Query is empty',
      executionTimeMs: 0,
      output: null,
      expected: null
    };
  }

  // Enforce single-statement execution
  const statements = splitStatements(studentSQL);
  if (statements.length > 1) {
    return {
      status: 'ERROR',
      error: 'Multiple statements are not permitted',
      executionTimeMs: 0,
      output: null,
      expected: null
    };
  }
  if (statements.length === 0) {
    return {
      status: 'SYNTAX_ERROR',
      error: 'Query is empty',
      executionTimeMs: 0,
      output: null,
      expected: null
    };
  }

  // Restrict to SELECT or WITH statements
  const cleanStmt = statements[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--(?:\s|$).*$/gm, '')
    .replace(/#.*$/gm, '')
    .trim();

  // Strip optional leading parentheses before extracting firstWord (e.g. (SELECT 1 AS val) or ((SELECT 1)))
  const unparenthesized = cleanStmt.replace(/^\(+/, '').trim();
  const firstWord = unparenthesized.split(/\s+/)[0]?.toUpperCase();
  const allowedStatements = ['SELECT', 'WITH'];
  if (!allowedStatements.includes(firstWord)) {
    return {
      status: 'ERROR',
      error: `Only SELECT and WITH statements are permitted. Found: ${firstWord || 'UNKNOWN'}`,
      executionTimeMs: 0,
      output: null,
      expected: null
    };
  }

  // Serialize execution through mutex to eliminate Windows NTFS file collisions
  return sandboxMutex.runExclusive(async () => {
    let conn;
    let studentResult;
    let studentFields;
    let studentExecutionTimeMs = 0;

    try {
      conn = await pool.getConnection();

      // 1. Reset Sandbox Tables
      await conn.query('USE sql_arena_sandbox;');
      if (problem.schemaDDL) {
        await conn.query(problem.schemaDDL);
      }
      if (problem.seedDML) {
        await conn.query(problem.seedDML);
      }

      // 2. Execute Reference Solution
      let expectedResult;
      let expectedFields;
      try {
        [expectedResult, expectedFields] = await conn.query({
          sql: problem.solutionSQL,
          timeout: 5000
        });
      } catch (refErr) {
        return {
          status: 'ERROR',
          error: `Reference solution execution error: ${refErr.message}`,
          executionTimeMs: 0,
          output: null,
          expected: null
        };
      }

      // 3. Set query timeout for student execution
      try {
        await conn.query('SET SESSION max_execution_time = 5000;');
      } catch (_) {}

      // 4. Execute Student SQL
      // Execute the sanitized single statement (statements[0]) rather than raw studentSQL
      // This guarantees that any unparsed stacked statements cannot reach MySQL execution
      const queryToExecute = statements[0].trim().replace(/;+$/, '');
      const studentQueryStart = Date.now();
      try {
        [studentResult, studentFields] = await conn.query({
          sql: queryToExecute,
          timeout: 5000
        });
        studentExecutionTimeMs = Date.now() - studentQueryStart;
      } catch (sqlErr) {
        studentExecutionTimeMs = Date.now() - studentQueryStart;
        if (isTimeoutError(sqlErr)) {
          try {
            conn.destroy();
            conn = null;
          } catch (_) {}
          return {
            status: 'TIME_LIMIT_EXCEEDED',
            error: 'Query execution time limit exceeded (5000ms)',
            executionTimeMs: studentExecutionTimeMs,
            output: null,
            expected: null
          };
        }
        return {
          status: 'SYNTAX_ERROR',
          error: sqlErr.message,
          executionTimeMs: studentExecutionTimeMs,
          output: null,
          expected: null
        };
      }

      // Guard against nested multi-statement fields and rows arrays
      const rawStudentFields = Array.isArray(studentFields) && Array.isArray(studentFields[0])
        ? studentFields[0]
        : studentFields;
      const rawStudentResult = Array.isArray(studentResult) && Array.isArray(studentResult[0])
        ? studentResult[0]
        : studentResult;

      // Student rows & columns (extract metadata from fields array to preserve 0-row schema)
      const studentRows = Array.isArray(rawStudentResult) ? rawStudentResult : [];
      const studentColumns = Array.isArray(rawStudentFields) && rawStudentFields.length > 0
        ? rawStudentFields.map(f => f?.name).filter(Boolean)
        : (studentRows.length > 0 ? Object.keys(studentRows[0]) : []);

      const rawExpectedFields = Array.isArray(expectedFields) && Array.isArray(expectedFields[0])
        ? expectedFields[0]
        : expectedFields;
      const rawExpectedResult = Array.isArray(expectedResult) && Array.isArray(expectedResult[0])
        ? expectedResult[0]
        : expectedResult;

      const expectedRows = Array.isArray(rawExpectedResult) ? rawExpectedResult : [];
      const expectedColumns = Array.isArray(rawExpectedFields) && rawExpectedFields.length > 0
        ? rawExpectedFields.map(f => f?.name).filter(Boolean)
        : (expectedRows.length > 0 ? Object.keys(expectedRows[0]) : (problem.expectedColumns || []));

      // 5. Diff Evaluation
      const diff = {
        columnMismatch: false,
        columnOrderMismatch: false,
        rowCountMismatch: false,
        actualColumns: studentColumns,
        expectedColumns: expectedColumns,
        actualRowCount: studentRows.length,
        expectedRowCount: expectedRows.length,
        sampleMismatches: []
      };

      // Check columns with positional matching
      const normStudentCols = studentColumns.map(c => c.toLowerCase());
      const normExpectedCols = expectedColumns.map(c => c.toLowerCase());

      if (normExpectedCols.length > 0) {
        if (normStudentCols.length !== normExpectedCols.length) {
          diff.columnMismatch = true;
        } else {
          let exactOrder = true;
          for (let i = 0; i < normExpectedCols.length; i++) {
            if (normStudentCols[i] !== normExpectedCols[i]) {
              exactOrder = false;
              break;
            }
          }

          if (!exactOrder) {
            const isSameSet = normExpectedCols.every(c => normStudentCols.includes(c)) &&
                              normStudentCols.every(c => normExpectedCols.includes(c));
            if (isSameSet) {
              diff.columnOrderMismatch = true;
            } else {
              diff.columnMismatch = true;
            }
          }
        }
      }

      // Check row counts
      if (studentRows.length !== expectedRows.length) {
        diff.rowCountMismatch = true;
      }

      // Normalize rows
      let normStudentRows = studentRows.map(normalizeRow);
      let normExpectedRows = expectedRows.map(normalizeRow);

      if (!problem.orderMatters) {
        normStudentRows.sort((a, b) => rowHash(a).localeCompare(rowHash(b)));
        normExpectedRows.sort((a, b) => rowHash(a).localeCompare(rowHash(b)));
      }

      // Compare content
      const maxRowsToCheck = Math.max(normStudentRows.length, normExpectedRows.length);
      for (let i = 0; i < maxRowsToCheck; i++) {
        const sRow = normStudentRows[i];
        const eRow = normExpectedRows[i];

        if (!sRow || !eRow || rowHash(sRow) !== rowHash(eRow)) {
          if (diff.sampleMismatches.length < 5) {
            diff.sampleMismatches.push({
              index: i,
              expected: eRow || null,
              actual: sRow || null
            });
          }
        }
      }

      const isMatch = !diff.columnMismatch &&
                      !diff.columnOrderMismatch &&
                      !diff.rowCountMismatch &&
                      diff.sampleMismatches.length === 0;

      return {
        status: isMatch ? 'ACCEPTED' : 'WRONG_ANSWER',
        executionTimeMs: studentExecutionTimeMs,
        output: studentRows,
        expected: expectedRows,
        diff: isMatch ? null : diff
      };
    } finally {
      if (conn) {
        try {
          conn.release();
        } catch (_) {}
      }
    }
  });
}
