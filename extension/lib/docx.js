// Builds a DOCX: each page = full-bleed background PNG (template + white-outs + logo baked in,
// anchored behind text) + every value as an absolutely positioned text frame (w:framePr). Values stay editable text.
import { makeZip } from './zip.js';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TW = 20, EMU = 12700;
/** pages: [{width,height, png:Uint8Array, ops}] */
export function buildDocx(pages, title = 'Invoice') {
  let body = '';
  pages.forEach((pg, i) => {
    const cx = Math.round(pg.width * EMU), cy = Math.round(pg.height * EMU);
    body += `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">
<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${i + 1}" name="Page${i + 1}"/><wp:cNvGraphicFramePr/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${i + 1}" name="bg${i + 1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${i + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
    for (const op of pg.ops.filter((o) => o.t === 'text' && o.text)) {
      const jc = op.align === 'right' ? 'right' : op.align === 'center' ? 'center' : 'left';
      body += `<w:p><w:pPr><w:framePr w:w="${Math.round(op.w * TW)}" w:h="${Math.round(op.size * 1.25 * TW)}" w:hRule="exact" w:hSpace="0" w:wrap="around" w:vAnchor="page" w:hAnchor="page" w:x="${Math.round(op.x * TW)}" w:y="${Math.round(op.y * TW)}"/><w:spacing w:before="0" w:after="0" w:line="${Math.round(op.size * 1.2 * TW)}" w:lineRule="exact"/><w:jc w:val="${jc}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${op.bold ? '<w:b/>' : ''}<w:sz w:val="${Math.round(op.size * 2)}"/></w:rPr><w:t xml:space="preserve">${esc(op.text)}</w:t></w:r></w:p>`;
    }
    const sect = `<w:sectPr><w:pgSz w:w="${Math.round(pg.width * TW)}" w:h="${Math.round(pg.height * TW)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
    if (i < pages.length - 1) body += `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${sect}</w:pPr></w:p>`;
    else body += sect;
  });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}</w:body></w:document>`;
  const rels = pages.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bg${i + 1}.png"/>`).join('');
  return makeZip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    { name: 'word/document.xml', data: doc },
    ...pages.map((p, i) => ({ name: `word/media/bg${i + 1}.png`, data: p.png })),
  ]);
}
