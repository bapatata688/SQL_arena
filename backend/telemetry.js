import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 3 levels up: apps/sql-arena/backend -> ../../..
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const PROGRESS_TXT_PATH = path.join(PROJECT_ROOT, 'sql_progress.txt');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const SUBMISSIONS_JSONL_PATH = path.join(LOGS_DIR, 'sql_submissions.jsonl');

function ensureDirectories() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const progressDir = path.dirname(PROGRESS_TXT_PATH);
    if (!fs.existsSync(progressDir)) {
      fs.mkdirSync(progressDir, { recursive: true });
    }
  } catch (err) {
    console.error('Error ensuring telemetry directories:', err);
  }
}

// Ensure logs directory exists at module load
ensureDirectories();

export function logSubmission(submission) {
  ensureDirectories();

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let statusEmoji;
  if (submission.status === 'ACCEPTED') {
    statusEmoji = 'ACCEPTED';
  } else if (submission.status === 'WRONG_ANSWER') {
    statusEmoji = 'WRONG_ANSWER';
  } else if (submission.status === 'TIME_LIMIT_EXCEEDED') {
    statusEmoji = 'TIME_LIMIT_EXCEEDED';
  } else {
    statusEmoji = `${submission.status || 'ERROR'}`;
  }

  // Format for sql_progress.txt
  let txtBlock = `\n================================================================================\n`;
  txtBlock += `FECHA: ${timestamp}\n`;
  txtBlock += `PROBLEMA: [${submission.problemId}] ${submission.problemTitle || ''} (${submission.difficulty || ''}) - ${submission.topicTitle || ''}\n`;
  txtBlock += `ESTADO: ${statusEmoji}\n`;
  txtBlock += `DURACIÓN: ${submission.executionTimeMs} ms\n`;
  txtBlock += `--------------------------------------------------------------------------------\n`;
  txtBlock += `CONSULTA EJECUTADA:\n${submission.query.trim()}\n`;
  txtBlock += `--------------------------------------------------------------------------------\n`;

  if (submission.status === 'ACCEPTED') {
    txtBlock += `RESULTADO: Coincidencia exacta con la solución esperada (${submission.rowCount} filas devueltas).\n`;
  } else if (submission.status === 'WRONG_ANSWER') {
    txtBlock += `DIFF / ANÁLISIS DE FALLO:\n`;
    if (submission.diff) {
      if (submission.diff.columnOrderMismatch) {
        txtBlock += `• Discrepancia en orden de columnas: [${submission.diff.actualColumns.join(', ')}] (esperado: [${submission.diff.expectedColumns.join(', ')}])\n`;
      }
      if (submission.diff.columnMismatch) {
        txtBlock += `• Columnas obtenidas: [${submission.diff.actualColumns.join(', ')}]\n`;
        txtBlock += `• Columnas esperadas: [${submission.diff.expectedColumns.join(', ')}]\n`;
      }
      if (submission.diff.rowCountMismatch) {
        txtBlock += `• Filas obtenidas: ${submission.diff.actualRowCount} | Filas esperadas: ${submission.diff.expectedRowCount}\n`;
      }
      if (submission.diff.sampleMismatches && submission.diff.sampleMismatches.length > 0) {
        txtBlock += `• Discrepancias de datos:\n`;
        submission.diff.sampleMismatches.forEach((m, idx) => {
          txtBlock += `  [Fila ${idx + 1}] Esperado: ${JSON.stringify(m.expected)} | Obtenido: ${JSON.stringify(m.actual)}\n`;
        });
      }
    }
  } else if (submission.status === 'TIME_LIMIT_EXCEEDED' || submission.status === 'SYNTAX_ERROR' || submission.status === 'ERROR') {
    txtBlock += `ERROR DE EJECUCIÓN:\n${submission.error || 'Unknown error'}\n`;
  }
  txtBlock += `================================================================================\n`;

  try {
    fs.appendFileSync(PROGRESS_TXT_PATH, txtBlock, 'utf-8');
  } catch (err) {
    console.error('Error writing to sql_progress.txt:', err);
  }

  // JSONL logging
  try {
    const jsonRecord = JSON.stringify({
      timestamp,
      problemId: submission.problemId,
      problemTitle: submission.problemTitle,
      status: submission.status,
      executionTimeMs: submission.executionTimeMs,
      query: submission.query,
      error: submission.error || null,
      diff: submission.diff || null
    });
    fs.appendFileSync(SUBMISSIONS_JSONL_PATH, jsonRecord + '\n', 'utf-8');
  } catch (err) {
    console.error('Error writing to sql_submissions.jsonl:', err);
  }
}

export function getTelemetrySummary() {
  if (!fs.existsSync(SUBMISSIONS_JSONL_PATH)) {
    return { totalSubmissions: 0, accepted: 0, wrongAnswer: 0, syntaxError: 0, history: [] };
  }

  try {
    const stats = fs.statSync(SUBMISSIONS_JSONL_PATH);
    if (stats.size === 0) {
      return { totalSubmissions: 0, accepted: 0, wrongAnswer: 0, syntaxError: 0, history: [] };
    }

    const content = fs.readFileSync(SUBMISSIONS_JSONL_PATH, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    let total = 0;
    let accepted = 0;
    let wrongAnswer = 0;
    let syntaxError = 0;
    const history = [];
    const solved = new Set();

    for (let i = 0; i < lines.length; i++) {
      try {
        const record = JSON.parse(lines[i]);
        total++;
        if (record.status === 'ACCEPTED') {
          accepted++;
          if (record.problemId) solved.add(record.problemId);
        } else if (record.status === 'WRONG_ANSWER') {
          wrongAnswer++;
        } else if (record.status === 'SYNTAX_ERROR' || record.status === 'ERROR' || record.status === 'TIME_LIMIT_EXCEEDED') {
          syntaxError++;
        }

        if (history.length >= 20) {
          history.shift();
        }
        history.push(record);
      } catch (_) {
        // Skip corrupted or unparseable lines
      }
    }

    return {
      totalSubmissions: total,
      accepted,
      solvedProblems: [...solved],
      solvedCount: solved.size,
      wrongAnswer,
      syntaxError,
      history: history.reverse()
    };
  } catch (err) {
    console.error('Error reading telemetry summary:', err);
    return { totalSubmissions: 0, accepted: 0, wrongAnswer: 0, syntaxError: 0, history: [] };
  }
}
