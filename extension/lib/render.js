// Template import: PDF (pdf.js) or DOCX (mammoth -> HTML -> SVG foreignObject -> PNG). Output: page images + sizes in pt.
/* global pdfjsLib, mammoth */
const SCALE = 2; // raster scale vs PDF points (144 dpi)
export async function pdfToPages(buf) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise, pages = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const p = await pdf.getPage(i), vp1 = p.getViewport({ scale: 1 }), vp = p.getViewport({ scale: SCALE });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push({ width: vp1.width, height: vp1.height, img: c.toDataURL('image/png') });
  }
  return pages;
}
const A4 = { w: 595.28, h: 841.89 }, PXW = 794, PXH = 1123; // A4 at 96 dpi
const DOC_CSS = `*{box-sizing:border-box}.pg{width:${PXW}px;padding:72px 76px;font:14.5px/1.35 Calibri,Carlito,Arial,sans-serif;color:#111;background:#fff}
p{margin:0 0 8px}h1{font-size:26px;margin:0 0 10px}h2{font-size:20px;margin:0 0 8px}h3{font-size:17px;margin:0 0 6px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #888;padding:4px 6px;vertical-align:top}td p,th p{margin:0}img{max-width:100%}`;
export async function docxToPages(buf) {
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0';
  host.innerHTML = `<style>${DOC_CSS}</style><div class="pg">${html}</div>`;
  document.body.appendChild(host);
  const total = Math.max(PXH, host.querySelector('.pg').scrollHeight), n = Math.min(10, Math.ceil(total / PXH));
  host.querySelector('.pg').style.minHeight = n * PXH + 'px';
  const xhtml = new XMLSerializer().serializeToString(host.querySelector('.pg'));
  const style = new XMLSerializer().serializeToString(host.querySelector('style'));
  host.remove();
  const pages = [];
  for (let i = 0; i < n; i++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PXW}" height="${PXH}"><foreignObject x="0" y="0" width="${PXW}" height="${PXH}"><div xmlns="http://www.w3.org/1999/xhtml" style="transform:translateY(-${i * PXH}px)">${style}${xhtml}</div></foreignObject></svg>`;
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const s = (A4.w * SCALE) / PXW, c = document.createElement('canvas');
    c.width = Math.round(A4.w * SCALE); c.height = Math.round(A4.h * SCALE);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(s, s); ctx.drawImage(img, 0, 0);
    pages.push({ width: A4.w, height: A4.h, img: c.toDataURL('image/png') });
  }
  return pages;
}
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image failed to load')); i.src = src; });
}
/** Any PNG/JPG/SVG file -> PNG data URL (SVG rasterised at up to 1024px). */
export async function logoToPng(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const w = img.naturalWidth || 512, h = img.naturalHeight || 512, k = Math.min(4, 1024 / Math.max(w, h)) || 1;
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
