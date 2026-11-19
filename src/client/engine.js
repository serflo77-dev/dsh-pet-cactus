/**
 * Движок питомца: DOM, анимации, перетаскивание, пузырь.
 *
 * Сознательно не знает про React и DSH: принимает точку монтирования и живёт
 * в обычном браузере. Адаптер для DSH — двадцать строк в adapter.js, превью —
 * обычный HTML, тесты геометрии — без DOM вовсе.
 *
 * Инварианты:
 * - всё, что создаётся, удаляется в destroy() (питомец переживает HMR и
 *   повторный монт без утечек);
 * - сеть только к своему префиксу, ошибки сети не всплывают в интерфейс;
 * - host-настроение — подсказка, а не команда: без хоста питомец работает сам.
 *
 * @module dsh-pet-cactus/client/engine
 */

(function (root) {
  'use strict';

  const G = root.CactusGeometry;
  const P = root.CactusPhrases;

  /** Префикс маршрутов host-половины */
  const PREFIX = '/dsh-pet-cactus';

  /** id тега стилей: один на страницу, сколько бы питомцев ни монтировали */
  const STYLE_ID = 'dsh-pet-cactus-style';

  /** Ключ позиции в localStorage */
  const STORAGE_KEY = 'dsh-pet-cactus:position';

  /**
   * Автор. Вшит в разметку (`data-author`), подсказку и бандл: чтобы убрать имя,
   * придётся править исходники, а не настройки.
   */
  const AUTHOR = 'Samugor';

  /** Значения по умолчанию. Должны совпадать с lib/config.js — это проверяет тест. */
  const DEFAULTS = {
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
  };

  /** Соотношение сторон спрайта: 480×690 */
  const ASPECT = 690 / 480;

  /** Настроения, которые проигрываются один раз и требуют перезапуска анимации */
  const ONE_SHOT = new Set(['success', 'error', 'talk']);

  /** Настроения, которые понимает движок */
  const MOODS = new Set(['idle', 'thinking', 'working', 'waiting', 'success', 'error', 'sleep', 'talk', 'drag']);

  const CSS = `
.pc-mount{position:fixed;inset:0;z-index:60;pointer-events:none;}
.pc-pet{position:fixed;pointer-events:auto;user-select:none;-webkit-user-select:none;outline:none;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}
.pc-pet.pc-dragging .pc-body{cursor:grabbing;}
.pc-body{position:relative;width:100%;aspect-ratio:480/690;cursor:grab;touch-action:none;
  transform-origin:50% 92%;filter:drop-shadow(0 7px 10px rgba(0,0,0,.16));}
.pc-body img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;
  -webkit-user-drag:none;user-select:none;}
.pc-pet:focus-visible .pc-body{filter:drop-shadow(0 0 0 2px #2b63ff) drop-shadow(0 7px 10px rgba(0,0,0,.16));}
.pc-pet[data-mood="sleep"] .pc-body img{filter:saturate(.82) brightness(.95);}
.pc-plates{display:flex;flex-direction:column;align-items:center;gap:.3em;margin-bottom:.45em;
  font-size:calc(var(--pc-size,240px)*.05775);pointer-events:none;}
.pc-plate{display:inline-flex;align-items:center;gap:.45em;max-width:100%;padding:.46em .85em;
  border-radius:1.1em;background:rgba(255,255,255,.96);color:#1f1f1f;font-family:Roboto,"Segoe UI",
  "Helvetica Neue",Arial,sans-serif;font-weight:700;font-size:1em;line-height:1.1;letter-spacing:-.01em;
  border:1px solid rgba(0,0,0,.12);box-shadow:0 4px 13px rgba(0,0,0,.18);white-space:nowrap;}
.pc-chip{display:inline-flex;align-items:center;gap:.4em;padding:.34em .72em;border-radius:1em;
  background:rgba(255,255,255,.92);color:rgba(43,43,43,.6);font-family:Roboto,"Segoe UI","Helvetica Neue",Arial,
  sans-serif;font-weight:700;font-size:.82em;line-height:1.1;border:1px solid rgba(0,0,0,.12);
  box-shadow:0 3px 9px rgba(0,0,0,.14);white-space:nowrap;}
.pc-dot{width:.52em;height:.52em;border-radius:50%;background:#2e9e4f;flex:none;}
.pc-pet[data-mood="thinking"] .pc-dot,.pc-pet[data-mood="working"] .pc-dot,
.pc-pet[data-mood="waiting"] .pc-dot,.pc-pet[data-mood="talk"] .pc-dot{background:#e8952f;}
.pc-pet[data-mood="error"] .pc-dot{background:#e53935;}
.pc-pet[data-mood="sleep"] .pc-dot{background:#9aa0a6;}
.pc-bubble{position:fixed;max-width:250px;background:rgba(255,255,255,.96);color:#1f1f1f;border-radius:14px;
  padding:9px 12px;font-size:13px;font-weight:600;line-height:1.3;letter-spacing:-.01em;
  border:1px solid rgba(0,0,0,.12);box-shadow:0 10px 26px rgba(0,0,0,.18);pointer-events:none;opacity:0;
  transform:translateY(4px) scale(.96);transition:opacity .16s ease,transform .16s ease;white-space:pre-wrap;}
.pc-bubble[data-visible="true"]{opacity:1;transform:none;}
.pc-bubble::after{content:"";position:absolute;left:var(--pc-arrow,50%);width:9px;height:9px;
  background:inherit;transform:translateX(-50%) rotate(45deg);border-radius:1px;}
.pc-bubble[data-side="above"]::after{bottom:-5px;border-right:1px solid rgba(0,0,0,.12);
  border-bottom:1px solid rgba(0,0,0,.12);}
.pc-bubble[data-side="below"]::after{top:-5px;border-left:1px solid rgba(0,0,0,.12);
  border-top:1px solid rgba(0,0,0,.12);}
.pc-mark{position:absolute;right:2%;top:8%;font-weight:800;font-size:19px;line-height:1;
  color:rgba(43,43,43,.55);opacity:0;transform:scale(.6);transition:opacity .18s ease,transform .18s ease;pointer-events:none;}
.pc-pet[data-mood="thinking"] .pc-mark,.pc-pet[data-mood="waiting"] .pc-mark{opacity:1;transform:none;}
.pc-pet[data-mood="waiting"] .pc-mark{color:#e8952f;}
.pc-zzz{position:absolute;right:4%;top:2%;display:flex;align-items:flex-end;gap:1px;
  font-weight:800;color:#9aa0a6;opacity:0;transition:opacity .3s ease;pointer-events:none;}
.pc-pet[data-mood="sleep"] .pc-zzz{opacity:1;}
.pc-zzz span:nth-child(1){font-size:11px;animation:pc-zzz 2.8s ease-in-out infinite;}
.pc-zzz span:nth-child(2){font-size:14px;animation:pc-zzz 2.8s ease-in-out .35s infinite;}
.pc-zzz span:nth-child(3){font-size:17px;animation:pc-zzz 2.8s ease-in-out .7s infinite;}

.pc-pet[data-mood="idle"] .pc-body{animation:pc-idle 5.2s ease-in-out infinite;}
.pc-pet[data-mood="thinking"] .pc-body{animation:pc-think 2.6s ease-in-out infinite;}
.pc-pet[data-mood="working"] .pc-body{animation:pc-working .52s ease-in-out infinite;}
.pc-pet[data-mood="waiting"] .pc-body{animation:pc-wait 1.1s ease-in-out infinite;}
.pc-pet[data-mood="success"] .pc-body{animation:pc-hop .9s cubic-bezier(.3,1.4,.4,1) 1;}
.pc-pet[data-mood="error"] .pc-body{animation:pc-shake .5s ease-in-out 1;}
.pc-pet[data-mood="talk"] .pc-body{animation:pc-talk .4s ease-out 2;}
.pc-pet[data-mood="sleep"] .pc-body{animation:pc-sleep 5.6s ease-in-out infinite;}
.pc-pet.pc-dragging .pc-body{animation:none;transform:rotate(-4deg);}
.pc-pet.pc-reduce .pc-body,.pc-pet.pc-reduce .pc-eye,.pc-pet.pc-reduce .pc-zzz span{animation:none!important;}

@keyframes pc-idle{0%{transform:rotate(-1deg) scale(1,1)}50%{transform:rotate(1.1deg) scale(1.008,.992)}100%{transform:rotate(-1deg) scale(1,1)}}
@keyframes pc-think{0%{transform:rotate(0) translateY(0)}35%{transform:rotate(-3.5deg) translateY(-2px)}70%{transform:rotate(-2deg) translateY(0)}100%{transform:rotate(0) translateY(0)}}
@keyframes pc-working{0%{transform:translateY(0)}50%{transform:translateY(-4px)}100%{transform:translateY(0)}}
@keyframes pc-wait{0%{transform:translateX(0)}25%{transform:translateX(-1.6px)}75%{transform:translateX(1.6px)}100%{transform:translateX(0)}}
@keyframes pc-hop{0%{transform:translateY(0) scale(1,1)}18%{transform:translateY(0) scale(1.08,.9)}42%{transform:translateY(-18px) scale(.96,1.06)}72%{transform:translateY(0) scale(1.05,.94)}100%{transform:translateY(0) scale(1,1)}}
@keyframes pc-shake{0%,100%{transform:rotate(0)}20%{transform:rotate(2.4deg)}45%{transform:rotate(-2.4deg)}70%{transform:rotate(1.4deg)}}
@keyframes pc-talk{0%{transform:scale(1,1)}40%{transform:scale(1.04,.94)}100%{transform:scale(1,1)}}
@keyframes pc-sleep{0%{transform:rotate(-4deg) scale(1,.985)}50%{transform:rotate(-4.6deg) scale(1.005,.975)}100%{transform:rotate(-4deg) scale(1,.985)}}
@keyframes pc-zzz{0%{opacity:0;transform:translateY(2px)}30%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
@media (prefers-reduced-motion: reduce){
  .pc-pet[data-mood] .pc-body,.pc-eye,.pc-zzz span{animation:none!important;}
}
`;

  /**
   * Спрайт приходит из art.js (data-URI, собирается scripts/make-art.mjs).
   * Если файла нет — движок не падает, просто остаётся без картинки.
   */
  const ART_URI = typeof ART === 'string' ? ART : '';

  /** Подпись под именем: что питомец делает прямо сейчас */
  const STATUS = {
    idle: 'на связи',
    thinking: 'думаю…',
    working: 'работаю…',
    waiting: 'жду ответа',
    success: 'готово',
    error: 'споткнулся',
    sleep: 'сплю',
    talk: 'говорю',
    drag: 'несу',
  };

  /**
   * Вставить стили один раз на документ.
   * @param {Document} doc
   */
  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID) !== null) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  /**
   * Слить присланный конфиг с умолчаниями, ничего не доверяя хосту.
   * @param {Record<string, unknown>} [patch]
   * @returns {typeof DEFAULTS}
   */
  function normalizeConfig(patch) {
    const config = { ...DEFAULTS };
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return config;
    for (const key of Object.keys(DEFAULTS)) {
      const value = /** @type {Record<string, unknown>} */ (patch)[key];
      if (value === undefined) continue;
      if (key === 'phrases') {
        if (Array.isArray(value)) {
          config.phrases = value.filter((item) => typeof item === 'string').slice(0, 30);
        }
        continue;
      }
      if (key === 'size' || key === 'marginX' || key === 'marginY' || key === 'opacity' ||
          key === 'speechIntervalMin' || key === 'bubbleMs' || key === 'sleepAfterMin') {
        const n = Number(value);
        if (Number.isFinite(n)) /** @type {any} */ (config)[key] = n;
        continue;
      }
      if (key === 'speech' || key === 'reactToAgent') {
        if (typeof value === 'boolean') /** @type {any} */ (config)[key] = value;
        continue;
      }
      if (typeof value === 'string') /** @type {any} */ (config)[key] = value;
    }
    config.size = G.clamp(Math.round(config.size), 120, 420);
    config.opacity = G.clamp(config.opacity, 0.3, 1);
    config.bubbleMs = G.clamp(config.bubbleMs, 2000, 30000);
    config.speechIntervalMin = G.clamp(config.speechIntervalMin, 1, 180);
    config.sleepAfterMin = G.clamp(config.sleepAfterMin, 1, 240);
    return config;
  }

  /**
   * localStorage может бросать (приватный режим, отключённое хранилище).
   * @param {Window} win
   * @returns {Storage | null}
   */
  function safeStorage(win) {
    try {
      const storage = win.localStorage;
      const probe = '__pc_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  }

  /**
   * Создать питомца.
   *
   * @param {object} [options]
   * @param {HTMLElement} [options.mount] - контейнер (по умолчанию body)
   * @param {Record<string, unknown>} [options.config] - стартовый конфиг
   * @param {Document} [options.document]
   * @param {Window} [options.window]
   * @param {Storage | null} [options.storage] - null отключает сохранение позиции
   * @param {boolean} [options.poll] - опрашивать host (по умолчанию да)
   * @param {string} [options.initialMood] - только для превью
   * @param {() => number} [options.random]
   * @returns {{ destroy: () => void, setMood: (mood: string, text?: string) => void,
   *   speak: (text?: string) => void, setConfig: (patch: Record<string, unknown>) => void,
   *   element: HTMLElement, config: () => Record<string, any> }}
   */
  function create(options = {}) {
    const doc = options.document ?? root.document;
    const win = options.window ?? root.window ?? root;
    if (!doc || typeof doc.createElement !== 'function') {
      return { destroy() {}, setMood() {}, speak() {}, setConfig() {}, element: null, config: () => ({ ...DEFAULTS }) };
    }

    injectStyle(doc);

    let config = normalizeConfig(options.config);
    let storage = options.storage === undefined ? safeStorage(win) : options.storage;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const mount = options.mount ?? doc.body;

    const mountEl = doc.createElement('div');
    mountEl.className = 'pc-mount';
    mountEl.dataset.pet = 'cactus';
    mountEl.dataset.author = AUTHOR;

    const pet = doc.createElement('div');
    pet.className = 'pc-pet';
    pet.dataset.mood = 'idle';
    pet.tabIndex = 0;
    pet.setAttribute('role', 'button');
    pet.setAttribute('aria-label', `${config.name}: питомец, автор ${AUTHOR}`);
    pet.title = `${config.name} · dsh-pet-cactus · автор ${AUTHOR}`;
    pet.style.width = `${config.size}px`;
    pet.style.opacity = String(config.opacity);
    pet.style.setProperty('--pc-size', `${config.size}px`);

    pet.innerHTML = `
      <div class="pc-bubble" role="status" aria-live="polite" data-visible="false" hidden><span class="pc-bubble-text"></span></div>
      <div class="pc-plates" aria-hidden="true">
        <div class="pc-plate"><span class="pc-dot"></span><span class="pc-name"></span></div>
        <div class="pc-chip"><span class="pc-status"></span></div>
      </div>
      <div class="pc-body">
        <img class="pc-art" alt="" draggable="false">
        <div class="pc-mark" aria-hidden="true">?</div>
        <div class="pc-zzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span></div>
      </div>`;

    mountEl.appendChild(pet);
    mount.appendChild(mountEl);

    const body = /** @type {HTMLElement} */ (pet.querySelector('.pc-body'));
    const bubble = /** @type {HTMLElement} */ (pet.querySelector('.pc-bubble'));
    const bubbleText = /** @type {HTMLElement} */ (pet.querySelector('.pc-bubble-text'));
    const mark = /** @type {HTMLElement} */ (pet.querySelector('.pc-mark'));
    const artImg = /** @type {HTMLImageElement} */ (pet.querySelector('.pc-art'));
    const nameEl = /** @type {HTMLElement} */ (pet.querySelector('.pc-name'));
    const statusEl = /** @type {HTMLElement} */ (pet.querySelector('.pc-status'));
    if (ART_URI !== '') artImg.src = ART_URI;
    nameEl.textContent = config.name;
    statusEl.textContent = STATUS.idle;

    /** Слушатели для снятия в destroy */
    const listeners = [];
    /**
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListener} fn
     * @param {AddEventListenerOptions | boolean} [opts]
     */
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    }

    let currentMood = 'idle';
    let sleeping = false;
    let lastActivity = Date.now();
    let lastSeq = -1;
    let bubbleTimer = 0;
    let speechTimer = 0;
    let sleepTimer = 0;
    let pollTimer = 0;
    let destroyed = false;

    /** Высота питомца: плашки + спрайт. Меряем DOM, чтобы не гадать о шрифтах. */
    const height = () => {
      const measured = pet.getBoundingClientRect().height;
      return measured > 0 ? measured : config.size * ASPECT;
    };

    /** Применить классы, зависящие от настроек */
    function applyLook() {
      pet.style.width = `${config.size}px`;
      pet.style.opacity = String(config.opacity);
      pet.style.setProperty('--pc-size', `${config.size}px`);
      nameEl.textContent = config.name;
      pet.setAttribute('aria-label', `${config.name}: питомец, автор ${AUTHOR}`);
      pet.title = `${config.name} · dsh-pet-cactus · автор ${AUTHOR}`;
      const reduce =
        config.reducedMotion === 'reduce' ||
        (config.reducedMotion === 'auto' &&
          typeof win.matchMedia === 'function' &&
          win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      pet.classList.toggle('pc-reduce', reduce);
    }

    /**
     * Поставить питомца в точку, не вылезая за окно.
     * @param {number} x
     * @param {number} y
     * @param {boolean} [save]
     */
    function place(x, y, save) {
      const pos = G.clampPosition(x, y, config.size, height(), win.innerWidth, win.innerHeight);
      pet.style.left = `${Math.round(pos.x)}px`;
      pet.style.top = `${Math.round(pos.y)}px`;
      if (save === true) {
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(pos));
        } catch {
          /* хранилище недоступно — переживём */
        }
      }
      if (bubble.dataset.visible === 'true') {
        positionBubble();
      }
    }

    /** Стартовая позиция: сохранённая или угол из конфига */
    function initialPlace() {
      let stored = null;
      try {
        stored = G.parseStored(storage?.getItem(STORAGE_KEY) ?? null);
      } catch {
        stored = null;
      }
      if (stored !== null) {
        place(stored.x, stored.y, false);
        return;
      }
      const corner = G.cornerPosition(
        config.corner,
        config.size,
        height(),
        win.innerWidth,
        win.innerHeight,
        config.marginX,
        config.marginY,
      );
      place(corner.x, corner.y, false);
    }

    /** Пересчитать позицию пузыря относительно питомца */
    function positionBubble() {
      const rect = pet.getBoundingClientRect();
      const width = bubble.offsetWidth;
      const box = G.bubbleBox(rect.left, rect.top, rect.width, width, bubble.offsetHeight, win.innerWidth);
      bubble.style.left = `${Math.round(box.left)}px`;
      bubble.style.top = `${Math.round(box.top)}px`;
      bubble.dataset.side = box.above ? 'above' : 'below';
      bubble.style.setProperty('--pc-arrow', `${Math.round(box.arrowX)}px`);
    }

    /**
     * Показать пузырь.
     * @param {string} text
     * @param {number} [ms]
     */
    function showBubble(text, ms) {
      if (typeof text !== 'string' || text.trim() === '') return;
      bubbleText.textContent = text;
      bubble.hidden = false;
      // offsetWidth считается без transform — размер точный до анимации появления
      positionBubble();
      bubble.dataset.visible = 'true';
      if (bubbleTimer !== 0) win.clearTimeout(bubbleTimer);
      const duration = typeof ms === 'number' ? ms : config.bubbleMs;
      bubbleTimer = win.setTimeout(() => {
        bubbleTimer = 0;
        bubble.dataset.visible = 'false';
        win.setTimeout(() => {
          if (bubble.dataset.visible === 'false') bubble.hidden = true;
        }, 180);
      }, duration);
    }

    /** Спрятать пузырь немедленно */
    function hideBubble() {
      if (bubbleTimer !== 0) {
        win.clearTimeout(bubbleTimer);
        bubbleTimer = 0;
      }
      bubble.dataset.visible = 'false';
      bubble.hidden = true;
    }

    /**
     * Сменить настроение (и, при желании, сказать фразу).
     * @param {string} mood
     * @param {string} [text]
     */
    function setMood(mood, text) {
      const next = MOODS.has(mood) ? mood : 'idle';
      if (next !== 'sleep') {
        lastActivity = Date.now();
        sleeping = false;
      }
      if (next === 'thinking') mark.textContent = '?';
      if (next === 'waiting') mark.textContent = '!';
      if (next !== currentMood || ONE_SHOT.has(next)) {
        // Сброс атрибута перезапускает CSS-анимацию того же настроения
        if (ONE_SHOT.has(next)) {
          pet.dataset.mood = 'none';
          void pet.offsetWidth;
        }
        pet.dataset.mood = next;
        currentMood = next;
      }
      statusEl.textContent = STATUS[next] ?? STATUS.idle;
      if (typeof text === 'string' && text !== '') showBubble(text);
    }

    /** Пул фраз с пользовательскими добавками */
    function phrase(mood) {
      if (mood === 'idle' && config.phrases.length > 0) {
        const pool = config.phrases;
        return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? P.pickPhrase('idle', random);
      }
      return P.pickPhrase(mood, random);
    }

    /**
     * Сказать фразу; без аргумента — из пула покоя/пробуждения.
     * @param {string} [text]
     */
    function speak(text) {
      const line = typeof text === 'string' && text !== '' ? text : phrase(sleeping ? 'wake' : 'click');
      if (sleeping) {
        sleeping = false;
        setMood('idle');
      }
      setMood('talk');
      showBubble(line);
      if (currentMood === 'talk') {
        // «Говорящее» настроение возвращается в покой само
        win.setTimeout(() => {
          if (!destroyed && currentMood === 'talk') setMood('idle');
        }, 900);
      }
      lastActivity = Date.now();
    }

    /** Планировать следующую реплику «сам с собой» */
    function scheduleSpeech() {
      if (speechTimer !== 0) win.clearTimeout(speechTimer);
      if (config.speech !== true) return;
      const base = config.speechIntervalMin * 60_000;
      const delay = base * (0.7 + random() * 0.6);
      speechTimer = win.setTimeout(() => {
        speechTimer = 0;
        if (destroyed) return;
        if (currentMood === 'idle' && doc.visibilityState !== 'hidden') {
          const line = P.maybePhrase('idle', 0.35, random);
          if (line !== '') showBubble(line);
        }
        scheduleSpeech();
      }, delay);
    }

    /** Уснуть, если давно не трогали */
    function checkSleep() {
      if (destroyed) return;
      const quietMs = Date.now() - lastActivity;
      if (currentMood === 'idle' && quietMs >= config.sleepAfterMin * 60_000 && !sleeping) {
        sleeping = true;
        setMood('sleep');
        showBubble(phrase('sleep'), 5000);
      }
    }

    /** Хост-настроение: одно и то же состояние не перерисовываем */
    async function poll() {
      if (destroyed) return;
      try {
        const response = await win.fetch(`${PREFIX}/api/state`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data?.seq !== 'number' || data.seq === lastSeq) return;
        lastSeq = data.seq;
        if (typeof data.mood === 'string') setMood(data.mood, typeof data.text === 'string' ? data.text : '');
      } catch {
        /* хост недоступен — питомец живёт своей жизнью */
      }
    }

    /** Прочитать конфиг с хоста; ошибка — не повод ломаться */
    async function loadConfig() {
      try {
        const response = await win.fetch(`${PREFIX}/api/config`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.config) {
          config = normalizeConfig({ ...config, ...data.config });
          applyLook();
          initialPlace();
          scheduleSpeech();
        }
      } catch {
        /* остаёмся на локальных умолчаниях */
      }
    }

    // ---- перетаскивание -----------------------------------------------------

    /** @type {{ id: number, startX: number, startY: number, originX: number, originY: number, moved: boolean } | null} */
    let drag = null;

    /** @param {PointerEvent} event */
    function onPointerDown(event) {
      if (event.button !== 0) return;
      const rect = pet.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.left,
        originY: rect.top,
        moved: false,
      };
      try {
        body.setPointerCapture(event.pointerId);
      } catch {
        /* синтетические события в тестах не имеют capture */
      }
      pet.classList.add('pc-dragging');
      event.preventDefault();
    }

    /** @param {PointerEvent} event */
    function onPointerMove(event) {
      if (drag === null || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        setMood('drag');
        showBubble(phrase('drag'), 1800);
      }
      if (!drag.moved) return;
      place(drag.originX + dx, drag.originY + dy, false);
    }

    /** @param {PointerEvent} event */
    function onPointerUp(event) {
      if (drag === null) return;
      const moved = drag.moved;
      drag = null;
      pet.classList.remove('pc-dragging');
      try {
        body.releasePointerCapture(event.pointerId);
      } catch {
        /* уже отпущен */
      }
      if (moved) {
        setMood('idle');
        const left = Number.parseFloat(pet.style.left);
        const top = Number.parseFloat(pet.style.top);
        place(left, top, true);
      } else {
        speak();
      }
    }

    // ---- подписки -----------------------------------------------------------

    on(body, 'pointerdown', onPointerDown);
    on(win, 'pointermove', /** @type {EventListener} */ (onPointerMove));
    on(win, 'pointerup', /** @type {EventListener} */ (onPointerUp));
    on(win, 'pointercancel', /** @type {EventListener} */ (onPointerUp));
    on(pet, 'contextmenu', (event) => {
      // Меню у питомца нет: правый клик просто не должен звать системное
      event.preventDefault();
    });
    on(pet, 'click', (event) => {
      // Клик по плашкам или пустому месту карточки: по спрайту уже сказали на pointerup
      const target = /** @type {Node} */ (event.target);
      if (target === body || body.contains(target)) return;
      speak();
    });
    on(pet, 'keydown', (event) => {
      const key = /** @type {KeyboardEvent} */ (event).key;
      const step = 16;
      const left = Number.parseFloat(pet.style.left);
      const top = Number.parseFloat(pet.style.top);
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        speak();
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        place(left - step, top, true);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        place(left + step, top, true);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        place(left, top - step, true);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        place(left, top + step, true);
      }
    });
    on(win, 'resize', () => {
      const left = Number.parseFloat(pet.style.left);
      const top = Number.parseFloat(pet.style.top);
      place(left, top, false);
    });
    on(doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'visible') {
        lastActivity = Date.now();
        poll();
      }
    });

    // ---- старт --------------------------------------------------------------

    applyLook();
    initialPlace();
    if (typeof options.initialMood === 'string') setMood(options.initialMood);
    else {
      // Приветствие: один раз за сессию страницы
      let greeted = false;
      try {
        greeted = root.sessionStorage?.getItem('dsh-pet-cactus:greeted') === '1';
        if (!greeted) root.sessionStorage?.setItem('dsh-pet-cactus:greeted', '1');
      } catch {
        greeted = false;
      }
      if (!greeted) {
        win.setTimeout(() => {
          if (!destroyed) showBubble('Привет. Я тут живу.', 5000);
        }, 900);
      }
    }

    scheduleSpeech();
    sleepTimer = win.setInterval(checkSleep, 15_000);
    if (options.poll !== false) {
      pollTimer = win.setInterval(poll, 3000);
      win.setTimeout(poll, 800);
      void loadConfig();
    }

    /** Полное снятие: слушатели, таймеры, DOM */
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of listeners.splice(0)) off();
      for (const timer of [bubbleTimer, speechTimer, sleepTimer, pollTimer]) {
        if (timer !== 0) {
          win.clearTimeout(timer);
          win.clearInterval(timer);
        }
      }
      mountEl.remove();
    }

    return {
      destroy,
      setMood,
      speak,
      setConfig(patch) {
        config = normalizeConfig({ ...config, ...patch });
        applyLook();
        initialPlace();
        scheduleSpeech();
      },
      element: pet,
      config: () => ({ ...config }),
    };
  }

  root.CactusPet = { create, DEFAULTS, STYLE_ID, STORAGE_KEY };
})(typeof globalThis !== 'undefined' ? globalThis : this);
