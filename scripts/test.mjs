/**
 * Запуск тестов в одном процессе.
 *
 * `node --test test/` порождает дочерние процессы на каждый файл; в песочнице
 * DSH spawn запрещён, поэтому файлы импортируются по очереди, а node:test сам
 * собирает и прогоняет зарегистрированные тесты.
 *
 * @module dsh-pet-cactus/scripts/test
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = new URL('../test/', import.meta.url);
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort();

if (files.length === 0) {
  console.error('тестов не найдено');
  process.exitCode = 1;
} else {
  for (const file of files) {
    await import(pathToFileURL(fileURLToPath(new URL(file, dir))).href);
  }
  console.log(`\nфайлов тестов: ${files.length}`);
}
