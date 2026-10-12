import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../extension/lib/gst.js';

test('GSTIN: known valid passes', () => {
  assert.equal(G.validateGSTIN('27AAPFU0939F1ZV').valid, true);
  assert.equal(G.validateGSTIN('27aapfu0939f1zv').valid, true);
  assert.equal(G.validateGSTIN('27AAPFU0939F1ZV').stateCode, '27');
});
test('GSTIN: bad checksum fails', () => {
  const r = G.validateGSTIN('27AAPFU0939F1ZA');
  assert.equal(r.valid, false); assert.match(r.error, /Checksum/);
});
test('GSTIN: bad format / length / state', () => {
  assert.match(G.validateGSTIN('27AAPFU0939F1Z').error, /15/);
  assert.match(G.validateGSTIN('2AAAPFU0939F1ZV').error, /format/);
  assert.match(G.validateGSTIN('99AAPFU0939F1ZV').error, /state/i);
});
test('GSTIN: generated check char round-trips', () => {
  for (const base of ['33ABCDE1234F1Z', '29AAGCB7383J1Z', '07AAACR5055K1Z']) {
    assert.equal(G.validateGSTIN(base + G.gstinCheckChar(base)).valid, true);
  }
});
test('round2 handles FP edge cases', () => {
  assert.equal(G.round2(1.005), 1.01);
  assert.equal(G.round2(2.675), 2.68);
  assert.equal(G.round2(0.1 + 0.2), 0.3);
  assert.equal(G.round2(-1.005), -1.01);
});
test('intra-state: CGST+SGST split', () => {
  const r = G.computeInvoice([{ qty: 2, rate: 500, gstRate: 18 }], '33', '33');
  assert.equal(r.interState, false);
  assert.deepEqual([r.subtotal, r.cgst, r.sgst, r.igst, r.total], [1000, 90, 90, 0, 1180]);
});
test('inter-state: IGST only', () => {
  const r = G.computeInvoice([{ qty: 2, rate: 500, gstRate: 18 }, { qty: 1, rate: 99.99, gstRate: 5 }], '33', '29');
  assert.equal(r.interState, true);
  assert.equal(r.igst, 185); // 180 + 4.9995->5.00
  assert.equal(r.cgst, 0); assert.equal(r.total, 1284.99);
});
test('odd paise split per line is consistent', () => {
  const r = G.computeInvoice([{ qty: 1, rate: 10.01, gstRate: 5 }], '27', '27');
  assert.equal(r.cgst, 0.25); assert.equal(r.sgst, 0.25); assert.equal(r.total, 10.51);
});
test('round to rupee', () => {
  const r = G.computeInvoice([{ qty: 1, rate: 10.01, gstRate: 5 }], '27', '27', { roundToRupee: true });
  assert.equal(r.total, 11); assert.equal(r.roundOff, 0.49);
});
test('INR lakh/crore formatting', () => {
  assert.equal(G.formatINR(1234567.5), '₹12,34,567.50');
  assert.equal(G.formatINR(123456789, { symbol: false }), '12,34,56,789.00');
  assert.equal(G.formatINR(-5), '-₹5.00');
});
test('amount in words (Indian system)', () => {
  assert.equal(G.amountInWords(0), 'Rupees Zero Only');
  assert.equal(G.amountInWords(1180), 'Rupees One Thousand One Hundred Eighty Only');
  assert.equal(G.amountInWords(1234567.5), 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only');
  assert.equal(G.amountInWords(105000000.01), 'Rupees Ten Crore Fifty Lakh and One Paise Only');
  assert.equal(G.amountInWords(1000000000), 'Rupees One Hundred Crore Only');
});
test('financial year', () => {
  assert.equal(G.financialYear(new Date(2026, 9, 12)), '2026-27');
  assert.equal(G.financialYear(new Date(2027, 2, 31)), '2026-27');
  assert.equal(G.financialYear(new Date(2027, 3, 1)), '2027-28');
});
test('invoice numbering: FY-aware increment & reset', () => {
  const p = 'INV/{FY}/{SEQ:4}';
  let r = G.nextInvoiceNumber(p, new Date(2026, 9, 12), null);
  assert.equal(r.number, 'INV/2026-27/0001');
  r = G.nextInvoiceNumber(p, new Date(2026, 9, 13), r.counter);
  assert.equal(r.number, 'INV/2026-27/0002');
  r = G.nextInvoiceNumber(p, new Date(2027, 3, 1), r.counter);
  assert.equal(r.number, 'INV/2027-28/0001');
});
test('invoice numbering: non-FY pattern keeps counting', () => {
  let r = G.nextInvoiceNumber('A-{SEQ:3}', new Date(2027, 2, 30), { fy: '2026-27', last: 41 });
  assert.equal(r.number, 'A-042');
  r = G.nextInvoiceNumber('A-{SEQ:3}', new Date(2027, 3, 2), r.counter);
  assert.equal(r.number, 'A-043');
  assert.equal(G.formatInvoiceNumber('{YY}{MM}-{FYS}-{SEQ}', new Date(2026, 0, 5), 7), '2601-2526-0007');
});
