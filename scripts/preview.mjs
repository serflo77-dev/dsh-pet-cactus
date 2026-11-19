/**
 * Генератор превью: две страницы для визуальной проверки.
 *
 * `states.html` — все настроения в сетке, чтобы видеть мимику и позы рядом.
 * `live.html` — как питомец выглядит на фоне интерфейса: угол, пузырь, тень.
 *
 * Страницы используют настоящие исходники из src/client — никаких копий,
 * поэтому превью всегда показывает то, что попадёт в сборку.
 *
 * @module dsh-pet-cactus/scripts/preview
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const outDir = join(projectRoot, 'preview');

const SOURCES = ['../src/client/art.js', '../src/client/geometry.js', '../src/client/phrases.js', '../src/client/engine.js'];

const head = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>dsh-pet-cactus — превью</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #f4f1ec; color: #24211e; }
  .caption { position: fixed; transform: translateX(-50%); font-size: 12px; font-weight: 600;
             color: #6b645c; letter-spacing: .02em; white-space: nowrap; }
  .note { position: fixed; left: 24px; top: 18px; max-width: 420px; font-size: 13px; line-height: 1.5;
          color: #6b645c; }
  .note b { color: #24211e; }
</style>
</head>
<body>`;

const scripts = SOURCES.map((src) => `<script src="${src}"></script>`).join('\n');

const statesPage = `${head}
<div class="note"><b>Кактус: восемь настроений.</b><br>
Проверка мимики, позы и читаемости на светлом фоне. Размер 150 px, позиции — сетка.</div>
${scripts}
<script>
  const MOODS = [
    ['idle', 'Покой'], ['thinking', 'Думает'], ['working', 'Работает'], ['waiting', 'Ждёт'],
    ['success', 'Готово'], ['error', 'Ошибка'], ['sleep', 'Сон'], ['talk', 'Говорит'],
  ];
  const COLS = 4;
  const SIZE = 150;
  const H = SIZE * 150 / 120;
  const GAP_X = 210;
  const GAP_Y = 250;
  const ORIGIN_X = 120;
  const ORIGIN_Y = 120;

  MOODS.forEach(([mood, label], index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = ORIGIN_X + col * GAP_X;
    const y = ORIGIN_Y + row * GAP_Y;
    const storage = {
      getItem: () => JSON.stringify({ x, y }),
      setItem: () => {},
      removeItem: () => {},
    };
    const pet = CactusPet.create({
      config: { size: SIZE, speech: false, reducedMotion: 'allow', name: label },
      storage,
      poll: false,
      initialMood: mood,
      options: {},
    });
    pet.setMood(mood);
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = label;
    caption.style.left = (x + SIZE / 2) + 'px';
    caption.style.top = (y + H + 4) + 'px';
    document.body.appendChild(caption);
  });
</script>
</body>
</html>
`;

const livePage = `${head}
<style>
  .app { position: fixed; inset: 0; display: grid; grid-template-columns: 260px 1fr; background: #fbfaf8; }
  .side { background: #efece6; border-right: 1px solid #e2ddd4; padding: 18px 16px; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #8a8278; }
  .row { margin-top: 18px; padding: 9px 10px; border-radius: 8px; background: #f7f4ee; font-size: 13px; color: #4c463f; }
  .main { padding: 22px 26px; }
  .title { font-size: 15px; font-weight: 700; color: #2c2823; }
  .bubble { max-width: 560px; margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: #fff;
            border: 1px solid #e6e1d8; font-size: 13.5px; line-height: 1.55; color: #3a352f; }
  .me { margin-top: 14px; margin-left: auto; max-width: 380px; background: #e9efe7; border-color: #d7e2d3; }
  .input { position: fixed; left: 300px; right: 320px; bottom: 26px; height: 44px; border-radius: 12px;
           border: 1px solid #e0dbd1; background: #fff; color: #a9a29a; font-size: 13px; padding: 13px 14px; }
  .hint { position: fixed; left: 300px; bottom: 84px; font-size: 12px; color: #9a928a; }
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand">DeepSeek Harness</div>
    <div class="row">Новая сессия</div>
    <div class="row">Разбор плагина</div>
    <div class="row">Кактус и мемы</div>
  </aside>
  <main class="main">
    <div class="title">Питомец на своём месте</div>
    <div class="bubble">Слева — интерфейс, справа внизу — кактус. Проверяем, что он не спорит с чатом,
      тень не липнет к краю, а пузырь читается на светлом фоне.</div>
    <div class="bubble me">И чтобы в углу не мешал.</div>
  </main>
</div>
<div class="hint">Клик по кактусу — реплика, перетаскивание — новое место. Меню нет.</div>
<div class="input">Написать сообщение…</div>
${scripts}
<script>
  const pet = CactusPet.create({
    config: { size: 230, corner: 'bottom-right', marginX: 34, marginY: 26, speech: false, reducedMotion: 'allow' },
    storage: null,
    poll: false,
  });
  setTimeout(() => {
    pet.setMood('working');
    pet.speak('Так, работаем. Я слежу за процессом.');
  }, 300);
</script>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'states.html'), statesPage, 'utf8');
writeFileSync(join(outDir, 'live.html'), livePage, 'utf8');
console.log(`превью: ${join(outDir, 'states.html')}`);
console.log(`превью: ${join(outDir, 'live.html')}`);
