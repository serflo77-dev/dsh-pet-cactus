"""
Иконка плагина из настоящего спрайта.

DSH берёт иконку из `package.json` → `icon` (относительный путь внутри пакета),
форматы: SVG, PNG, JPEG, WebP, не больше 256 КиБ; файл возвращается как data-URI.
Правило DSH: путь относительный и не выходит за каталог манифеста.

Скрипт вписывает в квадрат весь кактус целиком — с цветами, лицом и дном горшка:
иконка в списке плагинов должна совпадать с питомцем в углу, а не с прежней
векторной схемой. Ничего не срезаем: 480×690 вписывается в 1:1 по высоте.

Требует Pillow. Запуск из корня пакета:
    python scripts/make-icon.py            # только assets/icon.webp
    python scripts/make-icon.py --check    # ещё полоса размеров для глазной проверки
"""

import sys

from PIL import Image

SRC = "assets/pet.webp"
OUT_ICON = "assets/icon.webp"
OUT_STRIP = "assets/icon-sizes.png"

SIZE = 512
PAD = 0.02  # поля вокруг спрайта, доля длинной стороны
STRIP_SIZES = (128, 64, 40, 24)


def square_icon(sprite):
    """Весь спрайт по центру прозрачного квадрата — без обрезки краёв."""
    side = int(max(sprite.size) * (1 + PAD * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(sprite, ((side - sprite.width) // 2, (side - sprite.height) // 2), sprite)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def size_strip(icon):
    """Иконка в тех размерах, в каких её видно в списке плагинов."""
    pad, gap = 12, 16
    width = pad * 2 + sum(STRIP_SIZES) + gap * (len(STRIP_SIZES) - 1)
    strip = Image.new("RGBA", (width, STRIP_SIZES[0] + pad * 2), (32, 32, 34, 255))
    x = pad
    for size in STRIP_SIZES:
        thumb = icon.resize((size, size), Image.LANCZOS)
        strip.paste(thumb, (x, (strip.height - size) // 2), thumb)
        x += size + gap
    strip.save(OUT_STRIP, "PNG", optimize=True)
    return OUT_STRIP


def main(argv):
    sprite = Image.open(SRC).convert("RGBA")
    icon = square_icon(sprite)
    icon.save(OUT_ICON, "WEBP", quality=92, method=6)

    written = [OUT_ICON]
    if "--check" in argv:
        written.append(size_strip(icon))
    for path in written:
        with open(path, "rb") as handle:
            print(f"{path}: {len(handle.read())} байт")


if __name__ == "__main__":
    main(sys.argv[1:])
