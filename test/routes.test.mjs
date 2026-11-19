/**
 * HTTP-маршруты и реакция на события сессии: проверяем хост без DSH и без сети.
 *
 * Фальшивые req/res повторяют ровно тот минимум, который читает handle:
 * method, url, асинхронный итератор тела и writeHead/end у ответа.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { createHost, isSubagentSession } from '../lib/index.js';
import { DEFAULTS } from '../lib/config.js';

const dirs = [];

function tempEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-cactus-'));
  dirs.push(dir);
  return { DSH_HOME: dir, dir };
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop(), { recursive: true, force: true });
  }
});

/** @param {string} method @param {string} url @param {string} [body] */
function makeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(body, 'utf8')];
  return {
    method,
    url,
    headers: {},
    destroyed: false,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    destroyed: false,
    writableEnded: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers ?? {};
    },
    end(body) {
      this.body = body === undefined ? '' : String(body);
      this.writableEnded = true;
    },
  };
}

/** Выполнить запрос и вернуть разобранный ответ */
async function call(host, method, url, body) {
  const res = makeRes();
  await host.handle(makeReq(method, url, body), res);
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { status: res.statusCode, headers: res.headers, json, raw: res.body };
}

test('/health отвечает именем и версией', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'GET', '/dsh-pet-cactus/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.name, 'dsh-pet-cactus');
  assert.match(res.json.version, /^\d+\.\d+\.\d+/);
  assert.equal(res.headers['cache-control'], 'no-store');
  host.dispose();
});

test('GET /api/config отдаёт умолчания и путь к файлу', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'GET', '/dsh-pet-cactus/api/config');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.config, { ...DEFAULTS });
  assert.equal(res.json.source, 'default');
  assert.equal(res.json.path, join(env.dir, 'dsh-pet-cactus', 'main-config.json'));
  host.dispose();
});

test('PUT /api/config сохраняет и возвращает новый конфиг', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'PUT', '/dsh-pet-cactus/api/config', JSON.stringify({ size: 320, corner: 'top-left' }));
  assert.equal(res.status, 200);
  assert.equal(res.json.config.size, 320);
  assert.equal(res.json.config.corner, 'top-left');
  const file = join(env.dir, 'dsh-pet-cactus', 'main-config.json');
  assert.ok(existsSync(file));
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).size, 320);
  assert.equal(host.getConfig().size, 320);
  host.dispose();
});

test('PUT с неверным типом отклоняется целиком, файл не появляется', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'PUT', '/dsh-pet-cactus/api/config', JSON.stringify({ size: 'огромный' }));
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'invalid-config');
  assert.equal(res.json.details.length, 1);
  assert.equal(existsSync(join(env.dir, 'dsh-pet-cactus', 'main-config.json')), false);
  assert.equal(host.getConfig().size, DEFAULTS.size);
  host.dispose();
});

test('PUT с мусором в теле — 400, без исключения наружу', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'PUT', '/dsh-pet-cactus/api/config', '{не json');
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'bad-json');
  host.dispose();
});

test('тело больше лимита — 413', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const huge = JSON.stringify({ phrases: ['x'.repeat(70 * 1024)] });
  const res = await call(host, 'PUT', '/dsh-pet-cactus/api/config', huge);
  assert.equal(res.status, 413);
  assert.equal(res.json.error, 'body-too-large');
  host.dispose();
});

test('POST /api/say говорит и меняет состояние', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'POST', '/dsh-pet-cactus/api/say', JSON.stringify({ text: '  Привет, Серёга  ' }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mood, 'talk');
  assert.equal(res.json.text, 'Привет, Серёга');
  const state = await call(host, 'GET', '/dsh-pet-cactus/api/state');
  assert.equal(state.json.seq, res.json.seq);
  host.dispose();
});

test('пустая реплика — 400', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  const res = await call(host, 'POST', '/dsh-pet-cactus/api/say', JSON.stringify({ text: '   ' }));
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'empty-text');
  host.dispose();
});

test('неизвестный маршрут — 404, чужой метод — 405', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  assert.equal((await call(host, 'GET', '/dsh-pet-cactus/nope')).status, 404);
  const wrong = await call(host, 'DELETE', '/dsh-pet-cactus/health');
  assert.equal(wrong.status, 405);
  assert.equal(wrong.json.error, 'method-not-allowed');
  host.dispose();
});

test('события сессии двигают настроение по шагам', async () => {
  const env = tempEnv();
  const host = createHost({ env, random: () => 0 });
  assert.equal(host.getState().mood, 'idle');

  host.onSessionEvent({ header: { id: 's1' } }, { type: 'turn/start' });
  assert.equal(host.getState().mood, 'thinking');

  host.onSessionEvent({ header: { id: 's1' } }, { type: 'tool/call', data: { name: 'read' } });
  const working = host.getState();
  assert.equal(working.mood, 'working');
  assert.equal(working.text, 'Читаю файл');

  host.onSessionEvent({ header: { id: 's1' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
  assert.equal(host.getState().mood, 'success');

  host.onSessionEvent({ header: { id: 's1' } }, { type: 'turn/end', data: { reason: { kind: 'error' } } });
  assert.equal(host.getState().mood, 'error');
  host.dispose();
});

test('ожидание подтверждения не сбрасывается случайным tool/result', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  host.onSessionEvent({ header: { id: 's1' } }, { type: 'approval/asked', data: {} });
  assert.equal(host.getState().mood, 'waiting');
  host.onSessionEvent({ header: { id: 's1' } }, { type: 'tool/result', data: {} });
  assert.equal(host.getState().mood, 'waiting');
  host.dispose();
});

test('суб-агенты не дёргают питомца', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  host.onSessionEvent({ header: { id: 's1' } }, { type: 'turn/start' });
  const before = host.getState().seq;
  host.onSessionEvent({ header: { id: 'sub', origin: 'subagent' } }, { type: 'tool/call', data: { name: 'read' } });
  host.onSessionEvent({ header: { id: 'deep', delegationDepth: 2 } }, { type: 'tool/call', data: { name: 'read' } });
  assert.equal(host.getState().seq, before);
  assert.equal(isSubagentSession({ header: { origin: 'subagent' } }), true);
  assert.equal(isSubagentSession({ header: { delegationDepth: 1 } }), true);
  assert.equal(isSubagentSession({ header: { id: 'x' } }), false);
  assert.equal(isSubagentSession(null), false);
  host.dispose();
});

test('reactToAgent:false полностью выключает реакцию', async () => {
  const env = tempEnv();
  const host = createHost({ env });
  await call(host, 'PUT', '/dsh-pet-cactus/api/config', JSON.stringify({ reactToAgent: false }));
  host.onSessionEvent({ header: { id: 's1' } }, { type: 'tool/call', data: { name: 'read' } });
  assert.equal(host.getState().mood, 'idle');
  host.dispose();
});

test('битое событие не роняет хост и не меняет состояние', async () => {
  const env = tempEnv();
  const warnings = [];
  const host = createHost({ env, log: { info() {}, warn: (m) => warnings.push(m) } });
  host.onSessionEvent(null, null);
  host.onSessionEvent({ header: null }, { type: 'tool/call', data: { get name() { throw new Error('бум'); } } });
  assert.equal(host.getState().mood, 'idle');
  assert.equal(warnings.length, 1);
  host.dispose();
});
