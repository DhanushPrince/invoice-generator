#!/usr/bin/env python3
"""Generates varied invoice templates + logos for the multi-template e2e (reportlab, python-docx, Pillow).
Writes tests/fixtures/templates/*.{pdf,docx,png,jpg} and specs.json (field rects in pt, top-left origin)."""
import json, os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, letter, landscape
from reportlab.lib.colors import HexColor, white
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'templates')
os.makedirs(OUT, exist_ok=True)
specs = {}

def pdf_template(name, size, accent, title, fields, extra=None, band=True):
    W, H = size
    c = canvas.Canvas(os.path.join(OUT, name + '.pdf'), pagesize=size, invariant=1)
    c.setTitle(title)
    acc = HexColor(accent)
    if band:
        c.setFillColor(acc); c.rect(0, H - 22, W, 22, fill=1, stroke=0)
    if extra: extra(c, W, H, acc)
    c.setFillColor(HexColor('#111111'))
    for f, x, y, w, h, label, sample in fields:
        if label:
            c.setFont('Helvetica-Bold', 7.5); c.setFillColor(acc); c.drawString(x, H - y + 2, label); c.setFillColor(HexColor('#111111'))
        if f == 'line_items':
            c.setFillColor(HexColor('#eeeeee')); c.rect(x, H - y - 14, w, 14, fill=1, stroke=0); c.setFillColor(HexColor('#111111'))
            c.setFont('Helvetica-Bold', 8); c.drawString(x + 4, H - y - 10, 'Sl  Description                      HSN      Qty     Rate     Tax     Amount')
            c.setFont('Helvetica', 8); c.drawString(x + 4, H - y - 28, '1   Placeholder item                  0000     1       0.00     0%      0.00')
            c.setStrokeColor(HexColor('#bbbbbb')); c.rect(x, H - y - h, w, h, fill=0, stroke=1)
        elif sample:
            c.setFont('Helvetica', 9); c.drawString(x + 2, H - y - h + 4, sample)
    c.showPage(); c.save()
    specs[name] = {'file': name + '.pdf', 'width': W, 'height': H,
                   'rects': [[f, x, y, w, h] for f, x, y, w, h, *_ in fields]}

L = 'logo'
# 1. Classic GST tax invoice, A4 portrait
def classic_extra(c, W, H, acc):
    c.setFont('Helvetica-Bold', 20); c.setFillColor(acc); c.drawRightString(W - 36, H - 60, 'TAX INVOICE')
    c.setStrokeColor(acc); c.setLineWidth(1.5); c.line(36, H - 96, W - 36, H - 96)
    c.setFont('Helvetica-Oblique', 7); c.setFillColor(HexColor('#666666')); c.drawString(36, 40, 'This is a computer generated invoice. Subject to Chennai jurisdiction.')
    c.drawString(W - 200, 70, 'For seller — Authorised Signatory')
pdf_template('classic-gst-a4', A4, '#1d4ed8', 'Classic GST Tax Invoice', [
    (L, 36, 32, 110, 54, None, None),
    ('seller_name', 36, 110, 270, 18, 'FROM', 'Sample Seller Pvt Ltd'), ('seller_address', 36, 130, 270, 28, None, '1 Old Road, Somewhere'),
    ('seller_gstin', 36, 160, 270, 16, None, 'GSTIN: 00XXXXX0000X0Z0'),
    ('invoice_no', 360, 110, 200, 16, 'INVOICE NO', 'SAMPLE-001'), ('date', 360, 136, 200, 16, 'DATE', '01/01/2000'), ('due_date', 360, 162, 200, 16, 'DUE', '15/01/2000'),
    ('client_name', 36, 200, 270, 18, 'BILL TO', 'Old Client'), ('client_address', 36, 220, 270, 28, None, 'Old address'),
    ('client_gstin', 36, 250, 270, 16, None, 'GSTIN: 00YYYYY0000Y0Z0'), ('place_of_supply', 360, 200, 200, 16, 'PLACE OF SUPPLY', 'Somewhere'),
    ('line_items', 36, 285, 523, 190, None, None),
    ('subtotal', 400, 490, 159, 16, 'SUBTOTAL', '0.00'), ('cgst', 400, 512, 159, 16, 'CGST', '0.00'), ('sgst', 400, 534, 159, 16, 'SGST', '0.00'),
    ('igst', 400, 556, 159, 16, 'IGST', '0.00'), ('total', 400, 582, 159, 20, 'GRAND TOTAL', '0.00'),
    ('amount_words', 36, 620, 523, 28, 'AMOUNT IN WORDS', 'Rupees Zero Only'), ('notes', 36, 668, 523, 30, 'NOTES', 'Old note'),
], classic_extra)

# 2. Minimal service invoice, A4, no colour band
def minimal_extra(c, W, H, acc):
    c.setFont('Helvetica', 26); c.setFillColor(HexColor('#222222')); c.drawString(60, H - 80, 'Invoice')
pdf_template('minimal-service-a4', A4, '#444444', 'Minimal Service Invoice', [
    ('seller_name', 60, 110, 300, 16, None, 'Freelancer Name'), ('seller_gstin', 60, 130, 300, 14, None, 'GSTIN'),
    ('invoice_no', 400, 60, 140, 14, '#', 'S-0'), ('date', 400, 90, 140, 14, 'ISSUED', '01/01/2000'),
    ('client_name', 60, 180, 300, 16, 'BILLED TO', 'Client'), ('client_gstin', 60, 200, 300, 14, None, 'GSTIN'),
    ('place_of_supply', 400, 180, 140, 14, 'SUPPLY STATE', '—'),
    ('line_items', 60, 240, 480, 150, None, None),
    ('cgst', 380, 405, 160, 14, 'CGST', '0'), ('sgst', 380, 425, 160, 14, 'SGST', '0'), ('igst', 380, 445, 160, 14, 'IGST', '0'),
    ('total', 380, 470, 160, 18, 'TOTAL DUE', '0'), ('amount_words', 60, 510, 480, 28, None, 'Rupees Zero Only'),
], minimal_extra, band=False)

# 3. Colourful landscape A4
def land_extra(c, W, H, acc):
    c.setFillColor(HexColor('#fde68a')); c.rect(0, 0, 200, H - 22, fill=1, stroke=0)
    c.setFillColor(HexColor('#be185d')); c.setFont('Helvetica-Bold', 24); c.drawString(230, H - 64, 'INVOICE')
    c.setFillColor(HexColor('#7c3aed')); c.circle(W - 40, 40, 26, fill=1, stroke=0)
LS = landscape(A4)
pdf_template('colour-landscape-a4', LS, '#db2777', 'Colourful Landscape Invoice', [
    (L, 30, 40, 140, 70, None, None),
    ('seller_name', 20, 130, 170, 16, 'FROM', 'Seller'), ('seller_address', 20, 150, 170, 40, None, 'Addr'), ('seller_gstin', 20, 195, 170, 14, None, 'GSTIN'),
    ('client_name', 20, 240, 170, 16, 'TO', 'Client'), ('client_address', 20, 260, 170, 40, None, 'Addr'), ('client_gstin', 20, 305, 170, 14, None, 'GSTIN'),
    ('invoice_no', 470, 50, 160, 16, 'NO', 'X'), ('date', 650, 50, 150, 16, 'DATE', 'X'), ('place_of_supply', 470, 80, 330, 16, 'PLACE OF SUPPLY', 'X'),
    ('line_items', 230, 115, 580, 200, None, None),
    ('subtotal', 620, 330, 190, 16, 'SUBTOTAL', '0'), ('cgst', 620, 350, 190, 16, 'CGST', '0'), ('sgst', 620, 370, 190, 16, 'SGST', '0'),
    ('igst', 620, 390, 190, 16, 'IGST', '0'), ('total', 620, 416, 190, 20, 'TOTAL', '0'),
    ('amount_words', 230, 330, 370, 40, 'IN WORDS', 'Zero'), ('notes', 230, 390, 370, 40, 'NOTES', 'x'),
], land_extra)

# 4. US Letter, modern green
def letter_extra(c, W, H, acc):
    c.setFillColor(acc); c.rect(0, 0, W, 30, fill=1, stroke=0)
    c.setFillColor(white); c.setFont('Helvetica', 8); c.drawString(40, 12, 'Thank you for your business')
    c.setFillColor(acc); c.setFont('Helvetica-Bold', 22); c.drawRightString(W - 40, H - 70, 'BILL OF SUPPLY / INVOICE')
pdf_template('letter-modern', letter, '#047857', 'Letter Modern Invoice', [
    (L, 40, 40, 90, 60, None, None),
    ('seller_name', 40, 115, 260, 16, 'SELLER', 'S'), ('seller_address', 40, 135, 260, 28, None, 'A'), ('seller_gstin', 40, 165, 260, 14, None, 'G'),
    ('invoice_no', 360, 115, 212, 16, 'INVOICE #', 'X'), ('date', 360, 140, 212, 16, 'DATE', 'X'), ('due_date', 360, 165, 212, 16, 'DUE DATE', 'X'),
    ('client_name', 40, 205, 260, 16, 'CUSTOMER', 'C'), ('client_address', 40, 225, 260, 28, None, 'A'), ('client_gstin', 40, 255, 260, 14, None, 'G'),
    ('place_of_supply', 360, 205, 212, 16, 'PLACE OF SUPPLY', 'X'),
    ('line_items', 40, 290, 532, 200, None, None),
    ('subtotal', 400, 505, 172, 16, 'SUBTOTAL', '0'), ('cgst', 400, 525, 172, 16, 'CGST', '0'), ('sgst', 400, 545, 172, 16, 'SGST', '0'),
    ('igst', 400, 565, 172, 16, 'IGST', '0'), ('total', 400, 590, 172, 20, 'TOTAL', '0'),
    ('amount_words', 40, 625, 532, 28, 'AMOUNT IN WORDS', 'Zero'), ('notes', 40, 670, 532, 30, 'TERMS', 'x'),
], letter_extra)

# 5. DOCX tax invoice with table
d = Document()
for s in d.sections: s.top_margin = s.bottom_margin = Cm(2); s.left_margin = s.right_margin = Cm(2)
h = d.add_heading('TAX INVOICE', 0)
d.add_paragraph('Sample Seller Pvt Ltd').runs[0].bold = True
d.add_paragraph('12 Old Street, Chennai 600001')
d.add_paragraph('GSTIN: 33AAAAA0000A1Z5')
t = d.add_table(rows=2, cols=2); t.style = 'Table Grid'
t.cell(0, 0).text = 'Invoice No: SAMPLE-0001'; t.cell(0, 1).text = 'Date: 01/01/2026'
t.cell(1, 0).text = 'Bill To: Old Client Name'; t.cell(1, 1).text = 'Place of supply: Tamil Nadu'
d.add_paragraph('')
it = d.add_table(rows=4, cols=6); it.style = 'Table Grid'
for i, hd in enumerate(['#', 'Description', 'HSN', 'Qty', 'Rate', 'Amount']): it.cell(0, i).text = hd
for r in (1, 2, 3):
    for i, v in enumerate([str(r), 'Old item', '0000', '1', '0.00', '0.00']): it.cell(r, i).text = v
d.add_paragraph('')
tt = d.add_table(rows=4, cols=2); tt.style = 'Table Grid'
for i, (a, b) in enumerate([('Subtotal', '0.00'), ('CGST / IGST', '0.00'), ('SGST', '0.00'), ('Total', '0.00')]):
    tt.cell(i, 0).text = a; tt.cell(i, 1).text = b
d.add_paragraph('Amount in words: Rupees Zero Only')
d.add_paragraph('Terms: Payment due in 15 days.')
d.save(os.path.join(OUT, 'docx-tax-table.docx'))
A4W, A4H = 595.28, 841.89
specs['docx-tax-table'] = {'file': 'docx-tax-table.docx', 'width': A4W, 'height': A4H, 'rects': []}  # rects tuned in e2e

# 6. DOCX simple invoice
d = Document()
p = d.add_paragraph(); r = p.add_run('Invoice'); r.font.size = Pt(28); r.font.color.rgb = RGBColor(0x0e, 0x74, 0x90)
for line in ['From: Old Seller', 'Invoice #: OLD-1', 'Date: 01/01/2026', 'To: Old Client', '', 'Services rendered:', 'Old service line', '', 'Tax: 0.00', 'Total: 0.00', 'In words: Zero', '', 'Thank you!']:
    d.add_paragraph(line)
d.save(os.path.join(OUT, 'docx-simple.docx'))
specs['docx-simple'] = {'file': 'docx-simple.docx', 'width': A4W, 'height': A4H, 'rects': []}

# Logos
im = Image.new('RGBA', (400, 200), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
dr.rounded_rectangle((10, 10, 390, 190), 30, fill=(29, 78, 216, 255)); dr.ellipse((30, 40, 150, 160), fill=(250, 204, 21, 255))
dr.text((175, 80), 'ACME', fill='white', font_size=56) if hasattr(dr, 'text') else None
im.save(os.path.join(OUT, 'logo-acme.png'))
im = Image.new('RGB', (300, 300), (255, 255, 255)); dr = ImageDraw.Draw(im)
dr.ellipse((20, 20, 280, 280), fill=(4, 120, 87)); dr.polygon([(150, 50), (240, 200), (60, 200)], fill=(253, 230, 138))
dr.text((95, 215), 'LEAF', fill='white', font_size=40)
im.save(os.path.join(OUT, 'logo-leaf.jpg'), quality=92)
json.dump(specs, open(os.path.join(OUT, 'specs.json'), 'w'), indent=1)
print('wrote', sorted(os.listdir(OUT)))
