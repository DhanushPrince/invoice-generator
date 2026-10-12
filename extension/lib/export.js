// Output: canvas preview, real PDF (pdf-lib + embedded DejaVu Sans for ₹), DOCX (lib/docx.js).
/* global PDFLib, fontkit */
import { layoutPage } from './layout.js';
import { computeInvoice } from './gst.js';
import { loadImg } from './render.js';
import { buildDocx } from './docx.js';

const FAM = 'ITFSans';
let fontsReady;
export function loadFonts() {
  return fontsReady ||= (async () => {
    const [r, b] = await Promise.all(['fonts/DejaVuSans.ttf', 'fonts/DejaVuSans-Bold.ttf'].map((p) => fetch(p).then((x) => x.arrayBuffer())));
    const f1 = new FontFace(FAM, r.slice(0), { weight: '400' }), f2 = new FontFace(FAM, b.slice(0), { weight: '700' });
    await Promise.all([f1.load(), f2.load()]); document.fonts.add(f1); document.fonts.add(f2);
    return { regular: r, bold: b };
  })();
}
const mctx = document.createElement('canvas').getContext('2d');
export const measure = (t, size, bold) => { mctx.font = `${bold ? 700 : 400} ${size}px ${FAM}`; return mctx.measureText(t).width; };

export function calcFor(inv) { return computeInvoice(inv.items, inv.sellerState, inv.posState, { roundToRupee: !!inv.roundToRupee }); }
export function layoutAll(tpl, inv) {
  const calc = calcFor(inv);
  return tpl.pages.map((pg, i) => layoutPage(pg, tpl.rects.filter((r) => (r.page || 0) === i), inv, calc, measure, tpl.logo));
}
const imgCache = new Map();
const img = (src) => { if (!imgCache.has(src)) imgCache.set(src, loadImg(src)); return imgCache.get(src); };

export async function drawPage(canvas, pg, ops, scale, withText = true) {
  await loadFonts();
  canvas.width = Math.round(pg.width * scale); canvas.height = Math.round(pg.height * scale);
  const ctx = canvas.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.width, pg.height);
  ctx.drawImage(await img(pg.img), 0, 0, pg.width, pg.height);
  for (const o of ops) {
    if (o.t === 'rect') { ctx.fillStyle = '#fff'; ctx.fillRect(o.x, o.y, o.w, o.h); }
    else if (o.t === 'image') { const im = await img(o.src); const f = fit(im.naturalWidth, im.naturalHeight, o); ctx.drawImage(im, f.x, f.y, f.w, f.h); }
    else if (o.t === 'text' && withText) {
      ctx.fillStyle = '#111'; ctx.font = `${o.bold ? 700 : 400} ${o.size}px ${FAM}`;
      ctx.fillText(o.text, alignX(o, measure(o.text, o.size, o.bold)), o.y + o.size * 0.8);
    }
  }
  return canvas;
}
const alignX = (o, tw) => o.align === 'right' ? o.x + o.w - tw : o.align === 'center' ? o.x + (o.w - tw) / 2 : o.x;
function fit(iw, ih, o) { const k = Math.min(o.w / iw, o.h / ih), w = iw * k, h = ih * k; return { x: o.x + (o.w - w) / 2, y: o.y + (o.h - h) / 2, w, h }; }
const b64 = (d) => Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0));

export async function buildPdf(tpl, inv) {
  const fonts = await loadFonts(), { PDFDocument, rgb } = PDFLib;
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  doc.setTitle(`Invoice ${inv.fields?.invoice_no || ''}`); doc.setProducer('Invoice Template Filler (on-device)'); doc.setCreator('Invoice Template Filler');
  const fR = await doc.embedFont(fonts.regular, { subset: true }), fB = await doc.embedFont(fonts.bold, { subset: true });
  const all = layoutAll(tpl, inv), embedded = new Map();
  const emb = async (src) => { if (!embedded.has(src)) embedded.set(src, src.startsWith('data:image/png') ? doc.embedPng(b64(src)) : doc.embedJpg(b64(src))); return embedded.get(src); };
  for (let i = 0; i < tpl.pages.length; i++) {
    const pg = tpl.pages[i], page = doc.addPage([pg.width, pg.height]), H = pg.height;
    page.drawImage(await emb(pg.img), { x: 0, y: 0, width: pg.width, height: pg.height });
    for (const o of all[i]) {
      if (o.t === 'rect') page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: rgb(1, 1, 1) });
      else if (o.t === 'image') { const im = await emb(o.src), f = fit(im.width, im.height, o); page.drawImage(im, { x: f.x, y: H - f.y - f.h, width: f.w, height: f.h }); }
      else if (o.t === 'text' && o.text) {
        const font = o.bold ? fB : fR, tw = font.widthOfTextAtSize(o.text, o.size);
        page.drawText(o.text, { x: alignX(o, tw), y: H - o.y - o.size * 0.8, size: o.size, font, color: rgb(0.07, 0.07, 0.07) });
      }
    }
  }
  return doc.save();
}
export async function buildDocxFile(tpl, inv) {
  const all = layoutAll(tpl, inv), pages = [];
  for (let i = 0; i < tpl.pages.length; i++) {
    const c = await drawPage(document.createElement('canvas'), tpl.pages[i], all[i], 2, false);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    pages.push({ width: tpl.pages[i].width, height: tpl.pages[i].height, png: new Uint8Array(await blob.arrayBuffer()), ops: all[i] });
  }
  return buildDocx(pages, `Invoice ${inv.fields?.invoice_no || ''}`);
}
export function download(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
