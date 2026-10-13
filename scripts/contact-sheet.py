#!/usr/bin/env python3
"""Builds verify/multi/final-summary.png: a grid of each template's rendered output page (Pillow)."""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
ver, names = sys.argv[1], sys.argv[2:]
TW, TH, PAD, LAB = 520, 560, 24, 34
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
except OSError: font = ImageFont.load_default()
cols = 3; rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (TW + PAD) + PAD, rows * (TH + LAB + PAD) + PAD + 50), (236, 239, 244))
d = ImageDraw.Draw(sheet); d.text((PAD, 14), 'Invoice Template Filler — multi-template e2e outputs', fill=(17, 24, 39), font=font)
for i, n in enumerate(names):
    x, y = PAD + (i % cols) * (TW + PAD), 50 + PAD + (i // cols) * (TH + LAB + PAD)
    p = os.path.join(ver, n, '03-output-pdf.png')
    d.text((x, y), n, fill=(17, 24, 39), font=font)
    if os.path.exists(p):
        im = Image.open(p).convert('RGB'); im.thumbnail((TW, TH))
        sheet.paste(im, (x + (TW - im.width) // 2, y + LAB)); d.rectangle((x + (TW - im.width) // 2 - 1, y + LAB - 1, x + (TW + im.width) // 2, y + LAB + im.height), outline=(156, 163, 175))
    else:
        d.text((x + 20, y + LAB + 40), 'NO OUTPUT (failed)', fill=(200, 0, 0), font=font)
out = os.path.join(ver, 'final-summary.png'); sheet.save(out); print('wrote', out)
