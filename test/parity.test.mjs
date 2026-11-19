/**
 * Согласованность двух половин: умолчания движка и хоста не должны разъехаться,
 * фразы — быть пригодными к показу, реплики инструментов — покрывать основные случаи.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { DEFAULTS } from '../lib/config.js';
import { TOOL_FALLBACK, TOOL_LINES, describeTool, describeTurnEnd, pickLine } from '../lib/tool-lines.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = join(here, '..', 'src', 'client');

/** Выполнить браузерный исходник в этом процессе: он сам вешается на globalThis */
function loadClientFile(name) {
  const source = readFileSync(join(clientDir, name), 'utf8');
  vm.runInThisContext(source, { filename: name });
}

loadClientFile('geometry.js');
loadClientFile('phrases.js');
loadClientFile('engine.js');

const engine = globalThis.CactusPet;
const phrases = globalThis.CactusPhrases;

test('умолчания движка совпадают с умолчаниями хоста', () => {
  assert.deepEqual(engine.DEFAULTS, DEFAULTS);
});

test('движок отдаёт стабильные ключи хранилища и стилей', () => {
  assert.equal(engine.STYLE_ID, 'dsh-pet-cactus-style');
  assert.equal(engine.STORAGE_KEY, 'dsh-pet-cactus:position');
});

test('все пулы фраз непустые, короткие и без дублей', () => {
  const all = [];
  for (const [mood, pool] of Object.entries(phrases.PHRASES)) {
    assert.ok(Array.isArray(pool), `${mood}: пул должен быть массивом`);
    assert.ok(pool.length >= 3, `${mood}: мало фраз (${pool.length})`);
    for (const line of pool) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim() !== '', `${mood}: пустая фраза`);
      assert.ok(line.length <= 140, `${mood}: слишком длинная фраза (${line.length})`);
    }
    all.push(...pool);
  }
  assert.equal(new Set(all).size, all.length, 'фразы не должны повторяться между пулами');
});

test('pickPhrase не выходит за границы пула и переживает пустое настроение', () => {
  assert.equal(phrases.pickPhrase('idle', () => 0), phrases.PHRASES.idle[0]);
  assert.equal(phrases.pickPhrase('idle', () => 0.999999), phrases.PHRASES.idle.at(-1));
  assert.ok(typeof phrases.pickPhrase('нет-такого') === 'string');
  assert.equal(phrases.maybePhrase('idle', 1, () => 0), '');
  assert.notEqual(phrases.maybePhrase('idle', 0, () => 0), '');
});

test('реплики инструментов: точное имя, префикс и запасной вариант', () => {
  assert.ok(TOOL_LINES.read.includes(describeTool('read', () => 0)));
  assert.ok(TOOL_LINES.pwsh.includes(describeTool('pwsh', () => 0)));
  assert.ok(describeTool('vision_ocr', () => 0).includes('картинку'));
  assert.ok(describeTool('captain_plan', () => 0).length > 0);
  assert.ok(TOOL_FALLBACK.includes(describeTool('совсем-незнакомый', () => 0)));
  assert.ok(TOOL_FALLBACK.includes(describeTool(undefined, () => 0)));
});

test('pickLine не падает на пустом списке', () => {
  assert.equal(pickLine([], () => 0), '');
  assert.equal(pickLine(undefined, () => 0), '');
});

test('завершение хода раскладывается по настроениям', () => {
  assert.equal(describeTurnEnd('completed').mood, 'success');
  assert.equal(describeTurnEnd('error').mood, 'error');
  assert.equal(describeTurnEnd('max-tokens').mood, 'error');
  assert.equal(describeTurnEnd('blocked').mood, 'waiting');
  assert.equal(describeTurnEnd('aborted').mood, 'idle');
  assert.equal(describeTurnEnd(undefined).mood, 'idle');
  assert.equal(describeTurnEnd('aborted').text, '');
});

test('сборка client.js содержит ровно один загрузчик модуля', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  const calls = bundle.match(/__ModuleLoader__\.load\(/g) ?? [];
  assert.equal(calls.length, 1, 'client.js должен звать load ровно один раз');
  assert.match(bundle, /const ID = 'dsh-pet-cactus'/);
  assert.doesNotMatch(bundle, /^\s*import\s/m, 'в браузерном бандле не должно быть import');
});

test('спрайт в бандле — data-URI webp, а не SVG', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  assert.match(bundle, /data:image\/webp;base64,[A-Za-z0-9+/=]{1000,}/, 'нет встроенного спрайта');
  assert.doesNotMatch(bundle, /<svg[\s>]/, 'векторный кактус должен быть убран');
  assert.match(bundle, /class="pc-plates"/, 'плашки — часть разметки');
  assert.match(bundle, /class="pc-art"/, 'картинка — часть разметки');
});

test('art.js собран из assets/pet.webp без потерь', () => {
  const art = readFileSync(join(here, '..', 'src', 'client', 'art.js'), 'utf8');
  const match = art.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
  assert.ok(match, 'art.js должен содержать data-URI webp');
  const packed = Buffer.from(match[1], 'base64');
  const sprite = readFileSync(join(here, '..', 'assets', 'pet.webp'));
  assert.deepEqual(packed, sprite, 'base64 в art.js должен совпадать с assets/pet.webp');
  assert.equal(packed.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(packed.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('меню убрано, а плашки и текст окрашены палитрой dsh-pet', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  assert.doesNotMatch(bundle, /pc-menu/, 'разметка и стили меню должны быть удалены');
  assert.doesNotMatch(bundle, /data-act=/, 'пунктов меню быть не должно');
  assert.doesNotMatch(bundle, /aria-expanded/, 'состояния меню быть не должно');
  assert.match(bundle, /\.pc-plate\{[^}]*background:rgba\(255,255,255,\.96\)/, 'плашка — белая, как у dsh-pet');
  assert.match(bundle, /\.pc-plate\{[^}]*color:#1f1f1f/, 'текст плашки — как у dsh-pet');
  assert.match(bundle, /\.pc-bubble\{[^}]*background:rgba\(255,255,255,\.96\)/, 'пузырь светлый');
  assert.match(bundle, /border:1px solid rgba\(0,0,0,\.12\)/, 'рамка нейтральная, без тёплого оттенка');
  for (const color of ['#2e9e4f', '#e8952f', '#e53935', '#9aa0a6']) {
    assert.ok(bundle.includes(color), `нет цвета палитры dsh-pet ${color}`);
  }
});

test('подписи настроений покрывают все настроения движка', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  for (const mood of ['idle', 'thinking', 'working', 'waiting', 'success', 'error', 'sleep', 'talk', 'drag']) {
    assert.match(bundle, new RegExp(`\\b${mood}: '(на связи|думаю…|работаю…|жду ответа|готово|споткнулся|сплю|говорю|несу)'`),
      `нет подписи для настроения ${mood}`);
  }
});

test('кегль плашек: .05 → .0525 (+5%), затем → .05775 (+10%)', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  assert.match(bundle, /\.pc-plates\{[^}]*font-size:calc\(var\(--pc-size,240px\)\*\.05775\)/,
    'базовый кегль плашек должен быть .05775, иначе масштаб не тот');
  assert.doesNotMatch(bundle, /var\(--pc-size,240px\)\*\.0525\)/, 'прошлый кегль .0525 остался в стилях');
  assert.doesNotMatch(bundle, /var\(--pc-size,240px\)\*\.05\)/, 'исходный кегль .05 остался в стилях');
  // имя и статус считаются в em от этого кегля — значит выросли вместе с ним
  assert.match(bundle, /\.pc-plate\{[^}]*font-size:1em/, 'имя — 1em от базового кегля');
  assert.match(bundle, /\.pc-chip\{[^}]*font-size:\.82em/, 'статус — .82em от базового кегля');
});

test('имя автора Samugor вшито в сборку, манифест и лицензию', () => {
  const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  const license = readFileSync(join(here, '..', 'LICENSE'), 'utf8');

  assert.match(bundle, /const AUTHOR = 'Samugor'/, 'нет константы автора в бандле');
  assert.match(bundle, /dataset\.author = AUTHOR/, 'data-author не ставится на оверлей');
  assert.match(bundle, /автор \$\{AUTHOR\}/, 'автор не попадает в подсказку и aria-label');
  assert.equal(pkg.author, 'Samugor', 'в package.json указан другой автор');
  assert.match(license, /Copyright \(c\) 2026 Samugor/, 'в LICENSE другой правообладатель');
});

test('иконка плагина проходит правила DSH: относительный путь, WebP, ≤ 256 КиБ', () => {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  const icon = pkg.icon;

  assert.equal(typeof icon, 'string', 'в package.json нет поля icon');
  assert.ok(!isAbsolute(icon), 'DSH требует относительный путь к иконке');
  assert.ok(!/^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon), 'абсолютный URL иконкой не является');
  assert.ok(!icon.startsWith('..'), 'иконка не должна выходить за каталог манифеста');
  assert.equal(extname(icon).toLowerCase(), '.webp', 'формат должен быть из списка DSH: SVG, PNG, JPEG, WebP');

  const bytes = readFileSync(join(here, '..', icon));
  assert.ok(bytes.length <= 256 * 1024, `иконка ${bytes.length} байт — больше лимита DSH в 256 КиБ`);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'это не WebP');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'это не WebP');
  assert.equal(existsSync(join(here, '..', 'assets', 'logo.svg')), false,
    'старая векторная иконка осталась рядом с актуальной');
});
