import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../extension/lib/gst.js';

test('amount in words: paise, zero, singles, teens, tens', () => {
  assert.equal(G.amountInWords(0), 'Rupees Zero Only');
  assert.equal(G.amountInWords(0.5), 'Rupees Zero and Fifty Paise Only');
  assert.equal(G.amountInWords(0.07), 'Rupees Zero and Seven Paise Only');
  assert.equal(G.amountInWords(1.01), 'Rupees One and One Paise Only');
  assert.equal(G.amountInWords(19.99), 'Rupees Nineteen and Ninety Nine Paise Only');
  assert.equal(G.amountInWords(0.29), 'Rupees Zero and Twenty Nine Paise Only'); // FP: 0.29*100 = 28.999…
  assert.equal(G.amountInWords(1.005), 'Rupees One and One Paise Only'); // rounds half up to 1.01
  assert.equal(G.amountInWords(2.999), 'Rupees Three Only');
  assert.equal(G.amountInWords(-250.5), 'Rupees Two Hundred Fifty and Fifty Paise Only');
  assert.equal(G.amountInWords('1180'), 'Rupees One Thousand One Hundred Eighty Only');
  assert.equal(G.amountInWords(undefined), 'Rupees Zero Only');
});
test('number to Indian words: hundreds, thousands, lakhs, crores', () => {
  const W = G.numberToIndianWords;
  assert.equal(W(100), 'One Hundred'); assert.equal(W(101), 'One Hundred One'); assert.equal(W(110), 'One Hundred Ten');
  assert.equal(W(999), 'Nine Hundred Ninety Nine'); assert.equal(W(1000), 'One Thousand'); assert.equal(W(20000), 'Twenty Thousand');
  assert.equal(W(99999), 'Ninety Nine Thousand Nine Hundred Ninety Nine');
  assert.equal(W(100000), 'One Lakh'); assert.equal(W(1000001), 'Ten Lakh One');
  assert.equal(W(12345678), 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight');
  assert.equal(W(1000000000), 'One Hundred Crore');
  assert.equal(W(1234567890123), 'One Lakh Twenty Three Thousand Four Hundred Fifty Six Crore Seventy Eight Lakh Ninety Thousand One Hundred Twenty Three');
  assert.equal(W(-45.9), 'Forty Five');
});
test('en-IN formatting: grouping, negatives, symbol, rounding', () => {
  const F = G.formatINR;
  assert.equal(F(0), '₹0.00'); assert.equal(F(5), '₹5.00'); assert.equal(F(999.999), '₹1,000.00');
  assert.equal(F(1234567.891), '₹12,34,567.89'); assert.equal(F(100000), '₹1,00,000.00'); assert.equal(F(10000000), '₹1,00,00,000.00');
  assert.equal(F(-1500.5), '-₹1,500.50'); assert.equal(F(-0.004), '₹0.00');
  assert.equal(F(98765.4, { symbol: false }), '98,765.40'); assert.equal(F('abc'), '₹0.00'); assert.equal(F(null), '₹0.00');
});
test('GSTIN: whitespace/lowercase, empty, every state code accepted, stateFromGSTIN', () => {
  assert.deepEqual(G.validateGSTIN(''), { valid: false, error: 'empty' });
  assert.deepEqual(G.validateGSTIN(null), { valid: false, error: 'empty' });
  assert.equal(G.validateGSTIN('  27aapfu0939f1zv  ').valid, true);
  assert.match(G.validateGSTIN('27AAPFU0939F0ZV').error, /format/); // entity digit 0 not allowed
  assert.match(G.validateGSTIN('27AAPFU0939F1XV').error, /format/); // 14th must be Z
  for (const sc of Object.keys(G.STATES)) {
    const base = sc + 'ABCDE1234F1Z', g = base + G.gstinCheckChar(base), r = G.validateGSTIN(g);
    assert.equal(r.valid, true, g); assert.equal(r.stateCode, sc); assert.equal(G.stateFromGSTIN(g), sc);
  }
  assert.match(G.validateGSTIN('25ABCDE1234F1Z5').error, /state/); // 25 merged into 26
  assert.equal(G.stateFromGSTIN('99XXXX'), null); assert.equal(G.stateFromGSTIN(undefined), null);
  assert.equal(G.gstinCheckChar('27AAPFU0939F1#'), null);
  // every single-character corruption of a valid GSTIN's check digit is detected
  const ok = '27AAPFU0939F1ZV';
  for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (ch !== 'V') assert.equal(G.validateGSTIN(ok.slice(0, 14) + ch).valid, false);
});
test('CGST/SGST vs IGST: missing state, mixed rates, zero rate, totals reconcile', () => {
  const items = [{ qty: 3, rate: 333.33, gstRate: 18 }, { qty: 1, rate: 1000, gstRate: 5 }, { qty: 2, rate: 50, gstRate: 0 }, { qty: 1, rate: 99.99, gstRate: 28 }];
  const intra = G.computeInvoice(items, '29', '29'), inter = G.computeInvoice(items, '29', '27');
  assert.equal(intra.interState, false); assert.equal(inter.interState, true);
  assert.equal(intra.subtotal, 2199.98); assert.equal(inter.subtotal, 2199.98);
  assert.deepEqual(intra.lines.map((l) => l.cgst), [90, 25, 0, 14]); assert.deepEqual(intra.lines.map((l) => l.sgst), [90, 25, 0, 14]);
  assert.deepEqual(inter.lines.map((l) => l.igst), [180, 50, 0, 28]);
  assert.equal(intra.cgst + intra.sgst, 258); assert.equal(inter.igst, 258);
  const tiny = [{ qty: 1, rate: 0.05, gstRate: 18 }]; // per-line half-rounding: CGST/SGST 0.0045 -> 0, IGST 0.009 -> 0.01
  assert.equal(G.computeInvoice(tiny, '33', '33').cgst, 0); assert.equal(G.computeInvoice(tiny, '33', '27').igst, 0.01);
  assert.equal(intra.total, G.round2(intra.subtotal + intra.cgst + intra.sgst)); assert.equal(inter.total, 2457.98);
  assert.equal(intra.igst, 0); assert.equal(inter.cgst + inter.sgst, 0);
  assert.equal(G.computeInvoice(items, '29', '').interState, false); // unknown POS defaults to intra
  assert.equal(G.computeInvoice(items, '', '27').interState, false);
  for (const l of intra.lines) assert.equal(l.total, G.round2(l.taxable + l.cgst + l.sgst));
});
test('line totals: string/invalid inputs, fractional qty, rounding, empty', () => {
  const r = G.computeInvoice([{ qty: '2.5', rate: '199.99', gstRate: '12' }, { qty: 'x', rate: 100, gstRate: 18 }, { rate: 10 }], '33', '33');
  assert.deepEqual(r.lines.map((l) => l.taxable), [499.98, 0, 0]); // 2.5*199.99 = 499.975 -> 499.98
  assert.equal(r.lines[0].cgst, 30); assert.equal(r.lines[0].qty, 2.5); assert.equal(r.lines[0].gstRate, 12);
  assert.deepEqual(G.computeInvoice([], '33', '33'), { interState: false, lines: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0, total: 0 });
  assert.equal(G.computeInvoice(null, '33', '27').total, 0);
  const keep = G.computeInvoice([{ description: 'D', hsn: '9983', qty: 1, rate: 1 }], '33', '33').lines[0];
  assert.equal(keep.description, 'D'); assert.equal(keep.hsn, '9983');
});
test('round to rupee: up, down, exact, negative round-off', () => {
  const up = G.computeInvoice([{ qty: 1, rate: 100.5, gstRate: 0 }], '33', '33', { roundToRupee: true });
  assert.deepEqual([up.total, up.roundOff], [101, 0.5]);
  const dn = G.computeInvoice([{ qty: 1, rate: 100.49, gstRate: 0 }], '33', '33', { roundToRupee: true });
  assert.deepEqual([dn.total, dn.roundOff], [100, -0.49]);
  const ex = G.computeInvoice([{ qty: 1, rate: 100, gstRate: 18 }], '33', '27', { roundToRupee: true });
  assert.deepEqual([ex.total, ex.roundOff], [118, 0]);
  assert.equal(G.computeInvoice([{ qty: 1, rate: 100.5, gstRate: 0 }], '33', '33').roundOff, 0);
});
test('round2: integers, negatives, tiny values, large values', () => {
  assert.equal(G.round2(0), 0); assert.equal(G.round2(5), 5); assert.equal(G.round2(-2.675), -2.68);
  assert.equal(G.round2(0.004), 0); assert.equal(G.round2(0.005), 0.01); assert.equal(G.round2(123456789.125), 123456789.13);
  assert.equal(G.round2(1.0049999), 1);
});
test('financial year: boundaries, string input, century', () => {
  assert.equal(G.financialYear(new Date(2026, 2, 31, 23, 59)), '2025-26');
  assert.equal(G.financialYear(new Date(2026, 3, 1, 0, 0)), '2026-27');
  assert.equal(G.financialYear(new Date(2099, 11, 31)), '2099-00');
  assert.equal(G.financialYear(new Date(2000, 0, 15)), '1999-00');
  assert.equal(G.financialYear(new Date(2026, 6, 1).getTime()), '2026-27');
});
test('FY invoice numbering: April rollover resets, March continues, tokens', () => {
  const p = 'INV/{FY}/{SEQ:4}';
  let r = G.nextInvoiceNumber(p, new Date(2027, 2, 30), { fy: '2026-27', last: 41 });
  assert.equal(r.number, 'INV/2026-27/0042'); assert.deepEqual(r.counter, { fy: '2026-27', last: 42 });
  r = G.nextInvoiceNumber(p, new Date(2027, 2, 31, 23, 59), r.counter); assert.equal(r.number, 'INV/2026-27/0043');
  r = G.nextInvoiceNumber(p, new Date(2027, 3, 1), r.counter); assert.equal(r.number, 'INV/2027-28/0001'); assert.deepEqual(r.counter, { fy: '2027-28', last: 1 });
  r = G.nextInvoiceNumber('A/{FYS}/{SEQ:3}', new Date(2027, 3, 1), { fy: '2026-27', last: 9 }); assert.equal(r.number, 'A/2728/001');
  r = G.nextInvoiceNumber('{YYYY}-{SEQ}', new Date(2027, 3, 1), { fy: '2026-27', last: 9 }); assert.equal(r.number, '2027-0010'); // no FY token -> keeps counting
  assert.equal(G.formatInvoiceNumber('{YY}{MM}-{SEQ:2}-{FY}-{FYS}', new Date(2026, 0, 5), 7), '2601-07-2025-26-2526');
  assert.equal(G.formatInvoiceNumber('{SEQ:6}/{SEQ:1}', new Date(2026, 5, 1), 12345), '012345/12345');
  assert.equal(G.formatInvoiceNumber('X', new Date(2026, 5, 1), 3), 'X');
  assert.equal(G.formatInvoiceNumber('{MM}', '2026-12-15T10:00:00', 1), '12');
  assert.equal(G.nextInvoiceNumber(p, new Date(2026, 9, 1), undefined).number, 'INV/2026-27/0001');
});
