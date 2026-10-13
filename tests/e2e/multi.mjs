// Multi-template feature test: for each fixture template (PDF A4/landscape/letter, DOCX), import with a logo, mark fields,
// fill (intra-state CGST+SGST or inter-state IGST, multiple items), export PDF+DOCX, verify text, screenshot, then check history.
// Screenshots: verify/multi/<template>/{01-editor,02-form,03-output-pdf}.png and verify/multi/final-summary.png
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gstinCheckChar, computeInvoice, formatINR, amountInWords, financialYear, STATES } from '../../extension/lib/gst.js';

const root = path.resolve(new URL('../..', import.meta.url).pathname), ext = path.join(root, 'extension');
const TPL = path.join(root, 'tests/fixtures/templates'), VER = path.join(root, 'verify/multi'), OUT = path.join(root, 'tests/out/multi');
rmSync(VER, { recursive: true, force: true }); mkdirSync(VER, { recursive: true }); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const specs = JSON.parse(readFileSync(path.join(TPL, 'specs.json'), 'utf8'));
const g = (b) => b + gstinCheckChar(b);
const FY = financialYear(new Date()), FYS = FY.slice(2, 4) + FY.slice(5);
const norm = (s) => s.replace(/\s+/g, ' ');
const isoToday = (() => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); })();
const [yy, mm, dd] = isoToday.split('-'), TODAY = `${dd}/${mm}/${yy}`;

// DOCX templates are rasterised via mammoth -> HTML at A4; these rects were tuned against verify/multi/<t>/01-editor.png
const DOCX_RECTS = {
  'docx-tax-table': [['logo', 430, 40, 110, 50], ['seller_name', 54, 74, 300, 18], ['seller_address', 54, 94, 300, 18], ['seller_gstin', 54, 115, 300, 18],
    ['invoice_no', 58, 138, 228, 17], ['date', 292, 138, 244, 17], ['client_name', 58, 160, 228, 17], ['place_of_supply', 292, 160, 244, 17],
    ['line_items', 57, 179, 482, 96], ['subtotal', 386, 279, 152, 17], ['cgst', 386, 301, 152, 17], ['sgst', 386, 322, 152, 17],
    ['total', 386, 344, 152, 17], ['amount_words', 54, 364, 482, 21], ['notes', 54, 387, 482, 18]],
  'docx-simple': [['logo', 440, 40, 100, 60], ['seller_name', 54, 74, 300, 18], ['invoice_no', 54, 94, 300, 18], ['date', 54, 115, 300, 18],
    ['client_name', 54, 135, 300, 18], ['line_items', 54, 176, 482, 104], ['igst', 300, 286, 238, 17], ['total', 300, 306, 238, 18],
    ['amount_words', 54, 330, 482, 22], ['notes', 54, 356, 482, 18]],
};
const SELLERS = {
  '33': ['Prince Digital Services', '45 Anna Salai, Chennai 600002', g('33ABCDE1234F1Z')],
  '29': ['Bengaluru Cloudworks Pvt Ltd', '80 Ft Road, Indiranagar, Bengaluru', g('29AAGCB7383J1Z')],
  '27': ['Mumbai Print House', 'Lower Parel, Mumbai 400013', g('27AAPFU0939F1Z')],
};
const CASES = [
  { t: 'classic-gst-a4', logo: 'logo-acme.png', seller: '33', client: ['Chennai Textiles Co', 'T Nagar, Chennai 600017', g('33AAACT2727Q1Z')], pattern: 'INV/{FY}/{SEQ:4}',
    items: [['Website redesign', '998314', 1, 85000, 18], ['SEO retainer (3 mo)', '998365', 3, 12500.5, 18], ['Domain renewal', '998315', 2, 899, 18]], notes: 'Bank: HDFC 0123 IFSC HDFC0000123' },
  { t: 'minimal-service-a4', logo: 'logo-leaf.jpg', seller: '29', client: ['Pune Analytics LLP', 'Baner, Pune', g('27AAKFP1234L1Z')], pattern: 'MS/{FYS}/{SEQ:3}',
    items: [['Data pipeline build', '998313', 40, 2250, 18], ['Cloud infra (pass-thru)', '998316', 1, 18333.33, 12]] },
  { t: 'colour-landscape-a4', logo: 'logo-leaf.jpg', seller: '27', client: ['Delhi Events Pvt Ltd', 'Saket, New Delhi 110017', g('07AABCD1234E1Z')], pattern: 'CL-{YYYY}-{SEQ:2}', round: true,
    items: [['Event posters A2', '4911', 250, 37.77, 12], ['Banners 6x3 ft', '4911', 12, 1450, 12], ['Design charges', '998391', 1, 15000, 18], ['Courier', '996812', 1, 1200, 18]], notes: 'Rounded to nearest rupee.' },
  { t: 'letter-modern', logo: 'logo-acme.png', seller: '27', client: ['Thane Retail Mart', 'Ghodbunder Rd, Thane 400607', g('27AAECT9876K1Z')], pattern: 'LM/{FY}/{MM}/{SEQ:3}',
    items: [['Printer paper A4 (box)', '4802', 10, 1899, 12], ['Toner cartridge', '8443', 3, 4750, 18], ['Stapler heavy duty', '8472', 5, 349.9, 18]], notes: 'Goods once sold will not be taken back.' },
  { t: 'docx-tax-table', logo: 'logo.svg', seller: '29', client: ['Mysuru Silks Emporium', 'Sayyaji Rao Rd, Mysuru', g('29AAFCM4321H1Z')], pattern: 'DT/{FYS}/{SEQ:4}',
    items: [['Mobile app MVP', '998314', 1, 240000, 18], ['UI/UX design', '998391', 60, 1500, 18], ['App store setup', '998319', 1, 4999, 18]], notes: 'Payment within 15 days.' },
  { t: 'docx-simple', logo: 'logo-acme.png', seller: '33', client: ['Kochi Spice Traders', 'Mattancherry, Kochi', g('32AAKCK5555S1Z')], pattern: 'DS-{SEQ:3}',
    items: [['Consulting (hours)', '998311', 12.5, 3200, 18], ['Workshop', '999293', 1, 25000, 18]], notes: 'Thanks for your business!' },
];

let passed = 0, failed = 0; const table = [];
const userDir = mkdtempSync(path.join(tmpdir(), 'itf-multi-'));
const ctx = await chromium.launchPersistentContext(userDir, { headless: false, viewport: { width: 1700, height: 1200 }, acceptDownloads: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const errors = [];
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`chrome-extension://${id}/app.html`);
  const save = async (btn, name) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(btn)]); const p = path.join(OUT, name); await d.saveAs(p); return p; };
  const expectedNos = []; let exported = 0;

  for (const C of CASES) {
    const spec = specs[C.t], dir = path.join(VER, C.t); mkdirSync(dir, { recursive: true });
    const rects = spec.rects.length ? spec.rects : DOCX_RECTS[C.t];
    const row = { template: C.t, kind: spec.file.split('.').pop(), page: `${Math.round(spec.width)}x${Math.round(spec.height)}`, tax: '', items: C.items.length, result: 'FAIL', note: '' };
    try {
      // 1. import
      await page.click('button[data-view=templates]');
      await page.fill('#tplName', C.t); await page.setInputFiles('#tplFile', path.join(TPL, spec.file));
      await page.setInputFiles('#tplLogo', C.logo === 'logo.svg' ? path.join(root, 'tests/fixtures/logo.svg') : path.join(TPL, C.logo));
      await page.click('#importBtn'); await page.waitForSelector('#view-editor.active', { timeout: 20000 });
      await page.waitForFunction(() => document.querySelector('#edImg').complete && document.querySelector('#edImg').naturalWidth > 0);
      const natW = await page.$eval('#edImg', (e) => e.naturalWidth);
      assert.ok(Math.abs(natW / 2 - spec.width) < 2, `page width ${natW / 2} vs ${spec.width}`);
      await page.$eval('#edZoom', (e) => { e.value = '1'; e.dispatchEvent(new Event('input')); });
      // 2. mark
      await page.locator('#edPage').scrollIntoViewIfNeeded();
      const box = await page.locator('#edOverlay').boundingBox(), k = box.width / spec.width;
      for (const [type, x, y, w, h] of rects) {
        await page.selectOption('#edType', type);
        await page.mouse.move(box.x + x * k, box.y + y * k); await page.mouse.down();
        await page.mouse.move(box.x + (x + w / 2) * k, box.y + (y + h / 2) * k); await page.mouse.move(box.x + (x + w) * k, box.y + (y + h) * k); await page.mouse.up();
      }
      assert.equal(await page.locator('#edOverlay .rect').count(), rects.length);
      const [sName, sAddr, sGstin] = SELLERS[C.seller];
      await page.fill('#sName', sName); await page.fill('#sAddr', sAddr); await page.fill('#sGstin', sGstin);
      assert.match(await page.textContent('#sGstinMsg'), /Valid/); assert.equal(await page.inputValue('#sState'), C.seller);
      await page.fill('#sPattern', C.pattern);
      await page.screenshot({ path: path.join(dir, '01-editor.png') });
      await page.click('#edSave'); await page.waitForSelector('#view-fill.active');
      // 3. fill
      const expNo = C.pattern.replace('{FY}', FY).replace('{FYS}', FYS).replace('{YYYY}', yy).replace('{MM}', mm).replace(/\{SEQ:(\d)\}/, (_, n) => '1'.padStart(Number(n), '0'));
      assert.equal(await page.inputValue('#f_invoice_no'), expNo); expectedNos.push(expNo);
      const [cName, cAddr, cGstin] = C.client;
      await page.fill('#f_client_name', cName); await page.fill('#f_client_address', cAddr); await page.fill('#f_client_gstin', cGstin);
      assert.match(await page.textContent('#m_client_gstin'), /Valid/);
      const pos = cGstin.slice(0, 2); assert.equal(await page.inputValue('#fPos'), pos);
      const items = C.items.map(([description, hsn, qty, rate, gstRate]) => ({ description, hsn, qty, rate, gstRate }));
      for (let i = 0; i < items.length; i++) {
        if (i) await page.click('#fAddItem');
        const r = page.locator('#fItems tr').nth(i), it = items[i];
        await r.locator('[data-k=description]').fill(it.description); await r.locator('[data-k=hsn]').fill(it.hsn);
        await r.locator('[data-k=qty]').fill(String(it.qty)); await r.locator('[data-k=rate]').fill(String(it.rate));
        await r.locator('[data-k=gstRate]').selectOption(String(it.gstRate));
      }
      if (C.round) await page.check('#fRound');
      if (C.notes) await page.fill('#f_notes', C.notes);
      const calc = computeInvoice(items, C.seller, pos, { roundToRupee: !!C.round }), inter = C.seller !== pos;
      row.tax = inter ? `IGST ${C.seller}→${pos}` : `CGST+SGST ${C.seller}`;
      const tot = await page.textContent('#fTotals');
      assert.ok(tot.includes('Total' + formatINR(calc.total)), tot);
      if (inter) { assert.ok(tot.includes('IGST' + formatINR(calc.igst))); assert.ok(!tot.includes('CGST')); }
      else { assert.ok(tot.includes('CGST' + formatINR(calc.cgst)) && tot.includes('SGST' + formatINR(calc.sgst))); assert.ok(!tot.includes('IGST')); }
      if (C.round) assert.ok(tot.includes('Round off'));
      const words = amountInWords(calc.total); assert.equal(await page.textContent('#fWords'), words);
      await page.waitForTimeout(600); await page.screenshot({ path: path.join(dir, '02-form.png') });
      // 4. export PDF
      exported++; const pdf = await save('#fPdf', C.t + '.pdf'), txt = norm(execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }));
      const has = (r) => rects.some((x) => x[0] === r);
      const must = [expNo, sName, cName, formatINR(calc.total), ...items.map((i) => i.description), ...calc.lines.map((l) => formatINR(l.taxable, { symbol: false }))];
      if (has('date')) must.push(TODAY);
      if (has('client_gstin')) must.push(cGstin);
      if (has('place_of_supply')) must.push(`${STATES[pos]} (${pos})`);
      if (has('igst') && inter) must.push(formatINR(calc.igst));
      if (has('cgst') && !inter) must.push(formatINR(calc.cgst));
      if (has('subtotal')) must.push(formatINR(calc.subtotal));
      if (has('notes') && C.notes) must.push(C.notes);
      for (const s of must) assert.ok(txt.includes(s), `PDF missing "${s}"\n${txt}`);
      if (has('amount_words')) assert.ok(txt.includes(norm(words)) || words.split(' ').every((w) => txt.includes(w)), 'PDF missing words: ' + words + '\n' + txt);
      execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdf, path.join(dir, '03-output-pdf')]);
      // 5. export DOCX + python-docx
      const docx = await save('#fDocx', C.t + '.docx');
      const dtxt = execFileSync('python3', ['-c', 'import sys,docx; d=docx.Document(sys.argv[1]); print("\\n".join(p.text for p in d.paragraphs)); print("SECTIONS", len(d.sections), round(d.sections[0].page_width.pt), round(d.sections[0].page_height.pt)); print("IMAGES", len(d.inline_shapes), len([r for r in d.part.rels.values() if "image" in r.reltype]))', docx], { encoding: 'utf8' });
      for (const s of [expNo, sName, cName, formatINR(calc.total), ...items.map((i) => i.description)]) assert.ok(dtxt.includes(s), `DOCX missing "${s}"`);
      if (has('amount_words')) assert.ok(norm(dtxt).includes(words), 'DOCX missing words: ' + words + '\n' + dtxt);
      const m = dtxt.match(/SECTIONS (\d+) (\d+) (\d+)/); assert.equal(Number(m[1]), 1);
      assert.ok(Math.abs(Number(m[2]) - spec.width) <= 1 && Math.abs(Number(m[3]) - spec.height) <= 1, 'DOCX page size ' + m[0]);
      assert.match(dtxt, /IMAGES \d+ 1/);
      row.result = 'PASS'; row.note = `${formatINR(calc.total)}`; passed++; console.log('ok   ' + C.t);
    } catch (e) { failed++; row.note = String(e.message).split('\n')[0].slice(0, 120); console.error('FAIL ' + C.t + '\n', e); await page.screenshot({ path: path.join(dir, 'zz-failure.png') }).catch(() => {}); }
    table.push(row);
  }
  // history
  const hrow = { template: 'history', kind: '-', page: '-', tax: '-', items: '-', result: 'FAIL', note: '' };
  try {
    await page.click('button[data-view=history]');
    await page.waitForFunction((n) => document.querySelectorAll('#hList tr').length === n && !document.querySelector('#hList .empty'), exported);
    const ht = await page.textContent('#hList');
    for (const n of expectedNos) assert.ok(ht.includes(n), 'history missing ' + n);
    await page.screenshot({ path: path.join(VER, 'history.png') });
    // re-download from history (oldest) still renders the right content
    const r = page.locator('#hList tr', { hasText: expectedNos[0] });
    const [d] = await Promise.all([page.waitForEvent('download'), r.locator('button', { hasText: 'PDF' }).click()]);
    const p = path.join(OUT, 'history-redownload.pdf'); await d.saveAs(p);
    assert.ok(execFileSync('pdftotext', [p, '-'], { encoding: 'utf8' }).includes(CASES[0].client[0]));
    hrow.result = 'PASS'; hrow.note = `${exported} invoices listed`; console.log('ok   history');
  } catch (e) { failed++; hrow.note = String(e.message).split('\n')[0]; console.error('FAIL history\n', e); }
  table.push(hrow);
  if (errors.length) { failed++; table.push({ template: 'page errors', result: 'FAIL', note: errors.join(' | ').slice(0, 200) }); }
} finally { await ctx.close(); rmSync(userDir, { recursive: true, force: true }); }
// contact sheet
try { execFileSync('python3', [path.join(root, 'scripts/contact-sheet.py'), VER, ...CASES.map((c) => c.t)], { stdio: 'inherit' }); }
catch (e) { failed++; console.error('contact sheet failed', e.message); }
writeFileSync(path.join(VER, 'results.json'), JSON.stringify(table, null, 1));
console.table(table);
console.log(`\n# multi e2e pass ${passed} fail ${failed}`); process.exit(failed ? 1 : 0);
