import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeQuery } from './runner.js';
import { logSubmission, getTelemetrySummary } from './telemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_QUERY_CHARS = 10000;
const RATE_WINDOW_MS = 10000;
const RATE_MAX_REQUESTS = 30;

// CORS: solo orígenes locales (frontend Vite)
const allowedOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(re => re.test(origin))) return cb(null, true);
    return cb(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '64kb' }));

// Rate limiting en memoria por IP para endpoints que ejecutan SQL
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recent = (hits.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests, slow down' });
  }
  recent.push(now);
  hits.set(key, recent);
  next();
}

function validateRunBody(req, res, next) {
  const { problemId, query } = req.body || {};
  if (typeof problemId !== 'string' || typeof query !== 'string' || !problemId || !query.trim()) {
    return res.status(400).json({ error: 'problemId and query must be non-empty strings' });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return res.status(413).json({ error: `Query too long (max ${MAX_QUERY_CHARS} chars)` });
  }
  next();
}

// In-memory curriculum cache
const topicsPath = path.join(__dirname, 'curriculum', 'topics.json');
const problemsPath = path.join(__dirname, 'curriculum', 'problems.json');

let topics = [];
let problems = [];

export function reloadCurriculum() {
  try {
    if (fs.existsSync(topicsPath)) {
      topics = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
    }
    if (fs.existsSync(problemsPath)) {
      problems = JSON.parse(fs.readFileSync(problemsPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reloading curriculum from disk:', err);
  }
}

// Initial cache load at startup
reloadCurriculum();

// Endpoints
app.get('/api/topics', (req, res) => {
  res.json(topics);
});

app.get('/api/problems', (req, res) => {
  const summary = problems.map(p => ({
    id: p.id,
    topicId: p.topicId,
    title: p.title,
    difficulty: p.difficulty
  }));
  res.json(summary);
});

app.get('/api/problems/:id', (req, res) => {
  const problem = problems.find(p => p.id === req.params.id);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }
  // Exclude raw solutionSQL from payload so user solves it honestly
  const { solutionSQL, ...clientSafeProblem } = problem;
  res.json(clientSafeProblem);
});

app.post('/api/curriculum/reload', (req, res) => {
  reloadCurriculum();
  res.json({
    success: true,
    topicsCount: topics.length,
    problemsCount: problems.length
  });
});

app.post('/api/run', rateLimit, validateRunBody, async (req, res) => {
  const { problemId, query } = req.body;
  const problem = problems.find(p => p.id === problemId);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }

  try {
    const result = await executeQuery(problem, query, false);
    res.json(result);
  } catch (err) {
    console.error('Run error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/submit', rateLimit, validateRunBody, async (req, res) => {
  const { problemId, query } = req.body;
  const problem = problems.find(p => p.id === problemId);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }
  const topic = topics.find(t => t.id === problem.topicId);

  try {
    const result = await executeQuery(problem, query, true);

    // Telemetry logging
    logSubmission({
      problemId: problem.id,
      problemTitle: problem.title,
      difficulty: problem.difficulty,
      topicTitle: topic ? topic.title : '',
      status: result.status,
      executionTimeMs: result.executionTimeMs,
      query: query,
      rowCount: result.output ? result.output.length : 0,
      diff: result.diff,
      error: result.error
    });

    res.json(result);
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telemetry', async (req, res) => {
  try {
    const summary = await getTelemetrySummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manejo de errores centralizado (CORS rechazado -> 403, JSON inválido -> 400)
app.use((err, req, res, next) => {
  if (err && /CORS/i.test(err.message)) return res.status(403).json({ error: err.message });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, HOST, () => {
    console.log(`[SQL Arena API] Listening on http://${HOST}:${PORT}`);
  });
}

export default app;
