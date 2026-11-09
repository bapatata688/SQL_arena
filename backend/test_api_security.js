import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:5000';
const post = (p, body, headers = {}) =>
  fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// 1. Validación de tipos
let r = await post('/api/run', { problemId: 123, query: 'SELECT 1' });
assert.equal(r.status, 400); console.log('OK tipos inválidos -> 400');

r = await post('/api/run', { problemId: 'nulls-1', query: '   ' });
assert.equal(r.status, 400); console.log('OK query vacía -> 400');

// 2. Límite de tamaño
r = await post('/api/run', { problemId: 'nulls-1', query: 'SELECT 1 -- ' + 'x'.repeat(10001) });
assert.equal(r.status, 413); console.log('OK query enorme -> 413');

// 3. Problema inexistente
r = await post('/api/run', { problemId: 'nope', query: 'SELECT 1' });
assert.equal(r.status, 404); console.log('OK problema inexistente -> 404');

// 4. Query válida + solución no expuesta
r = await post('/api/run', { problemId: 'nulls-1', query: 'SELECT 1' });
assert.equal(r.status, 200);
const p = await (await fetch(BASE + '/api/problems/nulls-1')).json();
assert.equal(p.solutionSQL, undefined); console.log('OK solutionSQL no expuesta');

// 5. CORS: origen externo rechazado
r = await fetch(BASE + '/api/topics', { headers: { Origin: 'http://evil.example.com' } });
assert.notEqual(r.status, 200); console.log('OK CORS externo rechazado ->', r.status);

// 6. Rate limit
let got429 = false;
for (let i = 0; i < 40; i++) {
  const x = await post('/api/run', { problemId: 'nulls-1', query: 'SELECT 1' });
  if (x.status === 429) { got429 = true; break; }
}
assert.ok(got429); console.log('OK rate limit -> 429');

// 7. Sentencias apiladas
await new Promise(res => setTimeout(res, 10500));
r = await post('/api/run', { problemId: 'nulls-1', query: 'SELECT 1; DROP TABLE Employee' });
const j = await r.json();
assert.equal(j.status, 'ERROR'); console.log('OK sentencias apiladas bloqueadas');
console.log('ALL API TESTS PASSED');

