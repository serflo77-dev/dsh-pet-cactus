/**
 * Адаптер DSH: отдаёт движок как клиентский плагин.
 *
 * Контракт DSH: клиентский бандл — обычный скрипт, который зовёт
 * `window.__ModuleLoader__.load({ id, factory })`. React приходит в factory
 * через require, поэтому сборщик не нужен: файл отдаётся как есть.
 *
 * @module dsh-pet-cactus/client/adapter
 */

(function () {
  'use strict';

  const root = typeof globalThis !== 'undefined' ? globalThis : this;
  const ID = 'dsh-pet-cactus';
  const loader = root.__ModuleLoader__;

  if (!loader || typeof loader.load !== 'function') {
    console.warn(`[${ID}] нет window.__ModuleLoader__ — клиентская половина не загрузится`);
    return;
  }

  loader.load({
    id: ID,
    factory(require) {
      let React = null;
      try {
        React = require('react');
      } catch (error) {
        console.error(`[${ID}] react недоступен:`, error);
      }

      // Без React плагин всё равно должен загрузиться: пустой слой лучше
      // упавшего apply, который ломает всю страницу.
      function CactusLayer() {
        const ref = React.useRef(null);
        React.useEffect(() => {
          const engine = root.CactusPet;
          if (ref.current === null || !engine) return undefined;
          let pet = null;
          try {
            pet = engine.create({ mount: ref.current });
          } catch (error) {
            console.error(`[${ID}] питомец не запустился:`, error);
          }
          return () => {
            try {
              pet?.destroy();
            } catch (error) {
              console.warn(`[${ID}] ошибка при остановке питомца:`, error);
            }
          };
        }, []);
        return React.createElement('div', { className: 'pc-slot', ref });
      }

      function apply(ctx) {
        if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') {
          console.warn(`[${ID}] сервис slots недоступен — оверлей не зарегистрирован`);
          return;
        }
        if (React === null) {
          console.warn(`[${ID}] без react оверлей не рендерится`);
          return;
        }
        // shell.overlay — тот же слот, куда вешают оверлеи другие плагины.
        // order 1200: поверх обычных панелей, под модалками хоста.
        ctx.slots.inject('shell.overlay', function* () {
          yield ctx.slots.register({ name: 'shell.overlay', id: ID, order: 1200 }, CactusLayer);
        });
      }

      return { name: ID, inject: ['slots'], apply };
    },
  });
})();
