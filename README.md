# Invoice Template Filler (working name)

Chrome MV3 extension: turn **your own** sample invoice (PDF or DOCX) into a reusable template, fill Indian GST invoices,
and export a real **PDF** and **DOCX**. Fully on-device — no server, no account, no network calls, zero running cost.
The product name lives in one constant: `extension/lib/config.js` (`APP_NAME`; also update `manifest.json` "name" before publishing).

## How it works
1. **Templates → New template**: upload sample invoice (PDF via PDF.js; DOCX via mammoth.js → HTML → rasterised to A4 page images) + logo (PNG/JPG/SVG; SVG is rasterised to PNG).
2. **Mark fields (once)**: drag rectangles on the page, choose a field type (seller/client name/address/GSTIN, place of supply, invoice no, date, due date, line-items table, subtotal, CGST, SGST, IGST, total, amount in words, notes, logo, custom text). A box with *cover* ticked whites out the sample text underneath and draws your value. Per-box font size, bold, alignment; drag to move, Delete key/✕ to remove. Seller profile, number pattern, default GST % and due days are stored on the template.
3. **New invoice**: form with live preview; line items (description, HSN/SAC, qty, rate, GST %) with auto totals.
   Intra-state (seller state = place of supply) → CGST + SGST (half each, per-line rounding); inter-state → IGST. States come from GSTIN's first two digits or the dropdowns.
   INR formatting `en-IN` (₹1,59,298.82), amount in words (Rupees … and … Paise Only, lakh/crore), GSTIN format + checksum validation, optional round-to-rupee.
   Auto invoice number from pattern tokens `{FY}`=2026-27, `{FYS}`=2627, `{YYYY} {YY} {MM} {SEQ:4}`; counter per template, resets each financial year (April) when the pattern contains an FY token.
   Saved clients for reuse.
4. **Export**: PDF (pdf-lib; page background image + vector text using embedded DejaVu Sans so ₹ renders and text is selectable/searchable) and DOCX.
5. **History**: re-download PDF/DOCX, edit, duplicate (gets next number), delete.

Storage: IndexedDB (`itf-db`: templates, invoices, clients). No permissions requested in the manifest.

### DOCX output approach
Hand-written minimal OOXML (`lib/docx.js` + store-only `lib/zip.js`): each page is a full-bleed PNG (template + white-outs + logo) anchored *behind text*, and every value is an absolutely positioned Word text frame (`w:framePr`, page-anchored), so values remain editable text in Word/Pages/LibreOffice.

## Install on Mac (load unpacked)
1. Download/unzip `InvoiceExt.zip` (or use the `extension/` folder of the repo).
2. Chrome → `chrome://extensions` → enable **Developer mode** (top-right).
3. **Load unpacked** → select the unzipped folder (the one containing `manifest.json`).
4. Pin the extension; click its toolbar icon → the app opens in a full tab.

## Tests (one command)
```bash
npm install && npx playwright install chromium   # first time only
npm test            # unit (node:test) + e2e (Playwright, headed under xvfb-run on Linux)
npm run test:unit   # unit only
```
On macOS run e2e without xvfb: `node scripts/make-samples.mjs && node tests/e2e/e2e.mjs`.
The e2e generates `tests/fixtures/sample-invoice.pdf|.docx|logo.svg`, loads the unpacked extension, imports both templates, marks fields with the mouse, fills the form, exports PDF+DOCX and checks text with `pdftotext` / `unzip -p word/document.xml` (needs poppler-utils + unzip). Screenshots go to `verify/`.

Build store zip: `npm run build` → `dist/InvoiceExt.zip`.

## Manual checklist
- [ ] Toolbar icon opens the app tab; no console errors.
- [ ] Import a real PDF invoice (multi-page too) and a DOCX invoice; pages look right; logo shows in the template tile.
- [ ] Draw boxes for every field type; move one; delete one; toggle cover/bold/size/alignment; save; reopen "Edit fields" — boxes persist.
- [ ] Seller GSTIN: invalid → red message; valid → green + state auto-selected.
- [ ] Client GSTIN in another state → IGST only; same state → CGST+SGST; totals and words correct; round-to-rupee shows round-off.
- [ ] Invoice number = pattern with next sequence; editing manually doesn't consume the counter.
- [ ] PDF download opens in Preview/Acrobat; ₹ glyph visible; text selectable; sample text hidden under covered boxes.
- [ ] DOCX opens in Word/Pages/LibreOffice; background + values in the right spots; values editable.
- [ ] History: re-download PDF/DOCX, Duplicate gets next number, Delete.
- [ ] Save client → pick it on a new invoice. Reload the tab → templates/clients/history persist.
- [ ] DevTools → Network: zero network requests during the whole flow.

## Limits / known trade-offs
- Template backgrounds are raster (144 dpi) for both PDF and DOCX inputs; output PDFs are larger (~100–400 KB/page) and the original sample text is not selectable (intentional: hidden sample values can't leak).
- DOCX import goes through mammoth (semantic HTML): fonts, exact spacing, headers/footers, text boxes and floating shapes of the DOCX are approximated, not pixel-identical. Export a DOCX to PDF first for exact fidelity.
- Max 10 pages per template. Line items that don't fit the marked table box are dropped (no auto page overflow); the preview shows this.
- DOCX output positions values with text frames using Arial; renderers vary slightly from the PDF (which uses DejaVu Sans).
- Invoice counters are per template. No e-invoice/IRN/QR, no cess/TCS/reverse-charge, no multi-currency.
- Vendored PDF.js is Apache-2.0 (others MIT/BSD); see NOTICE.
