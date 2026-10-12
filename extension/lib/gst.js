// Pure, dependency-free GST / INR helpers. Used by the extension and node:test.
export const STATES = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand',
  '06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim',
  '12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya',
  '18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra','29':'Karnataka',
  '30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory'
};

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CH.indexOf(first14[i]);
    if (v < 0) return null;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CH[(36 - (sum % 36)) % 36];
}
/** @returns {{valid:boolean, error?:string, stateCode?:string}} */
export function validateGSTIN(raw) {
  const g = String(raw || '').trim().toUpperCase();
  if (!g) return { valid: false, error: 'empty' };
  if (g.length !== 15) return { valid: false, error: 'GSTIN must be 15 characters' };
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return { valid: false, error: 'Invalid GSTIN format' };
  const sc = g.slice(0, 2);
  if (!STATES[sc]) return { valid: false, error: 'Unknown state code ' + sc };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { valid: false, error: 'Checksum mismatch' };
  return { valid: true, stateCode: sc };
}
export const stateFromGSTIN = (g) => { const s = String(g || '').trim().slice(0, 2); return STATES[s] ? s : null; };

// Round half away from zero to 2 dp, robust against binary FP (1.005 -> 1.01).
export function round2(n) {
  const s = Math.sign(n) || 1;
  return s * Math.round(Number((Math.abs(n)).toFixed(8)) * 100 + 1e-9) / 100;
}

/**
 * items: [{description,hsn,qty,rate,gstRate}]
 * Tax computed per line, CGST/SGST = half each (rounded per line), IGST = full.
 */
export function computeInvoice(items, sellerState, posState, opts = {}) {
  const inter = !!(sellerState && posState && sellerState !== posState);
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0;
  const lines = (items || []).map((it) => {
    const qty = Number(it.qty) || 0, rate = Number(it.rate) || 0, gr = Number(it.gstRate) || 0;
    const taxable = round2(qty * rate);
    let lc = 0, ls = 0, li = 0;
    if (inter) li = round2(taxable * gr / 100);
    else { lc = round2(taxable * gr / 200); ls = lc; }
    subtotal += taxable; cgst += lc; sgst += ls; igst += li;
    return { ...it, qty, rate, gstRate: gr, taxable, cgst: lc, sgst: ls, igst: li, total: round2(taxable + lc + ls + li) };
  });
  subtotal = round2(subtotal); cgst = round2(cgst); sgst = round2(sgst); igst = round2(igst);
  let total = round2(subtotal + cgst + sgst + igst), roundOff = 0;
  if (opts.roundToRupee) { const r = Math.round(total); roundOff = round2(r - total); total = r; }
  return { interState: inter, lines, subtotal, cgst, sgst, igst, roundOff, total };
}

export function formatINR(n, { symbol = true } = {}) {
  const v = round2(Number(n) || 0);
  const s = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  return (v < 0 ? '-' : '') + (symbol ? '₹' : '') + s;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
function three(n) { const h = Math.floor(n / 100), r = n % 100; return [h ? ONES[h] + ' Hundred' : '', r ? two(r) : ''].filter(Boolean).join(' '); }
export function numberToIndianWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thou = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(numberToIndianWords(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thou) parts.push(two(thou) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}
export function amountInWords(amount) {
  const v = round2(Math.abs(Number(amount) || 0));
  const rupees = Math.floor(v), paise = Math.round((v - rupees) * 100);
  let s = 'Rupees ' + numberToIndianWords(rupees);
  if (paise) s += ' and ' + two(paise) + ' Paise';
  return s + ' Only';
}

// Financial year (April–March): 2026-10-12 -> "2026-27"
export function financialYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
/** Tokens: {FY} {FYS} (2627) {YYYY} {YY} {MM} {SEQ} {SEQ:n} */
export function formatInvoiceNumber(pattern, date, seq) {
  const d = date instanceof Date ? date : new Date(date);
  const fy = financialYear(d);
  return pattern
    .replace(/\{FY\}/g, fy).replace(/\{FYS\}/g, fy.slice(2, 4) + fy.slice(5))
    .replace(/\{YYYY\}/g, String(d.getFullYear())).replace(/\{YY\}/g, String(d.getFullYear()).slice(2))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_, w) => String(seq).padStart(Number(w || 4), '0'));
}
/** counter: {fy, last}. Resets per FY when pattern contains an FY token. */
export function nextInvoiceNumber(pattern, date, counter) {
  const fy = financialYear(date);
  const fyAware = /\{FYS?\}/.test(pattern);
  const last = counter && (!fyAware || counter.fy === fy) ? counter.last : 0;
  const seq = last + 1;
  return { number: formatInvoiceNumber(pattern, date, seq), counter: { fy, last: seq } };
}
