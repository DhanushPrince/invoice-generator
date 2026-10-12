import { APP_NAME } from './lib/config.js';
import { STATES, validateGSTIN, stateFromGSTIN, nextInvoiceNumber, formatINR, amountInWords } from './lib/gst.js';
import { FIELD_TYPES, FIELD, MULTILINE } from './lib/fields.js';
import * as db from './lib/db.js';
import { pdfToPages, docxToPages, logoToPng } from './lib/render.js';
import { drawPage, layoutAll, calcFor, buildPdf, buildDocxFile, download, loadFonts } from './lib/export.js';

const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v == null) continue; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else k === 'class' ? (e.className = v) : e.setAttribute(k, v); kids.flat().forEach((c) => e.append(c)); return e; };
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + Number(n || 0)); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const safe = (s) => String(s || 'invoice').replace(/[^\w.-]+/g, '_');

document.title = APP_NAME; $('#appName').textContent = APP_NAME;
const stateOpts = '<option value="">— state —</option>' + Object.entries(STATES).map(([c, n]) => `<option value="${c}">${c} · ${n}</option>`).join('');
$$('.stateSel').forEach((s) => (s.innerHTML = stateOpts));
$('#edType').innerHTML = FIELD_TYPES.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');

// ---------- navigation ----------
function show(v) { $$('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v)); $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v)); onShow[v]?.(); }
$$('.nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
const onShow = { templates: renderTemplates, history: renderHistory, clients: renderClients, fill: () => refreshTplSelect(), editor: () => ed.tpl || toast('Pick a template to edit first') };

// ---------- templates ----------
async function renderTemplates() {
  const list = (await db.all('templates')).sort((a, b) => b.createdAt - a.createdAt), el = $('#tplList'); el.innerHTML = '';
  if (!list.length) el.append(h('div', { class: 'empty' }, 'No templates yet — import your first invoice above.'));
  for (const t of list) el.append(h('div', { class: 'tile' }, h('img', { src: t.pages[0].img, alt: '' }), h('div', {},
    h('b', {}, t.name), h('span', { class: 'muted' }, `${t.kind.toUpperCase()} · ${t.pages.length} page(s) · ${t.rects.length} fields`),
    h('div', { class: 'acts' }, h('button', { class: 'small primary', onclick: () => startInvoice(t.id) }, 'Use'), h('button', { class: 'small', onclick: () => openEditor(t.id) }, 'Edit fields'),
      h('button', { class: 'small danger', onclick: async () => { if (confirm(`Delete template "${t.name}"?`)) { await db.del('templates', t.id); renderTemplates(); } } }, 'Delete')))));
}
$('#importBtn').addEventListener('click', async () => {
  const f = $('#tplFile').files[0]; if (!f) return toast('Choose a PDF or DOCX first');
  $('#importStatus').textContent = 'Rendering…';
  try {
    const buf = await f.arrayBuffer(), isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    if (!isPdf && !/\.docx$/i.test(f.name)) throw new Error('Only .pdf and .docx are supported');
    const pages = isPdf ? await pdfToPages(buf) : await docxToPages(buf);
    const logo = $('#tplLogo').files[0] ? await logoToPng($('#tplLogo').files[0]) : null;
    const t = { id: db.uid(), name: $('#tplName').value.trim() || f.name.replace(/\.\w+$/, ''), kind: isPdf ? 'pdf' : 'docx', pages, rects: [], logo,
      seller: { name: '', address: '', gstin: '', state: '' }, pattern: 'INV/{FY}/{SEQ:4}', counter: null, gstRate: 18, dueDays: 15, createdAt: Date.now() };
    await db.put('templates', t); $('#importStatus').textContent = ''; $('#tplFile').value = ''; $('#tplLogo').value = ''; $('#tplName').value = '';
    openEditor(t.id);
  } catch (e) { console.error(e); $('#importStatus').textContent = 'Import failed: ' + e.message; }
});

// ---------- mark editor ----------
const ed = { tpl: null, page: 0, sel: null, zoom: 1.2 };
async function openEditor(id) {
  ed.tpl = await db.get('templates', id); ed.page = 0; ed.sel = null;
  const s = ed.tpl.seller; $('#sName').value = s.name; $('#sAddr').value = s.address; $('#sGstin').value = s.gstin; $('#sState').value = s.state;
  $('#sPattern').value = ed.tpl.pattern; $('#sGst').value = String(ed.tpl.gstRate); $('#sDue').value = ed.tpl.dueDays; $('#edTitle').textContent = 'Mark fields · ' + ed.tpl.name;
  show('editor'); drawEditor();
}
function drawEditor() {
  const t = ed.tpl; if (!t) return; const pg = t.pages[ed.page], pe = $('#edPage');
  pe.style.width = pg.width * ed.zoom + 'px'; pe.style.height = pg.height * ed.zoom + 'px'; $('#edImg').src = pg.img;
  $('#edPageNo').textContent = `${ed.page + 1}/${t.pages.length}`; $('#edCount').textContent = t.rects.length;
  const ov = $('#edOverlay'); ov.innerHTML = '';
  for (const r of t.rects.filter((r) => (r.page || 0) === ed.page)) {
    const d = h('div', { class: 'rect' + (ed.sel === r.id ? ' sel' : ''), 'data-id': r.id, 'data-type': r.type }, h('span', {}, FIELD[r.type].label));
    Object.assign(d.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    d.addEventListener('mousedown', (e) => { e.stopPropagation(); ed.sel = r.id; startMove(e, r); drawEditor(); });
    ov.append(d);
  }
  const list = $('#edRects'); list.innerHTML = '';
  if (!t.rects.length) list.append(h('p', { class: 'muted' }, 'No fields yet. Pick a field type and drag on the page.'));
  t.rects.forEach((r) => {
    const typeSel = h('select', { onchange: (e) => { r.type = e.target.value; drawEditor(); } }, FIELD_TYPES.map((f) => { const o = h('option', { value: f.id }, f.label); if (f.id === r.type) o.selected = true; return o; }));
    const cover = h('input', { type: 'checkbox', onchange: (e) => (r.cover = e.target.checked) }); cover.checked = r.cover !== false;
    const bold = h('input', { type: 'checkbox', onchange: (e) => (r.bold = e.target.checked) }); bold.checked = !!r.bold;
    const fs = h('input', { type: 'number', min: 5, max: 48, step: 0.5, value: r.fontSize || 10, onchange: (e) => (r.fontSize = Number(e.target.value)) });
    const al = h('select', { onchange: (e) => (r.align = e.target.value) }, ['left', 'center', 'right'].map((a) => { const o = h('option', { value: a }, a); if ((r.align || 'left') === a) o.selected = true; return o; }));
    const kids = [h('div', { class: 'row' }, h('b', {}, `p${(r.page || 0) + 1}`), typeSel, h('button', { class: 'small danger', title: 'Delete', onclick: () => { t.rects = t.rects.filter((x) => x !== r); drawEditor(); } }, '✕')),
      h('div', { class: 'row' }, h('label', { class: 'inline' }, cover, 'cover'), h('label', { class: 'inline' }, bold, 'bold'), 'size', fs, al)];
    if (r.type === 'custom') kids.push(h('input', { placeholder: 'Default text / label', value: r.text || '', oninput: (e) => (r.text = e.target.value) }));
    list.append(h('div', { class: 'ritem' + (ed.sel === r.id ? ' sel' : ''), onclick: () => { if (ed.sel !== r.id) { ed.sel = r.id; if ((r.page || 0) !== ed.page) ed.page = r.page || 0; drawEditor(); } } }, kids));
  });
}
function rel(e) { const b = $('#edOverlay').getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; }
$('#edOverlay').addEventListener('mousedown', (e) => {
  if (!ed.tpl || e.button !== 0) return; const p0 = rel(e), draft = h('div', { class: 'rect draft' }); $('#edOverlay').append(draft);
  const mv = (ev) => { const p = rel(ev); Object.assign(draft.style, { left: Math.min(p0.x, p.x) * 100 + '%', top: Math.min(p0.y, p.y) * 100 + '%', width: Math.abs(p.x - p0.x) * 100 + '%', height: Math.abs(p.y - p0.y) * 100 + '%' }); };
  const up = (ev) => {
    removeEventListener('mousemove', mv); removeEventListener('mouseup', up); draft.remove();
    const p = rel(ev), w = Math.abs(p.x - p0.x), hh = Math.abs(p.y - p0.y);
    if (w * ed.tpl.pages[ed.page].width < 6 || hh * ed.tpl.pages[ed.page].height < 4) { ed.sel = null; return drawEditor(); }
    const type = $('#edType').value, pgH = ed.tpl.pages[ed.page].height;
    const r = { id: db.uid(), page: ed.page, x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w, h: hh, type, cover: true,
      fontSize: type === 'line_items' ? 9 : Math.max(7, Math.min(14, Math.round(hh * pgH * 0.55 * 2) / 2)), bold: type === 'total' || type === 'invoice_no',
      align: ['subtotal', 'cgst', 'sgst', 'igst', 'total'].includes(type) ? 'right' : 'left' };
    if (MULTILINE.has(type) || type.endsWith('address')) r.fontSize = Math.min(r.fontSize, 10);
    ed.tpl.rects.push(r); ed.sel = r.id;
    const i = FIELD_TYPES.findIndex((f) => f.id === type); // advance to next unused type for speed
    const next = FIELD_TYPES.slice(i + 1).find((f) => !ed.tpl.rects.some((x) => x.type === f.id)); if (next) $('#edType').value = next.id;
    drawEditor();
  };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
});
function startMove(e, r) {
  const p0 = rel(e), o = { x: r.x, y: r.y };
  const mv = (ev) => { const p = rel(ev); r.x = Math.min(1 - r.w, Math.max(0, o.x + p.x - p0.x)); r.y = Math.min(1 - r.h, Math.max(0, o.y + p.y - p0.y)); const d = $(`.rect[data-id="${r.id}"]`); if (d) { d.style.left = r.x * 100 + '%'; d.style.top = r.y * 100 + '%'; } };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel && $('#view-editor').classList.contains('active') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { ed.tpl.rects = ed.tpl.rects.filter((r) => r.id !== ed.sel); ed.sel = null; drawEditor(); } });
$('#edPrev').onclick = () => { if (ed.page > 0) { ed.page--; drawEditor(); } };
$('#edNext').onclick = () => { if (ed.tpl && ed.page < ed.tpl.pages.length - 1) { ed.page++; drawEditor(); } };
$('#edZoom').oninput = (e) => { ed.zoom = Number(e.target.value); drawEditor(); };
gstinField($('#sGstin'), $('#sGstinMsg'), (sc) => ($('#sState').value = sc));
$('#sLogo').onchange = async (e) => { if (e.target.files[0] && ed.tpl) { ed.tpl.logo = await logoToPng(e.target.files[0]); toast('Logo updated'); } };
$('#edSave').onclick = async () => {
  const t = ed.tpl; if (!t) return;
  t.seller = { name: $('#sName').value, address: $('#sAddr').value, gstin: $('#sGstin').value.trim().toUpperCase(), state: $('#sState').value };
  t.pattern = $('#sPattern').value.trim() || 'INV/{FY}/{SEQ:4}'; t.gstRate = Number($('#sGst').value); t.dueDays = Number($('#sDue').value) || 0;
  await db.put('templates', t); toast('Template saved'); startInvoice(t.id);
};

// ---------- GSTIN helper ----------
function gstinField(inp, msg, onState) {
  inp.addEventListener('input', () => {
    inp.value = inp.value.toUpperCase(); const v = inp.value.trim();
    if (!v) { inp.className = ''; msg.textContent = ''; msg.className = ''; return; }
    const r = validateGSTIN(v); inp.className = r.valid ? 'good' : 'bad';
    msg.textContent = r.valid ? `✓ Valid · ${STATES[r.stateCode]}` : r.error; msg.className = r.valid ? 'ok' : 'err';
    if (r.valid) onState?.(r.stateCode);
  });
}

// ---------- fill ----------
const fill = { tpl: null, inv: null };
async function refreshTplSelect() {
  const list = await db.all('templates'); const sel = $('#fTpl'), cur = fill.tpl?.id;
  sel.innerHTML = list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('') || '<option value="">(no templates)</option>';
  if (cur) sel.value = cur; else if (list[0]) await startInvoice(list[0].id, null, true);
  refreshClients();
}
$('#fTpl').onchange = (e) => startInvoice(e.target.value);
async function startInvoice(tplId, fromInv = null, noShow = false) {
  const t = await db.get('templates', tplId); if (!t) return; fill.tpl = t;
  const d = today();
  const inv = fromInv ? structuredClone(fromInv) : { fields: {}, items: [{ description: '', hsn: '', qty: 1, rate: 0, gstRate: t.gstRate }] };
  inv.id = null; inv.templateId = t.id; inv.autoNumber = true;
  inv.fields.invoice_no = nextInvoiceNumber(t.pattern, new Date(), t.counter).number; inv.fields.date = d; inv.fields.due_date = addDays(d, t.dueDays);
  if (!fromInv) Object.assign(inv.fields, { seller_name: t.seller.name, seller_address: t.seller.address, seller_gstin: t.seller.gstin }), (inv.sellerState = t.seller.state), (inv.posState = '');
  fill.inv = inv; if (!noShow) show('fill');
  $('#fTpl').value = t.id; bindForm();
}
const TEXT_FIELDS = ['invoice_no', 'date', 'due_date', 'seller_name', 'seller_gstin', 'seller_address', 'client_name', 'client_gstin', 'client_address', 'notes'];
let binding = false;
function bindForm() {
  const { inv, tpl } = fill; binding = true;
  for (const k of TEXT_FIELDS) { const el = $('#f_' + k); el.value = inv.fields[k] || ''; el.dispatchEvent(new Event('input')); }
  binding = false;
  $('#fSellerState').value = inv.sellerState || ''; $('#fPos').value = inv.posState || ''; $('#fRound').checked = !!inv.roundToRupee;
  const cust = $('#fCustom'); cust.innerHTML = '';
  tpl.rects.filter((r) => r.type === 'custom').forEach((r, i) => {
    const k = 'custom_' + r.id; if (inv.fields[k] == null) inv.fields[k] = r.text || '';
    cust.append(h('label', {}, `Custom text ${i + 1}`, h('input', { value: inv.fields[k], 'data-custom': r.id, oninput: (e) => { inv.fields[k] = e.target.value; preview(); } })));
  });
  const types = new Set(tpl.rects.map((r) => r.type)), missing = FIELD_TYPES.filter((f) => !types.has(f.id) && !['custom', 'logo'].includes(f.id)).map((f) => f.label);
  $('#fMissing').textContent = tpl.rects.length ? (missing.length ? 'Not on this template (won\'t print): ' + missing.join(', ') : '') : '⚠ This template has no marked fields yet — use "Edit fields".';
  renderItems(); preview();
}
for (const k of TEXT_FIELDS) $('#f_' + k).addEventListener('input', (e) => { if (!fill.inv) return; fill.inv.fields[k] = e.target.value; if (k === 'invoice_no' && !binding) fill.inv.autoNumber = false; preview(); });
gstinField($('#f_seller_gstin'), $('#m_seller_gstin'), (sc) => { $('#fSellerState').value = sc; if (fill.inv) fill.inv.sellerState = sc; });
gstinField($('#f_client_gstin'), $('#m_client_gstin'), (sc) => { $('#fPos').value = sc; if (fill.inv) fill.inv.posState = sc; });
$('#fSellerState').onchange = (e) => { fill.inv.sellerState = e.target.value; preview(); };
$('#fPos').onchange = (e) => { fill.inv.posState = e.target.value; preview(); };
$('#fRound').onchange = (e) => { fill.inv.roundToRupee = e.target.checked; preview(); };
$('#fAddItem').onclick = () => { fill.inv.items.push({ description: '', hsn: '', qty: 1, rate: 0, gstRate: fill.tpl.gstRate }); renderItems(); preview(); };
$('#fReset').onclick = () => fill.tpl && startInvoice(fill.tpl.id);
function renderItems() {
  const tb = $('#fItems'); tb.innerHTML = '';
  fill.inv.items.forEach((it, i) => {
    const inp = (k, type, cls) => h('input', { type, value: it[k] ?? '', class: cls || '', step: 'any', 'data-k': k, oninput: (e) => { it[k] = type === 'number' ? Number(e.target.value) : e.target.value; preview(); } });
    const gst = h('select', { 'data-k': 'gstRate', onchange: (e) => { it.gstRate = Number(e.target.value); preview(); } }, [0, 0.25, 3, 5, 12, 18, 28].map((g) => { const o = h('option', { value: g }, g + '%'); if (Number(it.gstRate) === g) o.selected = true; return o; }));
    tb.append(h('tr', {}, h('td', {}, inp('description', 'text')), h('td', { style: 'width:90px' }, inp('hsn', 'text')), h('td', { style: 'width:64px' }, inp('qty', 'number')),
      h('td', { style: 'width:100px' }, inp('rate', 'number')), h('td', { style: 'width:80px' }, gst), h('td', { class: 'r amt', style: 'width:100px' }, ''),
      h('td', {}, h('button', { class: 'small danger', onclick: () => { fill.inv.items.splice(i, 1); renderItems(); preview(); } }, '✕'))));
  });
}
let pvTimer;
function preview() {
  const { inv, tpl } = fill; if (!inv) return; const c = calcFor(inv);
  $$('#fItems tr').forEach((tr, i) => (tr.querySelector('.amt').textContent = c.lines[i] ? formatINR(c.lines[i].taxable) : ''));
  const row = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><span>${v}</span></div>`;
  $('#fTotals').innerHTML = row('Subtotal', formatINR(c.subtotal)) + (c.interState ? row('IGST', formatINR(c.igst)) : row('CGST', formatINR(c.cgst)) + row('SGST', formatINR(c.sgst))) +
    (c.roundOff ? row('Round off', formatINR(c.roundOff)) : '') + row('Total', formatINR(c.total), 'gt') + `<span class="w" id="fWords">${amountInWords(c.total)}</span>` +
    `<span class="w">${!inv.sellerState || !inv.posState ? '⚠ Set seller state & place of supply for correct tax split' : c.interState ? 'Inter-state supply → IGST' : 'Intra-state supply → CGST + SGST'}</span>`;
  clearTimeout(pvTimer); pvTimer = setTimeout(async () => {
    const ops = layoutAll(tpl, inv), box = $('#fPreview');
    while (box.children.length > tpl.pages.length) box.lastChild.remove();
    while (box.children.length < tpl.pages.length) box.append(document.createElement('canvas'));
    for (let i = 0; i < tpl.pages.length; i++) await drawPage(box.children[i], tpl.pages[i], ops[i], 1.5);
    $('#fPv').textContent = `${tpl.pages.length} page(s)`;
  }, 120);
}
async function saveInvoice() {
  const { inv, tpl } = fill;
  if (!inv.fields.invoice_no) throw new Error('Invoice number required');
  for (const k of ['seller_gstin', 'client_gstin']) if (inv.fields[k] && !validateGSTIN(inv.fields[k]).valid && !confirm(`${k.replace('_', ' ')} looks invalid. Export anyway?`)) throw new Error('cancelled');
  if (!inv.id) {
    inv.id = db.uid(); inv.createdAt = Date.now();
    const t = await db.get('templates', tpl.id), n = nextInvoiceNumber(t.pattern, new Date(), t.counter);
    if (inv.autoNumber || inv.fields.invoice_no === n.number) { t.counter = n.counter; await db.put('templates', t); fill.tpl = t; }
  }
  const c = calcFor(inv); inv.total = c.total; inv.templateName = tpl.name; inv.updatedAt = Date.now();
  await db.put('invoices', structuredClone(inv)); return inv;
}
async function exportInv(tpl, inv, kind) {
  await loadFonts();
  if (kind === 'pdf') download(await buildPdf(tpl, inv), safe(inv.fields.invoice_no) + '.pdf', 'application/pdf');
  else download(await buildDocxFile(tpl, inv), safe(inv.fields.invoice_no) + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
for (const [id, kind] of [['#fPdf', 'pdf'], ['#fDocx', 'docx']]) $(id).onclick = async () => {
  try { const inv = await saveInvoice(); await exportInv(fill.tpl, inv, kind); toast(`Saved ${inv.fields.invoice_no} · ${kind.toUpperCase()} downloaded`); }
  catch (e) { if (e.message !== 'cancelled') { console.error(e); toast('Error: ' + e.message); } }
};

// ---------- clients ----------
async function refreshClients() {
  const cl = (await db.all('clients')).sort((a, b) => a.name.localeCompare(b.name));
  $('#fClientPick').innerHTML = '<option value="">— saved clients —</option>' + cl.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}
$('#fClientPick').onchange = async (e) => {
  const c = e.target.value && await db.get('clients', e.target.value); if (!c) return;
  Object.assign(fill.inv.fields, { client_name: c.name, client_address: c.address, client_gstin: c.gstin }); fill.inv.posState = c.state || stateFromGSTIN(c.gstin) || fill.inv.posState; bindForm();
};
$('#fSaveClient').onclick = async () => {
  const f = fill.inv?.fields; if (!f?.client_name) return toast('Enter a client name first');
  const ex = (await db.all('clients')).find((c) => c.name.toLowerCase() === f.client_name.toLowerCase());
  await db.put('clients', { id: ex?.id || db.uid(), name: f.client_name, address: f.client_address || '', gstin: (f.client_gstin || '').toUpperCase(), state: fill.inv.posState || '' });
  refreshClients(); toast('Client saved');
};
async function renderClients() {
  const cl = await db.all('clients'), tb = $('#cList'); tb.innerHTML = '';
  if (!cl.length) tb.append(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'No saved clients. Use "Save client" on the invoice form.')));
  cl.forEach((c) => tb.append(h('tr', {}, h('td', {}, c.name), h('td', {}, c.gstin), h('td', {}, STATES[c.state] || ''), h('td', {}, c.address),
    h('td', {}, h('button', { class: 'small danger', onclick: async () => { await db.del('clients', c.id); renderClients(); } }, 'Delete')))));
}

// ---------- history ----------
async function renderHistory() {
  const list = (await db.all('invoices')).sort((a, b) => b.createdAt - a.createdAt), tb = $('#hList'); tb.innerHTML = '';
  if (!list.length) tb.append(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'No invoices yet.')));
  for (const inv of list) {
    const tpl = await db.get('templates', inv.templateId);
    const btn = (label, fn) => h('button', { class: 'small', disabled: tpl ? null : '', onclick: fn }, label);
    const acts = h('td', {}, btn('PDF', () => exportInv(tpl, inv, 'pdf')), ' ', btn('DOCX', () => exportInv(tpl, inv, 'docx')), ' ', btn('Edit', () => { fill.tpl = tpl; fill.inv = structuredClone(inv); show('fill'); $('#fTpl').value = tpl.id; bindForm(); }), ' ',
      btn('Duplicate', () => startInvoice(tpl.id, inv)), ' ', h('button', { class: 'small danger', onclick: async () => { if (confirm('Delete ' + inv.fields.invoice_no + '?')) { await db.del('invoices', inv.id); renderHistory(); } } }, 'Delete'));
    tb.append(h('tr', {}, h('td', {}, inv.fields.invoice_no), h('td', {}, inv.fields.date), h('td', {}, inv.fields.client_name || ''), h('td', { class: 'r' }, formatINR(inv.total)), h('td', {}, tpl ? tpl.name : '(deleted)'), acts));
  }
}
renderTemplates(); loadFonts();
