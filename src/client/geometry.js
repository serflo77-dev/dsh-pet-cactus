/**
 * Геометрия кактуса: чистые функции без DOM и таймеров.
 *
 * Живут отдельным файлом, чтобы их можно было проверить в `node --test`
 * без браузера, и чтобы сборка client.js просто склеивала порядок файлов.
 *
 * @module dsh-pet-cactus/client/geometry
 */

(function (root) {
  'use strict';

  /** Минимальный отступ от края окна, px */
  const EDGE = 8;

  /**
   * Ограничить число диапазоном.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Вписать позицию в окно с учётом размера питомца.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @param {number} [edge]
   * @returns {{ x: number, y: number }}
   */
  function clampPosition(x, y, width, height, viewportWidth, viewportHeight, edge) {
    const margin = typeof edge === 'number' ? edge : EDGE;
    return {
      x: clamp(x, margin, Math.max(margin, viewportWidth - width - margin)),
      y: clamp(y, margin, Math.max(margin, viewportHeight - height - margin)),
    };
  }

  /**
   * Позиция для угла по умолчанию.
   * @param {'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'} corner
   * @param {number} width
   * @param {number} height
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @param {number} marginX
   * @param {number} marginY
   * @returns {{ x: number, y: number }}
   */
  function cornerPosition(corner, width, height, viewportWidth, viewportHeight, marginX, marginY) {
    const right = viewportWidth - width - marginX;
    const bottom = viewportHeight - height - marginY;
    switch (corner) {
      case 'top-left':
        return { x: marginX, y: marginY };
      case 'top-right':
        return { x: right, y: marginY };
      case 'bottom-left':
        return { x: marginX, y: bottom };
      default:
        return { x: right, y: bottom };
    }
  }

  /**
   * Разобрать сохранённую позицию; мусор → null (питомец встанет в угол).
   * @param {unknown} raw
   * @returns {{ x: number, y: number } | null}
   */
  function parseStored(raw) {
    if (typeof raw !== 'string' || raw === '') return null;
    try {
      const value = JSON.parse(raw);
      if (value === null || typeof value !== 'object') return null;
      const x = Number(value.x);
      const y = Number(value.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch {
      return null;
    }
  }

  /**
   * Прямоугольник пузыря над питомцем, прижатый к окну.
   * @param {number} petX
   * @param {number} petY
   * @param {number} petWidth
   * @param {number} bubbleWidth
   * @param {number} bubbleHeight
   * @param {number} viewportWidth
   * @returns {{ left: number, top: number, above: boolean, arrowX: number }}
   */
  function bubbleBox(petX, petY, petWidth, bubbleWidth, bubbleHeight, viewportWidth) {
    const center = petX + petWidth / 2;
    const left = clamp(center - bubbleWidth / 2, EDGE, Math.max(EDGE, viewportWidth - bubbleWidth - EDGE));
    const above = petY - bubbleHeight - 12 >= EDGE;
    const top = above ? petY - bubbleHeight - 12 : petY + 16;
    return { left, top, above, arrowX: clamp(center - left, 18, bubbleWidth - 18) };
  }

  root.CactusGeometry = {
    EDGE,
    clamp,
    clampPosition,
    cornerPosition,
    parseStored,
    bubbleBox,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
