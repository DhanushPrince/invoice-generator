// End-to-end: load unpacked extension in Chromium, import PDF + DOCX templates, mark fields, fill, export PDF & DOCX, verify text.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gstinCheckChar } from '../../extension/lib/gst.js';

const root = path.resolve(new URL('../..', import.meta.url).pathname), ext = path.join(root, 'extension');
const fx = (f) => path.join(root, 'tests/fixtures', f), VER = path.join(root, 'verify'), OUT = path.join(root, 'tests/out');
mkdirSync(VER, { recursive: true }); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const g = (b) => b + gstinCheckChar(b);
const SELLER_GSTIN = g('33ABCDE1234F1Z'), CLIENT_GSTIN = g('29AAGCB7383J1Z');
let passed = 0, failed = 0; const results = [];
async function step(name, fn) { try { await fn(); passed++; results.push('ok   ' + name); console.log('ok   ' + name); } catch (e) { failed++; results.push('FAIL ' + name); console.error('FAIL ' + name + '\n', e); throw e; } }

const userDir = mkdtempSync(path.join(tmpdir(), 'itf-'));
const ctx = await chromium.launchPersistentContext(userDir, { headless: false, viewport: { width: 1600, height: 1150 }, acceptDownloads: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const errors = [];
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`chrome-extension://${id}/app.html`);

  const importTpl = async (name, file, shot) => {
    await page.click('button[data-view=templates]');
    await page.fill('#tplName', name); await page.setInputFiles('#tplFile', fx(file)); await page.setInputFiles('#tplLogo', fx('logo.svg'));
    if (shot) await page.screenshot({ path: path.join(VER, '01-upload.png') });
    await page.click('#importBtn'); await page.waitForSelector('#view-editor.active'); await page.waitForFunction(() => document.querySelector('#edImg').complete && document.querySelector('#edImg').naturalWidth > 0);
    await page.$eval('#edZoom', (e) => { e.value = '1'; e.dispatchEvent(new Event('input')); });
  };
  const mark = async (fields) => { // [type, x, y, w, h] in PDF pt (A4)
    const box = await page.locator('#edOverlay').boundingBox(), k = box.width / 595.28;
    for (const [type, x, y, w, h] of fields) {
      await page.selectOption('#edType', type);
      await page.mouse.move(box.x + x * k, box.y + y * k); await page.mouse.down();
      await page.mouse.move(box.x + (x + w / 2) * k, box.y + (y + h / 2) * k); await page.mouse.move(box.x + (x + w) * k, box.y + (y + h) * k); await page.mouse.up();
    }
  };

  await step('import sample PDF template (with SVG logo)', async () => {
    await importTpl('PDF Template', 'sample-invoice.pdf', true);
    assert.equal(await page.locator('#edPageNo').textContent(), '1/1');
  });
  await step('mark fields on PDF template', async () => {
    await mark([['logo', 36, 34, 110, 50], ['seller_name', 38, 106, 280, 18], ['seller_address', 38, 126, 280, 16], ['seller_gstin', 38, 142, 280, 16],
      ['invoice_no', 358, 106, 200, 16], ['date', 358, 125, 200, 16], ['due_date', 358, 141, 200, 16],
      ['client_name', 38, 193, 280, 16], ['client_address', 38, 209, 280, 16], ['client_gstin', 38, 225, 280, 16], ['place_of_supply', 358, 193, 200, 16],
      ['line_items', 42, 252, 512, 200], ['subtotal', 440, 466, 115, 16], ['cgst', 440, 484, 115, 16], ['sgst', 440, 502, 115, 16], ['igst', 440, 520, 115, 16],
      ['total', 440, 542, 115, 20], ['amount_words', 38, 576, 520, 28], ['notes', 38, 616, 520, 30]]);
    assert.equal(await page.locator('#edOverlay .rect').count(), 19);
    await page.fill('#sName', 'Prince Digital Services'); await page.fill('#sAddr', '45 Anna Salai, Chennai, Tamil Nadu 600002');
    await page.fill('#sGstin', SELLER_GSTIN); assert.match(await page.textContent('#sGstinMsg'), /Valid/);
    assert.equal(await page.inputValue('#sState'), '33');
    await page.click('.rect[data-type=line_items]'); await page.screenshot({ path: path.join(VER, '02-mark-editor.png') });
    await page.click('#edSave'); await page.waitForSelector('#view-fill.active');
  });
  await step('fill form: inter-state → IGST, auto number, words', async () => {
    assert.equal(await page.inputValue('#f_invoice_no'), 'INV/2026-27/0001');
    await page.fill('#f_client_name', 'Bengaluru Robotics LLP'); await page.fill('#f_client_address', 'HSR Layout, Bengaluru 560102');
    await page.fill('#f_client_gstin', 'BADGSTIN'); assert.match(await page.textContent('#m_client_gstin'), /15/);
    await page.fill('#f_client_gstin', CLIENT_GSTIN.slice(0, 14) + (CLIENT_GSTIN[14] === 'A' ? 'B' : 'A')); assert.match(await page.textContent('#m_client_gstin'), /Checksum/);
    await page.fill('#f_client_gstin', CLIENT_GSTIN); assert.equal(await page.inputValue('#fPos'), '29');
    const row = (i) => page.locator('#fItems tr').nth(i);
    await row(0).locator('[data-k=description]').fill('Website development'); await row(0).locator('[data-k=hsn]').fill('998314');
    await row(0).locator('[data-k=qty]').fill('1'); await row(0).locator('[data-k=rate]').fill('125000');
    await page.click('#fAddItem'); await row(1).locator('[data-k=description]').fill('Annual hosting'); await row(1).locator('[data-k=hsn]').fill('998315');
    await row(1).locator('[data-k=qty]').fill('2'); await row(1).locator('[data-k=rate]').fill('4999.5'); await row(1).locator('[data-k=gstRate]').selectOption('18');
    await page.fill('#f_notes', 'Payment via UPI or NEFT. Thank you!');
    await page.click('#fSaveClient');
    const tot = await page.textContent('#fTotals');
    assert.match(tot, /IGST₹24,299\.82/); assert.match(tot, /Total₹1,59,298\.82/); // 134999 + 18%
    assert.equal(await page.textContent('#fWords'), 'Rupees One Lakh Fifty Nine Thousand Two Hundred Ninety Eight and Eighty Two Paise Only');
    await page.waitForTimeout(500); await page.screenshot({ path: path.join(VER, '03-form.png') });
  });
  const save = async (btn, name) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(btn)]); const p = path.join(OUT, name); await d.saveAs(p); return p; };
  let pdf1, docx1;
  await step('export PDF and verify text with pdftotext', async () => {
    pdf1 = await save('#fPdf', 'pdf-template.pdf');
    const txt = execFileSync('pdftotext', ['-layout', pdf1, '-'], { encoding: 'utf8' });
    for (const s of ['INV/2026-27/0001', 'Prince Digital Services', 'Bengaluru Robotics LLP', CLIENT_GSTIN, 'Website development', '998314', '1,25,000.00', '₹24,299.82', '₹1,59,298.82', 'Karnataka (29)', 'Rupees One Lakh Fifty Nine Thousand', 'Payment via UPI'])
      assert.ok(txt.includes(s), 'PDF missing: ' + s + '\n' + txt);
    assert.ok(!txt.includes('SAMPLE-0001') && !txt.includes('Old Client Name'), 'sample text should be raster/covered');
    execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdf1, path.join(VER, '04-output-pdf-page')]);
  });
  await step('export DOCX and verify document.xml via unzip', async () => {
    docx1 = await save('#fDocx', 'pdf-template.docx');
    const xml = execFileSync('unzip', ['-p', docx1, 'word/document.xml'], { encoding: 'utf8' });
    for (const s of ['INV/2026-27/0001', 'Bengaluru Robotics LLP', 'Website development', '₹1,59,298.82']) assert.ok(xml.includes(s), 'DOCX missing ' + s);
    assert.ok(execFileSync('unzip', ['-l', docx1], { encoding: 'utf8' }).includes('word/media/bg1.png'));
  });
  await step('import sample DOCX template, mark, intra-state CGST+SGST, export both', async () => {
    await importTpl('DOCX Template', 'sample-invoice.docx');
    await page.screenshot({ path: path.join(VER, '05-docx-template-editor.png') });
    await mark([['seller_name', 50, 50, 300, 22], ['invoice_no', 50, 110, 250, 18], ['client_name', 50, 160, 300, 18],
      ['line_items', 50, 230, 495, 120], ['cgst', 360, 380, 180, 16], ['sgst', 360, 398, 180, 16], ['total', 360, 418, 180, 18], ['amount_words', 50, 450, 495, 30]]);
    await page.fill('#sName', 'Docx Seller Co'); await page.fill('#sGstin', SELLER_GSTIN); await page.fill('#sPattern', 'DX/{FYS}/{SEQ:3}');
    await page.click('#edSave'); await page.waitForSelector('#view-fill.active');
    assert.equal(await page.inputValue('#f_invoice_no'), 'DX/2627/001');
    await page.selectOption('#fClientPick', { label: 'Bengaluru Robotics LLP' });
    await page.fill('#f_client_gstin', g('33ZZZZZ9999Z1Z')); await page.fill('#f_client_name', 'Chennai Local Client');
    const r0 = page.locator('#fItems tr').nth(0);
    await r0.locator('[data-k=description]').fill('Consulting'); await r0.locator('[data-k=qty]').fill('3'); await r0.locator('[data-k=rate]').fill('333.33');
    const tot = await page.textContent('#fTotals'); assert.match(tot, /CGST₹90\.00/); assert.match(tot, /SGST₹90\.00/); assert.match(tot, /Total₹1,179\.99/);
    const p = await save('#fPdf', 'docx-template.pdf'), txt = execFileSync('pdftotext', [p, '-'], { encoding: 'utf8' });
    for (const s of ['DX/2627/001', 'Docx Seller Co', 'Chennai Local Client', 'Consulting', '₹90.00', '₹1,179.99']) assert.ok(txt.includes(s), 'PDF missing ' + s);
    const d = await save('#fDocx', 'docx-template.docx'), xml = execFileSync('unzip', ['-p', d, 'word/document.xml'], { encoding: 'utf8' });
    for (const s of ['DX/2627/001', 'Chennai Local Client', 'Rupees One Thousand One Hundred Seventy Nine and Ninety Nine Paise Only']) assert.ok(xml.includes(s), 'DOCX missing ' + s);
    execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', p, path.join(VER, '06-output-docx-template-pdf')]);
  });
  await step('history: list, re-download, duplicate increments number', async () => {
    await page.click('button[data-view=history]');
    await page.waitForFunction(() => document.querySelectorAll('#hList tr').length === 2 && !document.querySelector('#hList .empty'));
    await page.screenshot({ path: path.join(VER, '07-history.png') });
    const row = page.locator('#hList tr', { hasText: 'INV/2026-27/0001' });
    const [d] = await Promise.all([page.waitForEvent('download'), row.locator('button', { hasText: 'PDF' }).click()]);
    const p = path.join(OUT, 'redownload.pdf'); await d.saveAs(p);
    assert.ok(execFileSync('pdftotext', [p, '-'], { encoding: 'utf8' }).includes('Bengaluru Robotics LLP'));
    await row.locator('button', { hasText: 'Duplicate' }).click(); await page.waitForSelector('#view-fill.active');
    assert.equal(await page.inputValue('#f_invoice_no'), 'INV/2026-27/0002');
    assert.equal(await page.inputValue('#f_client_name'), 'Bengaluru Robotics LLP');
  });
  await step('persistence: templates + clients survive reload', async () => {
    await page.reload(); await page.waitForSelector('.tile');
    assert.equal(await page.locator('.tile').count(), 2);
    await page.click('button[data-view=clients]'); await page.waitForFunction(() => document.querySelector('#cList').textContent.includes('Bengaluru Robotics LLP'), null, { timeout: 5000 });
  });
  await step('no page errors', async () => assert.deepEqual(errors, []));
} finally { await ctx.close(); rmSync(userDir, { recursive: true, force: true }); }
console.log(`\n# e2e pass ${passed} fail ${failed}`); process.exit(failed ? 1 : 0);
