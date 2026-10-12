// Turns (template page + invoice data) into draw ops in PDF points (top-left origin).
// Ops: {t:'rect',x,y,w,h} white-out | {t:'text',x,y,w,size,text,bold,align} | {t:'image',x,y,w,h,src}
import { formatINR, amountInWords, STATES } from './gst.js';

export function fieldValue(type, rect, inv, calc) {
  const f = inv.fields || {};
  switch (type) {
    case 'subtotal': return formatINR(calc.subtotal);
    case 'cgst': return calc.interState ? formatINR(0) : formatINR(calc.cgst);
    case 'sgst': return calc.interState ? formatINR(0) : formatINR(calc.sgst);
    case 'igst': return calc.interState ? formatINR(calc.igst) : formatINR(0);
    case 'total': return formatINR(calc.total);
    case 'amount_words': return amountInWords(calc.total);
    case 'place_of_supply': return inv.posState ? `${STATES[inv.posState] || ''} (${inv.posState})` : '';
    case 'date': case 'due_date': return fmtDate(f[type]);
    case 'custom': return f['custom_' + rect.id] ?? rect.text ?? '';
    default: return f[type] ?? '';
  }
}
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

export function wrap(text, maxW, size, measure, bold) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word;
      if (measure(t, size, bold) <= maxW || !line) line = t; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
export function ellipsize(text, maxW, size, measure, bold) {
  text = String(text ?? '');
  if (measure(text, size, bold) <= maxW) return text;
  while (text.length > 1 && measure(text + '…', size, bold) > maxW) text = text.slice(0, -1);
  return text + '…';
}

export const COLS = [
  ['#', 0.05, 'left'], ['Description', 0.35, 'left'], ['HSN/SAC', 0.12, 'left'], ['Qty', 0.08, 'right'],
  ['Rate', 0.13, 'right'], ['GST%', 0.08, 'right'], ['Amount', 0.19, 'right'],
];

/** page: {width,height} in pt; rects use fractions 0..1 */
export function layoutPage(page, rects, inv, calc, measure, logoSrc) {
  const ops = [];
  for (const r of rects) {
    const x = r.x * page.width, y = r.y * page.height, w = r.w * page.width, h = r.h * page.height;
    if (r.cover !== false) ops.push({ t: 'rect', x, y, w, h });
    const size = Number(r.fontSize) || 10, bold = !!r.bold, align = r.align || 'left', pad = 2;
    if (r.type === 'logo') { if (logoSrc) ops.push({ t: 'image', x, y, w, h, src: logoSrc }); continue; }
    if (r.type === 'line_items') {
      const lh = size * 1.45; let cy = y + pad;
      const cell = (row, b) => {
        let cx = x;
        COLS.forEach(([, frac, al], i) => {
          const cw = w * frac;
          ops.push({ t: 'text', x: cx + pad, y: cy, w: cw - 2 * pad, size, bold: b, align: al, text: ellipsize(row[i], cw - 2 * pad, size, measure, b) });
          cx += cw;
        });
        cy += lh;
      };
      if (r.header !== false) cell(COLS.map((c) => c[0]), true);
      calc.lines.forEach((l, i) => {
        if (cy + lh > y + h + 0.5) return;
        cell([String(i + 1), l.description || '', l.hsn || '', String(l.qty), formatINR(l.rate, { symbol: false }), String(l.gstRate), formatINR(l.taxable, { symbol: false })], false);
      });
      continue;
    }
    const val = fieldValue(r.type, r, inv, calc);
    if (!val) continue;
    const lines = wrap(val, w - 2 * pad, size, measure, bold);
    const lh = size * 1.25;
    const multi = lines.length > 1;
    let cy = multi ? y + pad : y + Math.max(pad, (h - lh) / 2);
    for (const ln of lines) {
      if (cy + size > y + h + size * 0.3 && cy > y + pad) break;
      ops.push({ t: 'text', x: x + pad, y: cy, w: w - 2 * pad, size, bold, align, text: ln });
      cy += lh;
    }
  }
  return ops;
}
