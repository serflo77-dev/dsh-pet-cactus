/**
 * Реплики на события агента: что кактус говорит, пока идёт работа.
 *
 * Текст — часть продукта, поэтому он лежит отдельно от маршрутов и не собирается
 * из кусков на лету: каждая фраза написана целиком, без подстановки имён файлов
 * (пути бывают длинными и ломают пузырь).
 *
 * @module dsh-pet-cactus/tool-lines
 */

/** Фразы по имени инструмента (все варианты равноправны) */
export const TOOL_LINES = Object.freeze({
  read: ['Читаю файл', 'Смотрю, что внутри', 'Листаю строчки'],
  write: ['Пишу файл', 'Создаю новый файл'],
  edit: ['Правлю пару строк', 'Вношу правку'],
  pwsh: ['Стучу по терминалу', 'Запускаю команду'],
  grep: ['Роюсь в тексте', 'Ищу по содержимому'],
  glob: ['Обхожу папки', 'Ищу нужные файлы'],
  web_search: ['Спрашиваю интернет', 'Ищу в сети'],
  web_fetch: ['Открываю страницу', 'Тяну страницу из сети'],
  subagent: ['Зову помощника', 'Делегирую задачку'],
  subagent_fork: ['Зову помощника', 'Делегирую задачку'],
  todo_write: ['Раскладываю задачи', 'Пишу в список дел'],
  skill: ['Загружаю навык', 'Читаю инструкцию'],
  present: ['Показываю результат'],
  ask_user_question: ['Спрашиваю тебя'],
  job_output: ['Жду фоновую задачу', 'Заглядываю в фоновую задачу'],
  job_list: ['Проверяю фоновые задачи'],
  captain_status: ['Смотрю, как дела у команды'],
  captain_plan: ['Собираю план команды'],
});

/** Общая фраза, когда инструмент незнакомый */
export const TOOL_FALLBACK = Object.freeze(['Работаю', 'Что-то делаю', 'Копаюсь потихоньку']);

/** Префиксы инструментов, у которых нет отдельной реплики */
const TOOL_PREFIXES = Object.freeze([
  ['vision_', ['Смотрю на картинку', 'Разглядываю изображение']],
  ['captain_', ['Командую командой']],
  ['office_', ['Вожусь с документом']],
  ['forge_', ['Кую навык']],
  ['playbook_', ['Сверяюсь с плейбуком']],
]);

/**
 * Выбрать фразу из списка.
 * @param {readonly string[]} lines
 * @param {() => number} [random] - источник случайности (подменяется в тестах)
 * @returns {string}
 */
export function pickLine(lines, random = Math.random) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
  return lines[index] ?? lines[0];
}

/**
 * Реплика для вызова инструмента.
 * @param {unknown} name - имя инструмента из `tool/call`
 * @param {() => number} [random]
 * @returns {string}
 */
export function describeTool(name, random = Math.random) {
  const tool = typeof name === 'string' ? name : '';
  if (tool === '') return pickLine(TOOL_FALLBACK, random);
  const exact = TOOL_LINES[tool];
  if (exact !== undefined) return pickLine(exact, random);
  for (const [prefix, lines] of TOOL_PREFIXES) {
    if (tool.startsWith(prefix)) return pickLine(lines, random);
  }
  return pickLine(TOOL_FALLBACK, random);
}

/**
 * Реплика на завершение хода.
 * @param {unknown} kind - `turn/end.reason.kind`
 * @param {() => number} [random]
 * @returns {{ mood: 'success' | 'error' | 'waiting' | 'idle', text: string }}
 */
export function describeTurnEnd(kind, random = Math.random) {
  if (kind === 'completed') {
    return { mood: 'success', text: pickLine(['Готово', 'Сделал', 'Всё, отпускаю'], random) };
  }
  if (kind === 'error' || kind === 'max-tokens') {
    return { mood: 'error', text: pickLine(['Ой. Не вышло', 'Что-то сломалось', 'Не дожал'], random) };
  }
  if (kind === 'blocked') {
    return { mood: 'waiting', text: pickLine(['Нужно твоё решение', 'Жду подтверждения'], random) };
  }
  return { mood: 'idle', text: '' };
}
