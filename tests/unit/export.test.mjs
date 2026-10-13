// export.js runs in the extension page; here the browser globals it touches are stubbed so the real
// pdf-lib + fontkit pipeline (buildPdf) runs in Node and the produced PDF is checked with pdftotext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as PDFLib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const ext = new URL('../../extension/', import.meta.url);
globalThis.PDFLib = PDFLib; globalThis.fontkit = fontkit;
globalThis.FontFace = class { constructor(f, b, d) { Object.assign(this, { f, b, d }); } load() { return Promise.resolve(this); } };
const fontsAdded = [];
globalThis.document = { fonts: { add: (f) => fontsAdded.push(f) }, createElement: () => ({ getContext: () => ({ font: '', measureText(t) { return { width: t.length * parseFloat(this.font.split(' ')[1]) * 0.5 }; } }) }) };
globalThis.fetch = async (p) => { const b = readFileSync(new URL(p, ext)); return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
const E = await import('../../extension/lib/export.js');
const tmp = mkdtempSync(path.join(tmpdir(), 'itf-exp-')); process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const png = 'data:image/png;base64,' + readFileSync(new URL('icons/icon128.png', ext)).toString('base64');
const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const tpl = { pages: [{ width: 595.28, height: 841.89, img: png }, { width: 842, height: 595, img: png }], logo: png, rects: [
  { type: 'logo', page: 0, x: 0.05, y: 0.03, w: 0.2, h: 0.06 },
  { type: 'invoice_no', page: 0, x: 0.6, y: 0.1, w: 0.35, h: 0.02, bold: true },
  { type: 'client_name', page: 0, x: 0.05, y: 0.2, w: 0.5, h: 0.02, align: 'center' },
  { type: 'line_items', page: 0, x: 0.05, y: 0.3, w: 0.9, h: 0.2, fontSize: 9 },
  { type: 'total', page: 0, x: 0.6, y: 0.55, w: 0.35, h: 0.025, align: 'right', bold: true },
  { type: 'amount_words', page: 1, x: 0.05, y: 0.1, w: 0.9, h: 0.05, cover: false },
] };
const inv = { fields: { invoice_no: 'INV/2026-27/0007', client_name: 'Bengaluru Robotics LLP' }, sellerState: '33', posState: '29', roundToRupee: true,
  items: [{ description: 'Website development', hsn: '998314', qty: 1, rate: 125000, gstRate: 18 }, { description: 'Annual hosting', hsn: '998315', qty: 2, rate: 4999.5, gstRate: 18 }] };

test('loadFonts registers both weights once and caches', async () => {
  const a = await E.loadFonts(), b = await E.loadFonts();
  assert.equal(a, b); assert.ok(a.regular.byteLength > 100000 && a.bold.byteLength > 100000); assert.equal(fontsAdded.length, 2);
});
test('measure uses font size and weight', () => { assert.equal(E.measure('abcd', 10, false), 20); assert.equal(E.measure('', 12, true), 0); });
test('calcFor honours states and round-to-rupee', () => {
  const c = E.calcFor(inv); assert.equal(c.interState, true); assert.equal(c.total, 159299); assert.equal(c.roundOff, 0.18);
  assert.equal(E.calcFor({ ...inv, posState: '33', roundToRupee: false }).cgst, 12149.91);
});
test('layoutAll splits rects per page', () => {
  const all = E.layoutAll(tpl, inv); assert.equal(all.length, 2);
  assert.ok(all[0].some((o) => o.t === 'image')); assert.ok(all[0].some((o) => o.text === '₹1,59,299.00'));
  assert.ok(all[1].every((o) => o.t === 'text')); assert.match(all[1].map((o) => o.text).join(' '), /Rupees One Lakh Fifty Nine Thousand Two Hundred Ninety Nine Only/);
});
test('buildPdf: real PDF with page sizes, metadata, embedded fonts and selectable ₹ text', async () => {
  const bytes = await E.buildPdf(tpl, inv);
  const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(doc.getPageCount(), 2); assert.deepEqual(doc.getPage(1).getSize(), { width: 842, height: 595 });
  assert.equal(doc.getTitle(), 'Invoice INV/2026-27/0007'); assert.match(doc.getProducer(), /Invoice Template Filler/);
  if (!hasPdftotext) return;
  const f = path.join(tmp, 'o.pdf'); writeFileSync(f, bytes);
  const t = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  for (const s of ['INV/2026-27/0007', 'Bengaluru Robotics LLP', 'Website development', '1,25,000.00', '₹1,59,299.00', 'Rupees One Lakh']) assert.ok(t.includes(s), s + '\n' + t);
  assert.match(execFileSync('pdffonts', [f], { encoding: 'utf8' }), /DejaVuSans-Bold/);
});
test('buildPdf: JPEG backgrounds/logos and template without fields', async () => {
  const jpg = 'data:image/jpeg;base64,' + readFileSync(new URL('../fixtures/templates/logo-leaf.jpg', import.meta.url)).toString('base64');
  const bytes = await E.buildPdf({ pages: [{ width: 300, height: 300, img: jpg }], rects: [{ type: 'logo', x: 0, y: 0, w: 0.5, h: 0.5 }], logo: jpg }, { fields: {}, items: [] });
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
});
