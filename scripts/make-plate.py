# -*- coding: utf-8 -*-
"""Собрать картинку питомца: вырезать кактус с фона и поставить сверху
плашки в стиле dsh-pet (белая полупрозрачная карточка + хвостик),
шрифт Roboto Bold.

Запуск:
    python scripts/make-plate.py "путь/к/исходнику.jpg"

Результат:
    assets/pet.png        — спрайт с прозрачным фоном
    assets/pet-plate.png  — превью: спрайт + плашки сверху
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(BASE, "assets")
SRC = sys.argv[1] if len(sys.argv) > 1 else None

FONT = os.path.join(
    os.environ["LOCALAPPDATA"], "Microsoft", "Windows", "Fonts", "Roboto-Bold.ttf"
)

INK = (43, 43, 43, 255)          # #2b2b2b — цвет текста dsh-pet
PLATE = (255, 255, 255, 235)     # белая плашка, 92 % как у dsh-pet
BORDER = (43, 43, 43, 26)
CANVAS = (250, 245, 236, 255)    # тёплый светлый фон превью
ACCENT = (76, 175, 80, 255)


def cut_out(src: str) -> Image.Image:
    """Вырезать фон заливкой от углов: остаётся только связанный персонаж."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    probe = im.copy()
    sentinel = (255, 0, 255)
    for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if probe.getpixel(xy) != sentinel:
            ImageDraw.floodfill(probe, xy, sentinel, thresh=28)

    bg = im.getpixel((0, 0))
    src_px = list(im.getdata())
    probe_px = list(probe.getdata())
    values = []
    for sp, op in zip(src_px, probe_px):
        if op == sentinel:
            values.append(0)
            continue
        # мягкая кромка: близкие к фону пиксели получают частичную прозрачность
        d = abs(sp[0] - bg[0]) + abs(sp[1] - bg[1]) + abs(sp[2] - bg[2])
        values.append(max(0, min(255, int(d * 255 / 40))) if d < 40 else 255)
    alpha = Image.new("L", im.size)
    alpha.putdata(values)

    out = im.convert("RGBA")
    out.putalpha(alpha)
    box = out.getbbox()
    return out.crop(box) if box else out


def rounded_plate(draw: ImageDraw.ImageDraw, cx: int, top: int, w: int, h: int,
                  fill=PLATE, radius: int | None = None) -> None:
    r = radius if radius is not None else min(h // 2, 28)
    draw.rounded_rectangle((cx - w // 2, top, cx + w // 2, top + h),
                           radius=r, fill=fill, outline=BORDER, width=2)


def centered_text(draw: ImageDraw.ImageDraw, cx: int, top: int, h: int,
                  text: str, font: ImageFont.FreeTypeFont, fill=INK) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text((cx - tw // 2 - box[0], top + (h - th) // 2 - box[1]), text,
              font=font, fill=fill)


def measure(text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = ImageFont.FreeTypeFont.getbbox(font, text)
    return box[2] - box[0], box[3] - box[1]


def main() -> None:
    if not SRC or not os.path.exists(SRC):
        raise SystemExit("укажи путь к исходной картинке")
    os.makedirs(ASSETS, exist_ok=True)

    art = cut_out(SRC)
    art.thumbnail((860, 860), Image.LANCZOS)
    aw, ah = art.size

    font_name = ImageFont.truetype(FONT, max(34, int(aw * 0.078)))
    font_chip = ImageFont.truetype(FONT, max(18, int(aw * 0.040)))

    name_text, chip_text = "Кактус", "на связи"
    name_w, name_h = measure(name_text, font_name)
    chip_w, chip_h = measure(chip_text, font_chip)

    tail = max(12, int(aw * 0.020))
    plate_w, plate_hh = name_w + int(aw * 0.11), name_h + int(aw * 0.060)
    chip_plate_h = chip_h + int(aw * 0.040)
    chip_plate_w = chip_w + chip_plate_h + int(aw * 0.030)

    pad = int(aw * 0.075)
    canvas_w = max(aw + pad * 2, plate_w + pad * 2)
    canvas_h = pad + plate_hh + tail + int(aw * 0.03) + ah + pad // 2
    canvas = Image.new("RGBA", (canvas_w, canvas_h), CANVAS)
    cx = canvas_w // 2

    # тень под плашкой
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((cx - plate_w // 2, pad + 12, cx + plate_w // 2,
                          pad + plate_hh + 12), radius=26, fill=(0, 0, 0, 55))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))

    d = ImageDraw.Draw(canvas)
    plate_top = pad
    rounded_plate(d, cx, plate_top, plate_w, plate_hh)
    # хвостик вниз
    bottom = plate_top + plate_hh
    d.polygon([(cx - tail, bottom - 2), (cx + tail, bottom - 2),
               (cx, bottom + tail)], fill=PLATE)
    d.line([(cx - tail, bottom - 3), (cx, bottom + tail), (cx + tail, bottom - 3)],
           fill=PLATE, width=4)
    centered_text(d, cx, plate_top, plate_hh, name_text, font_name)

    art_x = cx - aw // 2
    art_y = canvas_h - ah - pad // 2
    canvas.alpha_composite(art, (art_x, art_y))

    # чип-плашка слева под основной
    chip = Image.new("RGBA", (chip_plate_w + 24, chip_plate_h + 24), (0, 0, 0, 0))
    cd = ImageDraw.Draw(chip)
    cd.rounded_rectangle((12, 12, 12 + chip_plate_w, 12 + chip_plate_h),
                         radius=chip_plate_h // 2, fill=(255, 255, 255, 225),
                         outline=BORDER, width=2)
    dot = max(4, chip_plate_h // 6)
    dot_cx = 12 + chip_plate_h // 2
    cd.ellipse((dot_cx - dot, 12 + chip_plate_h // 2 - dot,
                dot_cx + dot, 12 + chip_plate_h // 2 + dot), fill=ACCENT)
    cd.text((dot_cx + dot + 8 - ImageFont.FreeTypeFont.getbbox(font_chip, chip_text)[0],
             12 + (chip_plate_h - chip_h) // 2
             - ImageFont.FreeTypeFont.getbbox(font_chip, chip_text)[1]),
            chip_text, font=font_chip, fill=(96, 96, 96, 255))
    canvas.alpha_composite(chip, (int(cx - plate_w // 2) - 16,
                                  bottom + tail + int(aw * 0.008)))

    art.save(os.path.join(ASSETS, "pet.png"))
    canvas.save(os.path.join(ASSETS, "pet-plate.png"))
    print("pet.png", art.size)
    print("pet-plate.png", canvas.size)


if __name__ == "__main__":
    main()
