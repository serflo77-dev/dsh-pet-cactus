/**
 * Адаптер DSH: собранный client.js должен сам зарегистрироваться в
 * __ModuleLoader__, отдать плагин с apply и положить оверлей в shell.overlay.
 *
 * React здесь фальшивый: проверяется не рендер, а контракт — имя модуля,
 * inject, ключ слота и форма регистрации. Реальный рендер проверяется
 * скриншотами превью.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

/** Загрузить бандл в изолированный контекст с фальшивым загрузчиком */
function loadBundle() {
  let loaded = null;
  const sandbox = {
    console,
    __ModuleLoader__: {
      load(info) {
        loaded = info;
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundle, sandbox, { filename: 'client.js' });
  return { loaded, sandbox };
}

/** Минимальный React: ровно те три функции, которые зовёт адаптер */
function fakeReact() {
  return {
    useRef(initial) {
      return { current: initial };
    },
    useEffect() {},
    createElement(type, props, ...children) {
      return { type, props, children };
    },
  };
}

test('бандл регистрируется под своим id и грузит фабрику', () => {
  const { loaded } = loadBundle();
  assert.ok(loaded, 'window.__ModuleLoader__.load не вызван');
  assert.equal(loaded.id, 'dsh-pet-cactus');
  assert.equal(typeof loaded.factory, 'function');
});

test('плагин объявляет зависимость slots и не падает без неё', () => {
  const { loaded } = loadBundle();
  const plugin = loaded.factory((name) => {
    if (name === 'react') return fakeReact();
    throw new Error(`неожиданный require: ${name}`);
  });
  assert.equal(plugin.name, 'dsh-pet-cactus');
  // Массив приходит из другого realm — сравниваем содержимое, а не прототип
  assert.equal(plugin.inject.length, 1);
  assert.equal(plugin.inject[0], 'slots');
  assert.equal(typeof plugin.apply, 'function');
  // Без сервиса slots apply обязан промолчать, а не бросить
  assert.doesNotThrow(() => plugin.apply({}));
  assert.doesNotThrow(() => plugin.apply(null));
});

test('apply кладёт оверлей в shell.overlay с ожидаемыми опциями', () => {
  const { loaded } = loadBundle();
  const events = [];
  const ctx = {
    slots: {
      inject(key, callback) {
        events.push({ kind: 'inject', key });
        const effect = callback();
        events.push({ kind: 'effect', iterations: [...effect] });
        return () => {};
      },
      register(options, component) {
        events.push({ kind: 'register', options, component });
        return () => {};
      },
    },
  };
  const plugin = loaded.factory((name) => {
    if (name === 'react') return fakeReact();
    throw new Error(`неожиданный require: ${name}`);
  });
  plugin.apply(ctx);

  const inject = events.find((event) => event.kind === 'inject');
  assert.equal(inject?.key, 'shell.overlay');

  const register = events.find((event) => event.kind === 'register');
  assert.ok(register, 'slots.register не вызван');
  assert.equal(register.options.name, 'shell.overlay');
  assert.equal(register.options.id, 'dsh-pet-cactus');
  assert.equal(typeof register.options.order, 'number');
  assert.equal(typeof register.component, 'function');
});

test('компонент слоя — функция, возвращающая React-элемент с ref', () => {
  const { loaded } = loadBundle();
  let captured = null;
  const ctx = {
    slots: {
      inject(key, callback) {
        for (const _ of callback()) void _;
        return () => {};
      },
      register(options, component) {
        captured = component;
        return () => {};
      },
    },
  };
  loaded.factory((name) => {
    if (name === 'react') return fakeReact();
    throw new Error(`неожиданный require: ${name}`);
  }).apply(ctx);

  const element = captured();
  assert.equal(element.type, 'div');
  assert.equal(element.props.className, 'pc-slot');
  assert.ok('ref' in element.props, 'ref обязателен: движок монтируется в него');
});

test('без react плагин загружается, но оверлей не регистрирует', () => {
  const { loaded } = loadBundle();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const plugin = loaded.factory((name) => {
      if (name === 'react') throw new Error('react недоступен');
      throw new Error(`неожиданный require: ${name}`);
    });
    let registered = false;
    plugin.apply({
      slots: {
        inject() {
          registered = true;
          return () => {};
        },
        register() {
          throw new Error('не должен вызываться');
        },
      },
    });
    assert.equal(registered, false);
    assert.ok(warnings.some((line) => line.includes('react')));
  } finally {
    console.warn = originalWarn;
  }
});
