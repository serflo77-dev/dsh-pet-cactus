/**
 * Сборка браузерной половины: склеивает исходники в один файл lib/client.js.
 *
 * Почему не бандлер: клиентской половине не нужны ни зависимости, ни транспиляция.
 * Порядок файлов задаёт загрузку: геометрия → фразы → движок → адаптер.
 * Проверка после сборки — синтаксис через vm.SourceTextModule и размер файла.
 *
 * @module dsh-pet-cactus/scripts/build-client
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

const SOURCES = [
  'src/client/art.js',
  'src/client/geometry.js',
  'src/client/phrases.js',
  'src/client/engine.js',
  'src/client/adapter.js',
];

const OUTPUT = join(projectRoot, 'lib', 'client.js');

const banner = `/**
 * dsh-pet-cactus — браузерная половина (сборка).
 *
 * Файл собран из src/client/*.js скриптом scripts/build-client.mjs.
 * Правьте исходники, а не этот файл: при сборке он перезаписывается.
 *
 * Автор: Samugor. Лицензия MIT — имя автора остаётся в производных сборках.
 *
 * Контракт: скрипт сам зовёт window.__ModuleLoader__.load и не имеет
 * собственных import/export — иначе модульная система DSH его не примет.
 */`;

const parts = SOURCES.map((file) => {
  const source = readFileSync(join(projectRoot, file), 'utf8');
  if (/^\s*(import|export)\s/m.test(source)) {
    throw new Error(`${file}: браузерные исходники не должны содержать import/export`);
  }
  return `/* ---- ${file} ---- */\n${source.trim()}\n`;
});

const bundle = `${banner}\n(function () {\n'use strict';\n\n${parts.join('\n')}\n})();\n`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, bundle, 'utf8');

// Синтаксическая проверка: файл обязан разбираться как обычный скрипт.
try {
  new vm.Script(bundle, { filename: OUTPUT });
} catch (error) {
  throw new Error(`собранный client.js не разбирается: ${error instanceof Error ? error.message : String(error)}`);
}

const size = statSync(OUTPUT).size;
if (size < 4000) throw new Error(`client.js подозрительно маленький: ${size} байт`);

console.log(`client.js собран: ${SOURCES.length} исходника, ${(size / 1024).toFixed(1)} КБ`);
