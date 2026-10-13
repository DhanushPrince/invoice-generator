import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldValue, fmtDate, wrap, ellipsize, COLS, layoutPage } from '../../extension/lib/layout.js';
import { FIELD_TYPES, FIELD, MULTILINE } from '../../extension/lib/fields.js';
import { computeInvoice } from '../../extension/lib/gst.js';
import { APP_NAME, APP_VERSION } from '../../extension/lib/config.js';

const measure = (t, size, bold) => String(t).length * size * (bold ? 0.6 : 0.5); // deterministic fake font
const inv = { fields: { seller_name: 'Prince Digital', invoice_no: 'INV/2026-27/0001', date: '2026-10-13', due_date: '2026-10-28', notes: 'Line one\nLine two', custom_c1: 'PO-77' },
  items: [{ description: 'Website', hsn: '998314', qty: 1, rate: 125000, gstRate: 18 }, { description: 'Hosting', hsn: '998315', qty: 2, rate: 4999.5, gstRate: 18 }], sellerState: '33', posState: '29' };
const calc = computeInvoice(inv.items, inv.sellerState, inv.posState);
const intra = computeInvoice(inv.items, '33', '33');

test('config exposes product name/version', () => { assert.equal(APP_NAME, 'Invoice Template Filler'); assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/); });
test('field catalogue: unique ids, groups, multiline set', () => {
  assert.equal(new Set(FIELD_TYPES.map((f) => f.id)).size, FIELD_TYPES.length);
  for (const f of FIELD_TYPES) { assert.ok(f.label && f.group); assert.equal(FIELD[f.id], f); }
  for (const id of ['subtotal', 'cgst', 'sgst', 'igst', 'total', 'amount_words', 'line_items', 'logo', 'place_of_supply']) assert.ok(FIELD[id], id);
  for (const m of MULTILINE) assert.ok(FIELD[m], m);
  assert.equal(MULTILINE.has('seller_name'), false);
});
test('fieldValue: calc fields, inter vs intra tax mapping', () => {
  assert.equal(fieldValue('subtotal', {}, inv, calc), '₹1,34,999.00');
  assert.equal(fieldValue('igst', {}, inv, calc), '₹24,299.82'); assert.equal(fieldValue('cgst', {}, inv, calc), '₹0.00'); assert.equal(fieldValue('sgst', {}, inv, calc), '₹0.00');
  assert.equal(fieldValue('cgst', {}, inv, intra), '₹12,149.91'); assert.equal(fieldValue('sgst', {}, inv, intra), '₹12,149.91'); assert.equal(fieldValue('igst', {}, inv, intra), '₹0.00');
  assert.equal(fieldValue('total', {}, inv, calc), '₹1,59,298.82');
  assert.equal(fieldValue('amount_words', {}, inv, calc), 'Rupees One Lakh Fifty Nine Thousand Two Hundred Ninety Eight and Eighty Two Paise Only');
});
test('fieldValue: text, dates, place of supply, custom, missing', () => {
  assert.equal(fieldValue('seller_name', {}, inv, calc), 'Prince Digital');
  assert.equal(fieldValue('date', {}, inv, calc), '13/10/2026'); assert.equal(fieldValue('due_date', {}, inv, calc), '28/10/2026');
  assert.equal(fieldValue('place_of_supply', {}, inv, calc), 'Karnataka (29)');
  assert.equal(fieldValue('place_of_supply', {}, { ...inv, posState: '' }, calc), '');
  assert.equal(fieldValue('place_of_supply', {}, { ...inv, posState: '00' }, calc), ' (00)');
  assert.equal(fieldValue('custom', { id: 'c1', text: 'default' }, inv, calc), 'PO-77');
  assert.equal(fieldValue('custom', { id: 'c2', text: 'default' }, inv, calc), 'default');
  assert.equal(fieldValue('custom', { id: 'c3' }, inv, calc), '');
  assert.equal(fieldValue('client_gstin', {}, inv, calc), '');
  assert.equal(fieldValue('client_name', {}, {}, calc), '');
});
test('fmtDate', () => {
  assert.equal(fmtDate('2027-04-01'), '01/04/2027'); assert.equal(fmtDate(''), ''); assert.equal(fmtDate(null), ''); assert.equal(fmtDate('tomorrow'), 'tomorrow');
});
test('wrap: word wrap, explicit newlines, long word kept', () => {
  assert.deepEqual(wrap('aaa bbb ccc', 35, 10, measure), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrap('one\ntwo three', 1000, 10, measure), ['one', 'two three']);
  assert.deepEqual(wrap('supercalifragilistic x', 20, 10, measure), ['supercalifragilistic', 'x']);
  assert.deepEqual(wrap('', 100, 10, measure), ['']);
  assert.deepEqual(wrap('  a   b  ', 100, 10, measure), ['a b']);
});
test('ellipsize: fits, truncates, null', () => {
  assert.equal(ellipsize('short', 100, 10, measure), 'short');
  const e = ellipsize('A very long description', 50, 10, measure);
  assert.ok(e.endsWith('…')); assert.ok(measure(e, 10) <= 50); assert.equal(e, 'A very lo…');
  assert.equal(ellipsize(null, 50, 10, measure), ''); assert.equal(ellipsize('abc', 0, 10, measure), 'a…');
});
test('COLS fractions sum to 1', () => { assert.equal(Math.round(COLS.reduce((s, c) => s + c[1], 0) * 1000) / 1000, 1); assert.equal(COLS.length, 7); });

const page = { width: 600, height: 800 };
test('layoutPage: rect fraction -> pt, cover, align, vertical centring', () => {
  const ops = layoutPage(page, [{ type: 'total', x: 0.5, y: 0.5, w: 0.25, h: 0.025, fontSize: 10, bold: true, align: 'right' }], inv, calc, measure);
  assert.deepEqual(ops[0], { t: 'rect', x: 300, y: 400, w: 150, h: 20 });
  assert.equal(ops[1].t, 'text'); assert.equal(ops[1].text, '₹1,59,298.82'); assert.equal(ops[1].align, 'right'); assert.equal(ops[1].bold, true);
  assert.equal(ops[1].x, 302); assert.equal(ops[1].w, 146); assert.equal(ops[1].y, 400 + (20 - 12.5) / 2);
});
test('layoutPage: cover=false, empty value, default font size', () => {
  const ops = layoutPage(page, [{ type: 'client_gstin', x: 0, y: 0, w: 0.5, h: 0.02, cover: false }, { type: 'seller_name', x: 0, y: 0.1, w: 0.5, h: 0.02, cover: false }], inv, calc, measure);
  assert.equal(ops.length, 1); assert.equal(ops[0].text, 'Prince Digital'); assert.equal(ops[0].size, 10); assert.equal(ops[0].align, 'left');
});
test('layoutPage: multiline wraps and clips to box', () => {
  const ops = layoutPage(page, [{ type: 'notes', x: 0, y: 0, w: 0.5, h: 0.05, fontSize: 10 }], inv, calc, measure);
  assert.deepEqual(ops.filter((o) => o.t === 'text').map((o) => o.text), ['Line one', 'Line two']);
  const clipped = layoutPage(page, [{ type: 'amount_words', x: 0, y: 0, w: 0.2, h: 0.02, fontSize: 10 }], inv, calc, measure).filter((o) => o.t === 'text');
  assert.ok(clipped.length >= 1 && clipped.length <= 2, 'clipped to the box height');
});
test('layoutPage: logo with and without image', () => {
  const r = [{ type: 'logo', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }];
  assert.deepEqual(layoutPage(page, r, inv, calc, measure, 'data:image/png;base64,AA').map((o) => o.t), ['rect', 'image']);
  assert.deepEqual(layoutPage(page, r, inv, calc, measure, null).map((o) => o.t), ['rect']);
});
test('layoutPage: line items table header + rows, formatting, overflow rows dropped', () => {
  const r = { type: 'line_items', x: 0, y: 0, w: 1, h: 0.1, fontSize: 9 };
  const ops = layoutPage(page, [r], inv, calc, measure).filter((o) => o.t === 'text');
  assert.equal(ops.length, 7 * 3);
  assert.deepEqual(ops.slice(0, 7).map((o) => o.text), COLS.map((c) => c[0])); assert.ok(ops.slice(0, 7).every((o) => o.bold));
  assert.deepEqual(ops.slice(7, 14).map((o) => o.text), ['1', 'Website', '998314', '1', '1,25,000.00', '18', '1,25,000.00']);
  assert.deepEqual(ops.slice(14).map((o) => o.text), ['2', 'Hosting', '998315', '2', '4,999.50', '18', '9,999.00']);
  assert.equal(ops[13].align, 'right'); assert.equal(ops[8].align, 'left');
  const noHead = layoutPage(page, [{ ...r, header: false }], inv, calc, measure).filter((o) => o.t === 'text');
  assert.equal(noHead.length, 14); assert.equal(noHead[0].text, '1');
  const tiny = layoutPage(page, [{ ...r, h: 0.04 }], inv, calc, measure).filter((o) => o.t === 'text');
  assert.equal(tiny.length, 7 * 2, 'only rows that fit are drawn');
  const many = computeInvoice(Array.from({ length: 30 }, (_, i) => ({ description: 'Item ' + i, qty: 1, rate: 10, gstRate: 18 })), '33', '33');
  const opsMany = layoutPage(page, [{ ...r, h: 0.2 }], inv, many, measure).filter((o) => o.t === 'text');
  assert.ok(opsMany.length < 31 * 7 && opsMany.length % 7 === 0);
});
test('layoutPage: long description ellipsized within column', () => {
  const c = computeInvoice([{ description: 'An extremely long line item description that cannot fit', qty: 1, rate: 1, gstRate: 0 }], '33', '33');
  const ops = layoutPage(page, [{ type: 'line_items', x: 0, y: 0, w: 0.5, h: 0.1, fontSize: 9 }], inv, c, measure).filter((o) => o.t === 'text');
  const d = ops[8]; assert.ok(d.text.endsWith('…')); assert.ok(measure(d.text, 9) <= d.w);
});
