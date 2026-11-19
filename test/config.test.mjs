/**
 * Конфиг: значения по умолчанию, валидация, чтение и запись.
 *
 * Проверяем не «счастливый путь», а границы: битый JSON, чужие ключи,
 * выход за диапазон, отсутствие каталога и атомарность записи.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import {
  DEFAULTS,
  configPath,
  dataDir,
  makeConfig,
  mergeConfig,
  readConfig,
  writeConfig,
} from '../lib/config.js';

const dirs = [];

/** Временный каталог, который уберётся после теста */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-cactus-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop(), { recursive: true, force: true });
  }
});

test('умолчания целые: имя, размер, угол', () => {
  assert.equal(DEFAULTS.name, 'Кактус');
  assert.equal(DEFAULTS.size, 240);
  assert.equal(DEFAULTS.corner, 'bottom-right');
  assert.equal(DEFAULTS.reactToAgent, true);
  assert.ok(Object.isFrozen(DEFAULTS), 'DEFAULTS должны быть заморожены');
});

test('dataDir и configPath собираются от DSH_HOME', () => {
  const env = { DSH_HOME: 'C:\\dsh-home' };
  assert.equal(dataDir(env), join('C:\\dsh-home', 'dsh-pet-cactus'));
  assert.equal(configPath(env), join('C:\\dsh-home', 'dsh-pet-cactus', 'main-config.json'));
});

test('пустой патч даёт ровно умолчания', () => {
  assert.deepEqual(makeConfig({}).config, { ...DEFAULTS });
});

test('валидный патч меняет только свои ключи', () => {
  const { config, errors } = mergeConfig({ ...DEFAULTS }, { size: 300, corner: 'top-left', speech: false });
  assert.deepEqual(errors, []);
  assert.equal(config.size, 300);
  assert.equal(config.corner, 'top-left');
  assert.equal(config.speech, false);
  assert.equal(config.marginX, DEFAULTS.marginX);
});

test('числа обрезаются по диапазону, а не падают', () => {
  const { config } = mergeConfig({ ...DEFAULTS }, { size: 9999, opacity: 0.1, bubbleMs: 1 });
  assert.equal(config.size, 420);
  assert.equal(config.opacity, 0.3);
  assert.equal(config.bubbleMs, 2000);
});

test('мусор в типах — это ошибки, а не тихое значение по умолчанию', () => {
  const { errors, config } = mergeConfig({ ...DEFAULTS }, { size: 'большой', speech: 'да', corner: 'середина' });
  assert.equal(errors.length, 3);
  assert.equal(config.size, DEFAULTS.size);
  assert.equal(config.speech, DEFAULTS.speech);
  assert.equal(config.corner, DEFAULTS.corner);
});

test('неизвестные ключи перечисляются и не попадают в конфиг', () => {
  const { config, unknown } = mergeConfig({ ...DEFAULTS }, { hax: 1, size: 200 });
  assert.deepEqual(unknown, ['hax']);
  assert.equal(config.hax, undefined);
});

test('фразы чистятся: непустые строки, лимит 30, длина 140', () => {
  const phrases = Array.from({ length: 40 }, (_, index) => `фраза ${index}`);
  phrases.push('   ', 42);
  const { config } = mergeConfig({ ...DEFAULTS }, { phrases });
  assert.equal(config.phrases.length, 30);
  assert.ok(config.phrases.every((line) => typeof line === 'string' && line.trim() !== ''));
  const long = mergeConfig({ ...DEFAULTS }, { phrases: ['я'.repeat(500)] }).config.phrases[0];
  assert.equal(long.length, 140);
});

test('нет файла — работаем на умолчаниях и не создаём его', () => {
  const dir = tempDir();
  const file = join(dir, 'main-config.json');
  const result = readConfig({ file });
  assert.equal(result.source, 'default');
  assert.deepEqual(result.config, { ...DEFAULTS });
  assert.throws(() => readFileSync(file), /ENOENT/);
});

test('битый JSON — предупреждение и умолчания, файл не перезаписывается', () => {
  const dir = tempDir();
  const file = join(dir, 'main-config.json');
  writeFileSync(file, '{ это не json', 'utf8');
  const warnings = [];
  const result = readConfig({ file, log: (level, message) => warnings.push(`${level}:${message}`) });
  assert.equal(result.source, 'default');
  assert.equal(result.config.size, DEFAULTS.size);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^warn:/);
  assert.equal(readFileSync(file, 'utf8'), '{ это не json');
});

test('запись создаёт каталог и читается обратно', () => {
  const dir = tempDir();
  const file = join(dir, 'nested', 'main-config.json');
  const saved = writeConfig({ size: 320, phrases: ['своя фраза'] }, { file });
  assert.equal(saved.config.size, 320);
  assert.deepEqual(saved.config.phrases, ['своя фраза']);
  const read = readConfig({ file });
  assert.equal(read.source, 'file');
  assert.equal(read.config.size, 320);
});

test('запись атомарная: временных файлов рядом не остаётся', () => {
  const dir = tempDir();
  const file = join(dir, 'main-config.json');
  writeConfig({ size: 260 }, { file });
  writeConfig({ size: 280 }, { file });
  const names = readdirSync(dir);
  assert.deepEqual(names, ['main-config.json']);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(raw.size, 280);
});

test('запись с невалидным полем возвращает ошибки, но файл остаётся прежним', () => {
  const dir = tempDir();
  const file = join(dir, 'main-config.json');
  writeConfig({ size: 260 }, { file });
  const saved = writeConfig({ size: 'много' }, { file, base: { ...DEFAULTS, size: 260 } });
  assert.equal(saved.errors.length, 1);
  assert.equal(readConfig({ file }).config.size, 260);
});
