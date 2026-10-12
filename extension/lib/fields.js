// Field catalogue for the "mark once" editor.
export const FIELD_TYPES = [
  ['seller_name', 'Seller name', 'seller'], ['seller_address', 'Seller address', 'seller'], ['seller_gstin', 'Seller GSTIN', 'seller'],
  ['client_name', 'Client name', 'client'], ['client_address', 'Client address', 'client'], ['client_gstin', 'Client GSTIN', 'client'],
  ['place_of_supply', 'Place of supply / state', 'invoice'], ['invoice_no', 'Invoice no.', 'invoice'], ['date', 'Invoice date', 'invoice'],
  ['due_date', 'Due date', 'invoice'], ['line_items', 'Line items table', 'items'], ['subtotal', 'Subtotal', 'calc'],
  ['cgst', 'CGST', 'calc'], ['sgst', 'SGST', 'calc'], ['igst', 'IGST', 'calc'], ['total', 'Total', 'calc'],
  ['amount_words', 'Amount in words', 'calc'], ['notes', 'Notes', 'invoice'], ['logo', 'Logo slot', 'logo'], ['custom', 'Custom text', 'custom'],
].map(([id, label, group]) => ({ id, label, group }));
export const FIELD = Object.fromEntries(FIELD_TYPES.map((f) => [f.id, f]));
export const MULTILINE = new Set(['seller_address', 'client_address', 'notes', 'amount_words', 'custom']);
