// Generates sample templates for e2e: a sample PDF invoice, a sample DOCX invoice and an SVG logo.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeZip } from '../extension/lib/zip.js';
const out = new URL('../tests/fixtures/', import.meta.url); mkdirSync(out, { recursive: true });

// Layout constants shared with the e2e test (top-left origin, points, A4)
export const W = 595.28, H = 841.89;
const doc = await PDFDocument.create(), pg = doc.addPage([W, H]);
const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
const t = (s, x, y, size = 10, font = f) => pg.drawText(s, { x, y: H - y - size * 0.8, size, font, color: rgb(0.1, 0.1, 0.1) });
pg.drawRectangle({ x: 40, y: H - 100, width: W - 80, height: 2, color: rgb(0.15, 0.39, 0.92) });
t('TAX INVOICE', 400, 40, 18, fb);
t('Sample Seller Pvt Ltd', 40, 110, 12, fb); t('12 Old Street, Chennai 600001', 40, 128); t('GSTIN: 33AAAAA0000A1Z5', 40, 144);
t('Invoice No: SAMPLE-0001', 360, 110); t('Date: 01/01/2026', 360, 128); t('Due: 15/01/2026', 360, 144);
t('Bill To:', 40, 180, 10, fb); t('Old Client Name', 40, 196); t('Old client address line', 40, 212); t('GSTIN: 29BBBBB1111B1Z5', 40, 228);
t('Place of supply: Karnataka', 360, 196);
pg.drawRectangle({ x: 40, y: H - 270, width: W - 80, height: 18, color: rgb(0.93, 0.95, 0.99) });
t('#   Description            HSN     Qty     Rate     GST     Amount', 46, 256, 9, fb);
t('1   Old sample item         9983    1      100.00   18%    100.00', 46, 278, 9);
t('Subtotal', 360, 470); t('100.00', 480, 470); t('CGST', 360, 488); t('9.00', 480, 488); t('SGST', 360, 506); t('9.00', 480, 506);
t('IGST', 360, 524); t('0.00', 480, 524); t('Total', 360, 546, 12, fb); t('118.00', 480, 546, 12, fb);
t('Amount in words: One Hundred Eighteen Only', 40, 580); t('Notes: Thank you for your business', 40, 620);
t('[LOGO]', 40, 40, 14, fb);
writeFileSync(new URL('sample-invoice.pdf', out), await doc.save());

// DOCX sample (simple WordprocessingML: paragraphs + a table)
const P = (s, b) => `<w:p><w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${s}</w:t></w:r></w:p>`;
const cell = (s) => `<w:tc><w:p><w:r><w:t>${s}</w:t></w:r></w:p></w:tc>`;
const row = (a) => `<w:tr>${a.map(cell).join('')}</w:tr>`;
const body = [P('DOCX SAMPLE SELLER', true), P('Address line from the docx'), P('GSTIN 33AAAAA0000A1Z5'), P('Invoice: DOCX-0001'), P('Date: 01/01/2026'),
  P('Bill to: Docx Old Client', true), P('Client address here'), P(''),
  `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${row(['Item', 'HSN', 'Qty', 'Rate', 'Amount'])}${row(['Old docx item', '9983', '1', '50', '50'])}</w:tbl>`,
  P(''), P('Total: 59.00', true), P('Thank you!')].join('');
writeFileSync(new URL('sample-invoice.docx', out), makeZip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` },
]));
writeFileSync(new URL('logo.svg', out), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><rect width="200" height="80" rx="12" fill="#2563eb"/><circle cx="40" cy="40" r="22" fill="#fbbf24"/><text x="72" y="50" font-family="Arial" font-size="28" font-weight="bold" fill="#fff">ACME</text></svg>');
console.log('fixtures written');
