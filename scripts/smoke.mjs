/**
 * Дымовой тест по-настоящему: HTTP-сервер на 127.0.0.1 с настоящими req/res.
 *
 * Тесты маршрутов подсовывают фальшивые объекты; здесь проверяется то, что они
 * не могут: потоки Node, заголовки, чтение тела из сокета и лимит.
 *
 * @module dsh-pet-cactus/scripts/smoke
 */

import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHost } from '../lib/index.js';

const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-cactus-smoke-'));
const host = createHost({ env: { DSH_HOME: dir } });

const server = createServer((req, res) => {
  void host.handle(req, res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/dsh-pet-cactus`;

const failures = [];

/**
 * @param {string} label
 * @param {boolean} ok
 * @param {unknown} [detail]
 */
function check(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(label);
}

try {
  const health = await fetch(`${base}/health`);
  const healthJson = await health.json();
  check('GET /health → 200', health.status === 200, healthJson);
  check('/health кеш отключён', health.headers.get('cache-control') === 'no-store');

  const config = await fetch(`${base}/api/config`);
  const configJson = await config.json();
  check('GET /api/config → умолчания', configJson.config?.size === 240, configJson.config);

  const put = await fetch(`${base}/api/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: 300 }),
  });
  const putJson = await put.json();
  check('PUT /api/config → 200', put.status === 200, putJson.config?.size);

  const bad = await fetch(`${base}/api/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: 'огромный' }),
  });
  check('PUT с мусором → 400', bad.status === 400);

  const say = await fetch(`${base}/api/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Привет из сокета' }),
  });
  const sayJson = await say.json();
  check('POST /api/say → talk', sayJson.mood === 'talk' && sayJson.text === 'Привет из сокета', sayJson);

  const state = await (await fetch(`${base}/api/state`)).json();
  check('GET /api/state → seq вырос', typeof state.seq === 'number' && state.seq > 0, state);

  const huge = await fetch(`${base}/api/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phrases: ['x'.repeat(70 * 1024)] }),
  });
  check('тело > 64 КБ → 413', huge.status === 413);

  const missing = await fetch(`${base}/nope`);
  check('неизвестный путь → 404', missing.status === 404);
} finally {
  host.dispose();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nпровалено: ${failures.length}`);
  process.exitCode = 1;
} else {
  console.log('\nдымовой тест пройден');
}
