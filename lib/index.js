/**
 * dsh-pet-cactus — host-половина плагина.
 *
 * Что делает:
 * - держит конфиг кактуса в `<DSH_HOME>/dsh-pet-cactus/main-config.json`
 *   и отдаёт его браузерной половине по HTTP;
 * - слушает `session/event` и складывает настроение питомца в одно поле:
 *   работает / думает / ждёт / получилось / ошибка;
 * - отдаёт четыре маршрута под префиксом `/dsh-pet-cactus`.
 *
 * Чего не делает: не рендерит (это браузер), не вызывает модель, не ходит в сеть,
 * не читает файлы пользователя. Всё, что видит кактус, — имена инструментов.
 *
 * @module dsh-pet-cactus/index
 */

import { readFileSync } from 'node:fs';
import { PLUGIN_ID, configPath, mergeConfig, readConfig, writeConfig } from './config.js';
import { describeTool, describeTurnEnd } from './tool-lines.js';

/** id строки в cordis.patch.yml */
export const name = PLUGIN_ID;

/** Нужен только веб-сервер: маршруты регистрируются на нём */
export const inject = ['webServer'];

/** Префикс всех маршрутов */
const PREFIX = '/dsh-pet-cactus';

/** Предел тела запроса: настроек больше этого не бывает */
const BODY_LIMIT = 64 * 1024;

/** Через сколько миллисекунд рабочее настроение возвращается в покой */
const REVERT_MS = 4000;

/** Сколько держится «жду решения», если новых событий нет */
const WAITING_MS = 10 * 60 * 1000;

/** Версия пакета — в ответе /health */
const VERSION = (() => {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * Отправить JSON-ответ без кеша.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Прочитать тело запроса с ограничением.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error('body-too-large');
      error.code = 'body-too-large';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Разобрать JSON-тело; пустое тело — пустой объект.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function parseJson(text) {
  if (text.trim() === '') return {};
  const value = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('тело должно быть JSON-объектом');
  }
  return value;
}

/**
 * Событие относится к суб-агенту (или более глубокой делегации)?
 * Такие сессии не должны дёргать кактуса: пользователь ждёт основной ответ.
 * @param {unknown} session
 * @returns {boolean}
 */
export function isSubagentSession(session) {
  const header = /** @type {{ header?: { origin?: unknown, delegationDepth?: unknown } }} */ (session)?.header;
  if (header === null || typeof header !== 'object') return false;
  if (header.origin === 'subagent') return true;
  const depth = header.delegationDepth;
  return typeof depth === 'number' && Number.isFinite(depth) && depth > 0;
}

/**
 * Собрать host-половину: состояние, конфиг, обработчик маршрутов.
 *
 * Вынесено из apply, чтобы тесты могли подсунуть фальшивый ctx и дёргать
 * обработчик напрямую, без HTTP и без DSH.
 *
 * @param {object} options
 * @param {{ info: Function, warn: Function }} [options.log]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {() => number} [options.random]
 * @returns {{
 *   handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>,
 *   onSessionEvent: (session: unknown, event: unknown) => void,
 *   getConfig: () => Record<string, any>,
 *   getState: () => { mood: string, text: string, seq: number, updatedAt: number },
 *   dispose: () => void,
 * }}
 */
export function createHost(options = {}) {
  const log = options.log ?? { info: () => {}, warn: () => {} };
  const random = options.random ?? Math.random;

  /** Конфиг читается один раз: файл меняется только через PUT, кеш обновляется там же */
  let loaded = readConfig({
    env: options.env,
    log: (level, message) => (level === 'warn' ? log.warn(message) : log.info(message)),
  });
  let config = loaded.config;

  const state = { mood: 'idle', text: '', seq: 0, updatedAt: Date.now() };
  let revertTimer = null;

  /** Снять таймер возврата в покой (при новом событии он не нужен) */
  function clearRevert() {
    if (revertTimer !== null) {
      clearTimeout(revertTimer);
      revertTimer = null;
    }
  }

  /**
   * Опубликовать настроение. Одинаковое состояние не двигает seq:
   * браузер перерисовывает только реальные изменения.
   * @param {'idle' | 'thinking' | 'working' | 'waiting' | 'success' | 'error' | 'talk'} mood
   * @param {string} [text]
   */
  function publish(mood, text = '') {
    if (state.mood === mood && state.text === text) return;
    state.mood = mood;
    state.text = text;
    state.seq += 1;
    state.updatedAt = Date.now();
  }

  /**
   * Запланировать возврат в покой.
   * @param {number} delay
   */
  function scheduleIdle(delay) {
    clearRevert();
    revertTimer = setTimeout(() => {
      revertTimer = null;
      publish('idle', '');
    }, delay);
    // Таймер не должен держать процесс DSH живым при выходе
    if (typeof revertTimer.unref === 'function') revertTimer.unref();
  }

  /**
   * Реакция на событие сессии. Ошибки глушим: питомец не имеет права
   * сломать ход агента.
   * @param {unknown} session
   * @param {unknown} event
   */
  function onSessionEvent(session, event) {
    try {
      if (config.reactToAgent !== true) return;
      if (isSubagentSession(session)) return;
      const type = /** @type {{ type?: unknown, data?: Record<string, any> }} */ (event)?.type;
      if (typeof type !== 'string') return;

      if (type === 'turn/start') {
        publish('thinking', 'Думаю над задачей');
        scheduleIdle(REVERT_MS);
        return;
      }
      if (type === 'tool/call') {
        const tool = /** @type {{ data?: { name?: unknown } }} */ (event).data?.name;
        publish('working', describeTool(tool, random));
        scheduleIdle(REVERT_MS);
        return;
      }
      if (type === 'approval/asked') {
        publish('waiting', 'Жду твоего решения');
        scheduleIdle(WAITING_MS);
        return;
      }
      if (type === 'turn/end') {
        const kind = /** @type {{ data?: { reason?: { kind?: unknown } } }} */ (event).data?.reason?.kind;
        const ended = describeTurnEnd(kind, random);
        publish(ended.mood, ended.text);
        scheduleIdle(ended.mood === 'waiting' ? WAITING_MS : REVERT_MS);
      }
    } catch (error) {
      log.warn(`${PLUGIN_ID}: событие сессии не обработано (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  /**
   * Обработчик одного HTTP-запроса.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const method = req.method ?? 'GET';
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendJson(res, 400, { error: 'bad-url' });
      return;
    }
    const route = url.pathname.slice(PREFIX.length) || '/';

    try {
      if (route === '/health') {
        if (method !== 'GET') return sendJson(res, 405, { error: 'method-not-allowed' });
        return sendJson(res, 200, {
          ok: true,
          name: PLUGIN_ID,
          version: VERSION,
          mood: state.mood,
          configSource: loaded.source,
        });
      }

      if (route === '/api/state') {
        if (method !== 'GET') return sendJson(res, 405, { error: 'method-not-allowed' });
        return sendJson(res, 200, { ...state });
      }

      if (route === '/api/config') {
        if (method === 'GET') {
          return sendJson(res, 200, {
            config,
            source: loaded.source,
            path: loaded.path ?? configPath(options.env),
          });
        }
        if (method === 'PUT' || method === 'POST') {
          let patch;
          try {
            patch = parseJson(await readBody(req));
          } catch (error) {
            const code = /** @type {{ code?: string }} */ (error).code;
            const status = code === 'body-too-large' ? 413 : 400;
            return sendJson(res, status, { error: code ?? 'bad-json' });
          }
          // Сначала валидация, потом запись: отклонённый патч не должен
          // перезаписывать файл умолчаниями.
          const merged = mergeConfig(config, patch);
          if (merged.errors.length > 0) {
            return sendJson(res, 400, { error: 'invalid-config', details: merged.errors });
          }
          const saved = writeConfig(patch, {
            env: options.env,
            file: loaded.path ?? configPath(options.env),
            base: config,
          });
          config = saved.config;
          loaded = { ...loaded, config, source: 'file', path: saved.path };
          log.info(`${PLUGIN_ID}: конфиг обновлён (${Object.keys(patch).join(', ') || 'без изменений'})`);
          return sendJson(res, 200, { config, path: saved.path, rejected: saved.unknown });
        }
        return sendJson(res, 405, { error: 'method-not-allowed' });
      }

      if (route === '/api/say') {
        if (method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' });
        let body;
        try {
          body = parseJson(await readBody(req));
        } catch (error) {
          const code = /** @type {{ code?: string }} */ (error).code;
          return sendJson(res, code === 'body-too-large' ? 413 : 400, { error: code ?? 'bad-json' });
        }
        const text = typeof body.text === 'string' ? body.text.trim().slice(0, 140) : '';
        if (text === '') return sendJson(res, 400, { error: 'empty-text' });
        publish('talk', text);
        scheduleIdle(REVERT_MS * 2);
        return sendJson(res, 200, { ...state });
      }

      return sendJson(res, 404, { error: 'not-found', path: route });
    } catch (error) {
      log.warn(`${PLUGIN_ID}: маршрут ${route} упал (${error instanceof Error ? error.message : String(error)})`);
      return sendJson(res, 500, { error: 'internal-error' });
    }
  }

  /** Аккуратно снять таймер и забыть состояние */
  function dispose() {
    clearRevert();
  }

  return {
    handle,
    onSessionEvent,
    getConfig: () => config,
    getState: () => ({ ...state }),
    dispose,
  };
}

/**
 * Точка входа Cordis: маршруты + подписка на события сессий.
 * Всё, что регистрируется, снимается при выгрузке плагина — через ctx.effect.
 *
 * @param {any} ctx - контекст DSH (webServer, on, effect, logger)
 */
export function apply(ctx) {
  const log = {
    info: (/** @type {string} */ message) => ctx.logger?.info?.(message),
    warn: (/** @type {string} */ message) => ctx.logger?.warn?.(message),
  };

  const host = createHost({ log });

  ctx.effect(() => {
    const registration = ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: host.handle,
    });
    return () => {
      if (typeof registration === 'function') registration();
      else registration?.dispose?.();
    };
  }, `${PLUGIN_ID}: http routes`);

  ctx.effect(() => {
    const dispose = ctx.on('session/event', host.onSessionEvent);
    return () => {
      if (typeof dispose === 'function') dispose();
      else dispose?.dispose?.();
    };
  }, `${PLUGIN_ID}: session events`);

  ctx.effect(() => host.dispose, `${PLUGIN_ID}: state timers`);

  log.info(`${PLUGIN_ID}: маршруты на ${PREFIX}, конфиг ${configPath()}`);
}
