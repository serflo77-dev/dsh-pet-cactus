/**
 * Геометрия: чистые функции, ради которых и вынесены из движка.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'client', 'geometry.js'), 'utf8');
vm.runInThisContext(source, { filename: 'geometry.js' });
const G = globalThis.CactusGeometry;

test('clamp держит границы и переживает перевёрнутый диапазон', () => {
  assert.equal(G.clamp(5, 0, 10), 5);
  assert.equal(G.clamp(-1, 0, 10), 0);
  assert.equal(G.clamp(11, 0, 10), 10);
  assert.equal(G.clamp(5, 10, 0), 10);
});

test('clampPosition не выпускает питомца за окно', () => {
  assert.deepEqual(G.clampPosition(-50, -50, 240, 300, 1000, 800), { x: 8, y: 8 });
  assert.deepEqual(G.clampPosition(5000, 5000, 240, 300, 1000, 800), { x: 752, y: 492 });
});

test('clampPosition не ломается, если питомец больше окна', () => {
  const pos = G.clampPosition(100, 100, 900, 900, 500, 500);
  assert.equal(pos.x, 8);
  assert.equal(pos.y, 8);
});

test('углы считаются с отступами и размером питомца', () => {
  const w = 200;
  const h = 250;
  const vw = 1000;
  const vh = 800;
  assert.deepEqual(G.cornerPosition('top-left', w, h, vw, vh, 20, 30), { x: 20, y: 30 });
  assert.deepEqual(G.cornerPosition('top-right', w, h, vw, vh, 20, 30), { x: 780, y: 30 });
  assert.deepEqual(G.cornerPosition('bottom-left', w, h, vw, vh, 20, 30), { x: 20, y: 520 });
  assert.deepEqual(G.cornerPosition('bottom-right', w, h, vw, vh, 20, 30), { x: 780, y: 520 });
  // неизвестный угол трактуется как правый нижний: питомец обязан где-то встать
  assert.deepEqual(G.cornerPosition('куда-нибудь', w, h, vw, vh, 20, 30), { x: 780, y: 520 });
});

test('сохранённая позиция разбирается, мусор возвращает null', () => {
  assert.deepEqual(G.parseStored('{"x":12,"y":34}'), { x: 12, y: 34 });
  assert.deepEqual(G.parseStored('{"x":"12","y":34}'), { x: 12, y: 34 });
  assert.equal(G.parseStored(null), null);
  assert.equal(G.parseStored(''), null);
  assert.equal(G.parseStored('null'), null);
  assert.equal(G.parseStored('[]'), null);
  assert.equal(G.parseStored('{"x":1}'), null);
  assert.equal(G.parseStored('не json'), null);
});

test('пузырь ставится над питомцем и прижимается к краям', () => {
  const middle = G.bubbleBox(400, 300, 200, 240, 60, 1000);
  assert.equal(middle.above, true);
  assert.equal(middle.left, 380);
  assert.equal(middle.top, 300 - 60 - 12);
  assert.equal(middle.arrowX, 120);

  const left = G.bubbleBox(0, 300, 200, 240, 60, 1000);
  assert.equal(left.left, G.EDGE);

  const right = G.bubbleBox(950, 300, 200, 240, 60, 1000);
  assert.equal(right.left, 1000 - 240 - G.EDGE);

  const top = G.bubbleBox(400, 10, 200, 240, 60, 1000);
  assert.equal(top.above, false);
  assert.equal(top.top, 26);
});

test('стрелка пузыря не уезжает в скругления', () => {
  const box = G.bubbleBox(0, 300, 200, 240, 60, 1000);
  assert.ok(box.arrowX >= 18);
  assert.ok(box.arrowX <= 240 - 18);
});
