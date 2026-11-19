/**
 * Собрать data-URI спрайта для браузерной половины.
 *
 * Почему data-URI, а не файл: клиентский бандл DSH отдаётся одним скриптом,
 * и относительный путь к картинке внутри чата резолвился бы от корня хоста.
 * Data-URI делает бандл самодостаточным: ни маршрута, ни чтения с диска.
 *
 * Источник — assets/pet.webp (спрайт с прозрачным фоном из make-plate.py).
 * Результат — src/client/art.js, который сборка ставит первым файлом.
 *
 * @module dsh-pet-cactus/scripts/make-art
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const source = join(projectRoot, 'assets', 'pet.webp');
const output = join(projectRoot, 'src', 'client', 'art.js');

const bytes = readFileSync(source);
const size = statSync(source).size;
if (size > 400_000) {
  throw new Error(`спрайт слишком тяжёлый: ${(size / 1024).toFixed(0)} КБ`);
}

const base64 = bytes.toString('base64');
const header = `/**
 * Спрайт питомца (data-URI). Файл собран scripts/make-art.mjs из assets/pet.webp.
 * Руками не править: при сборке спрайта файл перезаписывается.
 *
 * @module dsh-pet-cactus/client/art
 */

`;
writeFileSync(output, `${header}const ART = 'data:image/webp;base64,${base64}';\n`, 'utf8');
console.log(`art.js собран: ${(size / 1024).toFixed(1)} КБ webp → ${(base64.length / 1024).toFixed(0)} КБ base64`);
