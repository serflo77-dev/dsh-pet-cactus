/**
 * Конфигурация кактуса: значения по умолчанию, валидация и чтение/запись файла.
 *
 * Модуль намеренно не знает про Cordis и HTTP: его можно проверить обычным
 * `node --test`, а хост-половина только передаёт сюда путь и лог.
 *
 * Инварианты:
 * - чтение никогда не бросает наружу: битый файл → значения по умолчанию плюс
 *   предупреждение в лог (иначе плагин валит старт DSH);
 * - запись атомарная (временный файл + rename): параллельное чтение не увидит
 *   половину JSON;
 * - неизвестные ключи не сохраняются, но и не считаются ошибкой — их список
 *   возвращается вызывающему для лога.
 *
 * @module dsh-pet-cactus/config
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Имя пакета и одновременно id строки в cordis.patch.yml */
export const PLUGIN_ID = 'dsh-pet-cactus';

/** Значения по умолчанию: единственный источник правды для схемы */
export const DEFAULTS = Object.freeze({
  name: 'Кактус',
  size: 240,
  corner: 'bottom-right',
  marginX: 28,
  marginY: 28,
  opacity: 1,
  speech: true,
  speechIntervalMin: 12,
  bubbleMs: 6500,
  sleepAfterMin: 20,
  reactToAgent: true,
  reducedMotion: 'auto',
  phrases: [],
});

/** Допустимые углы привязки */
export const CORNERS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

/** Допустимые режимы анимации */
export const MOTION_MODES = Object.freeze(['auto', 'reduce', 'allow']);

/** Числовые границы: ключ → [минимум, максимум] */
const RANGES = Object.freeze({
  size: [120, 420],
  marginX: [0, 200],
  marginY: [0, 200],
  opacity: [0.3, 1],
  speechIntervalMin: [1, 180],
  bubbleMs: [2000, 30000],
  sleepAfterMin: [1, 240],
});

/** Разрешённые ключи файла (порядок важен для диффа и документации) */
export const CONFIG_KEYS = Object.freeze([
  'name',
  'size',
  'corner',
  'marginX',
  'marginY',
  'opacity',
  'speech',
  'speechIntervalMin',
  'bubbleMs',
  'sleepAfterMin',
  'reactToAgent',
  'reducedMotion',
  'phrases',
]);

/** Максимум пользовательских фраз и их длина */
const MAX_PHRASES = 30;
const MAX_PHRASE_LEN = 140;

/**
 * Домашний каталог DSH: переменная окружения важнее платформенного умолчания.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveHome(env = process.env) {
  const fromEnv = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  return fromEnv === '' ? join(homedir(), '.dsh') : fromEnv;
}

/**
 * Каталог данных плагина.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function dataDir(env = process.env) {
  return join(resolveHome(env), PLUGIN_ID);
}

/**
 * Путь к пользовательскому конфигу.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function configPath(env = process.env) {
  return join(dataDir(env), 'main-config.json');
}

/**
 * Привести число к диапазону; нечисло → undefined, чтобы вызывающий взял дефолт.
 * @param {unknown} value
 * @param {[number, number]} range
 * @returns {number | undefined}
 */
function toNumber(value, range) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(range[1], Math.max(range[0], n));
}

/**
 * Нормализовать один ключ.
 * @param {string} key
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {unknown} нормализованное значение или undefined, если ключ отброшен
 */
function normalizeKey(key, value, errors) {
  switch (key) {
    case 'name': {
      if (typeof value !== 'string') {
        errors.push('name: ожидалась строка');
        return undefined;
      }
      const trimmed = value.trim().slice(0, 40);
      return trimmed === '' ? undefined : trimmed;
    }
    case 'size':
    case 'marginX':
    case 'marginY':
    case 'opacity':
    case 'speechIntervalMin':
    case 'bubbleMs':
    case 'sleepAfterMin': {
      const n = toNumber(value, RANGES[key]);
      if (n === undefined) {
        errors.push(`${key}: ожидалось число в диапазоне ${RANGES[key][0]}..${RANGES[key][1]}`);
        return undefined;
      }
      // size и отступы — целые пиксели, остальное допускает дробь
      return key === 'size' || key === 'marginX' || key === 'marginY' ? Math.round(n) : n;
    }
    case 'speech':
    case 'reactToAgent': {
      if (typeof value !== 'boolean') {
        errors.push(`${key}: ожидалось true/false`);
        return undefined;
      }
      return value;
    }
    case 'corner': {
      if (typeof value !== 'string' || !CORNERS.includes(value)) {
        errors.push(`corner: ожидалось одно из ${CORNERS.join(', ')}`);
        return undefined;
      }
      return value;
    }
    case 'reducedMotion': {
      if (typeof value !== 'string' || !MOTION_MODES.includes(value)) {
        errors.push(`reducedMotion: ожидалось одно из ${MOTION_MODES.join(', ')}`);
        return undefined;
      }
      return value;
    }
    case 'phrases': {
      if (!Array.isArray(value)) {
        errors.push('phrases: ожидался массив строк');
        return undefined;
      }
      const list = value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item !== '')
        .slice(0, MAX_PHRASES)
        .map((item) => item.slice(0, MAX_PHRASE_LEN));
      return list;
    }
    default:
      return undefined;
  }
}

/**
 * Слить патч с базой, провалидировав каждый известный ключ.
 *
 * @param {Record<string, unknown>} base - проверенная база (обычно DEFAULTS или текущий конфиг)
 * @param {Record<string, unknown>} patch - то, что пришло из файла или HTTP
 * @returns {{ config: Record<string, any>, errors: string[], unknown: string[] }}
 */
export function mergeConfig(base, patch) {
  const config = { ...base };
  const errors = [];
  const unknown = [];
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { config, errors: ['конфиг: ожидался объект'], unknown };
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!CONFIG_KEYS.includes(key)) {
      unknown.push(key);
      continue;
    }
    const normalized = normalizeKey(key, value, errors);
    if (normalized !== undefined) config[key] = normalized;
  }
  return { config, errors, unknown };
}

/**
 * Полный конфиг из значений по умолчанию и патча.
 * @param {Record<string, unknown>} [patch]
 * @returns {{ config: Record<string, any>, errors: string[], unknown: string[] }}
 */
export function makeConfig(patch = {}) {
  return mergeConfig({ ...DEFAULTS }, patch);
}

/**
 * Прочитать конфиг с диска.
 *
 * @param {object} [options]
 * @param {string} [options.file] - путь (по умолчанию — configPath())
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(level: 'info' | 'warn', message: string) => void} [options.log]
 * @returns {{ config: Record<string, any>, source: 'default' | 'file', path: string, errors: string[], unknown: string[] }}
 */
export function readConfig(options = {}) {
  const env = options.env ?? process.env;
  const file = options.file ?? configPath(env);
  const log = options.log ?? (() => {});
  const base = { config: { ...DEFAULTS }, source: 'default', path: file, errors: [], unknown: [] };
  if (!existsSync(file)) return base;
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('warn', `${PLUGIN_ID}: не читается ${file} (${message}) — работаю на значениях по умолчанию`);
    return base;
  }
  const merged = mergeConfig({ ...DEFAULTS }, raw);
  for (const message of merged.errors) log('warn', `${PLUGIN_ID}: ${message}`);
  if (merged.unknown.length > 0) {
    log('warn', `${PLUGIN_ID}: неизвестные ключи проигнорированы: ${merged.unknown.join(', ')}`);
  }
  return { config: merged.config, source: 'file', path: file, errors: merged.errors, unknown: merged.unknown };
}

/**
 * Записать конфиг атомарно.
 *
 * @param {Record<string, unknown>} patch - частичный или полный конфиг
 * @param {object} [options]
 * @param {string} [options.file]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {Record<string, any>} [options.base] - база для слияния (по умолчанию DEFAULTS)
 * @returns {{ config: Record<string, any>, path: string, errors: string[], unknown: string[] }}
 */
export function writeConfig(patch, options = {}) {
  const env = options.env ?? process.env;
  const file = options.file ?? configPath(env);
  const merged = mergeConfig({ ...(options.base ?? DEFAULTS) }, patch);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(merged.config, null, 2)}\n`, 'utf8');
    renameSync(tmp, file);
  } catch (error) {
    // Временный файл не должен оставаться мусором рядом с конфигом
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* уже удалён или нет прав — исходная ошибка важнее */
    }
    throw error;
  }
  return { config: merged.config, path: file, errors: merged.errors, unknown: merged.unknown };
}
