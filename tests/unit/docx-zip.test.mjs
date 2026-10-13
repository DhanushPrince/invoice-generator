import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, makeZip } from '../../extension/lib/zip.js';
import { buildDocx } from '../../extension/lib/docx.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'itf-unit-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const has = (cmd, args = ['--version']) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; } };
const PY_DOCX = has('python3', ['-c', 'import docx']), UNZIP = has('unzip', ['-v']);
const PNG = readFileSync(new URL('../../extension/icons/icon16.png', import.meta.url));

test('crc32 known vectors', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});
test('makeZip: structure, signatures, offsets, string + binary entries', () => {
  const z = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.bin', data: new Uint8Array([0, 1, 2, 255]) }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const eocd = z.length - 22; assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2);
  const cdOff = dv.getUint32(eocd + 16, true); assert.equal(dv.getUint32(cdOff, true), 0x02014b50);
  assert.equal(dv.getUint32(eocd + 12, true), eocd - cdOff);
  const second = 30 + 5 + 5; assert.equal(dv.getUint32(second, true), 0x04034b50); // 2nd local header right after first entry
  if (UNZIP) {
    const f = path.join(tmp, 't.zip'); writeFileSync(f, z);
    assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);
    assert.equal(execFileSync('unzip', ['-p', f, 'a.txt'], { encoding: 'utf8' }), 'hello');
  }
});
test('makeZip: utf-8 names and empty archive', () => {
  const z = makeZip([]); assert.equal(z.length, 22);
  const u = makeZip([{ name: 'ü.txt', data: '₹' }]); assert.equal(new DataView(u.buffer).getUint16(26, true), 6);
});

const ops = [
  { t: 'rect', x: 0, y: 0, w: 10, h: 10 },
  { t: 'text', x: 50, y: 60, w: 200, size: 10, text: 'INV/2026-27/0001', bold: true, align: 'left' },
  { t: 'text', x: 300, y: 400, w: 150, size: 12, text: '₹1,59,298.82', align: 'right' },
  { t: 'text', x: 100, y: 500, w: 300, size: 9, text: 'A & B <Traders> "Q"', align: 'center' },
  { t: 'text', x: 100, y: 520, w: 300, size: 9, text: '' },
  { t: 'image', x: 0, y: 0, w: 5, h: 5, src: 'x' },
];
const unzipText = (buf, name) => { const f = path.join(tmp, Math.random().toString(36).slice(2) + '.docx'); writeFileSync(f, buf); return execFileSync('unzip', ['-p', f, name], { encoding: 'utf8' }); };

test('buildDocx: parts, escaping, frames in twips, alignment, page size', { skip: !UNZIP && 'unzip missing' }, () => {
  const d = buildDocx([{ width: 595.28, height: 841.89, png: PNG, ops }], 'Invoice <1>');
  const xml = unzipText(d, 'word/document.xml');
  assert.ok(xml.includes('A &amp; B &lt;Traders&gt; "Q"')); assert.ok(xml.includes('₹1,59,298.82'));
  assert.ok(xml.includes('w:x="1000" w:y="1200"')); assert.ok(xml.includes('w:w="4000"'));
  assert.ok(xml.includes('<w:jc w:val="right"/>') && xml.includes('<w:jc w:val="center"/>') && xml.includes('<w:jc w:val="left"/>'));
  assert.equal((xml.match(/<w:b\/>/g) || []).length, 1); assert.ok(xml.includes('<w:sz w:val="24"/>'));
  assert.equal((xml.match(/w:framePr/g) || []).length, 3, 'empty text skipped');
  assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>')); assert.ok(xml.includes('behindDoc="1"'));
  assert.ok(unzipText(d, 'docProps/core.xml').includes('<dc:title>Invoice &lt;1&gt;</dc:title>'));
  assert.ok(unzipText(d, '\\[Content_Types\\].xml').includes('Extension="png"'));
  assert.ok(unzipText(d, 'word/_rels/document.xml.rels').includes('Target="media/bg1.png"'));
});
test('buildDocx: multi-page gets section breaks and one image per page', { skip: !UNZIP && 'unzip missing' }, () => {
  const d = buildDocx([{ width: 612, height: 792, png: PNG, ops: [] }, { width: 842, height: 595, png: PNG, ops }]);
  const xml = unzipText(d, 'word/document.xml');
  assert.equal((xml.match(/<w:sectPr>/g) || []).length, 2);
  assert.ok(xml.includes('w:w="12240" w:h="15840"') && xml.includes('w:w="16840" w:h="11900"'));
  assert.ok(xml.includes('r:embed="rIdImg2"'));
  const f = path.join(tmp, 'mp.docx'); writeFileSync(f, d);
  const list = execFileSync('unzip', ['-l', f], { encoding: 'utf8' }); assert.ok(list.includes('word/media/bg1.png') && list.includes('word/media/bg2.png'));
});
test('buildDocx: control characters are stripped so XML stays valid', { skip: !UNZIP && 'unzip missing' }, () => {
  const d = buildDocx([{ width: 100, height: 100, png: PNG, ops: [{ t: 'text', x: 0, y: 0, w: 50, size: 10, text: 'Bad\u0001\u000bchars\u001f ok' }] }], 'T\u0002');
  const xml = unzipText(d, 'word/document.xml');
  assert.ok(xml.includes('Badchars ok')); assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml));
});
test('buildDocx output opens in python-docx with text and page size', { skip: !PY_DOCX && 'python-docx missing' }, () => {
  const f = path.join(tmp, 'v.docx'); writeFileSync(f, buildDocx([{ width: 595.28, height: 841.89, png: PNG, ops }], 'Invoice'));
  const out = execFileSync('python3', ['-c', 'import sys,docx; d=docx.Document(sys.argv[1]); print("|".join(p.text for p in d.paragraphs if p.text)); s=d.sections[-1]; print(round(s.page_width.pt), round(s.page_height.pt)); print(d.core_properties.title)', f], { encoding: 'utf8' });
  assert.equal(out.trim().split('\n')[0], 'INV/2026-27/0001|₹1,59,298.82|A & B <Traders> "Q"');
  assert.match(out, /\n595 842\n/); assert.match(out, /Invoice\s*$/);
});
