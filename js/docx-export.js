/* ============================================================
   docx-export.js — Word（.docx）で書き出す（編集アプリ・ビューア共通）
   PDF出力と同じ設定・同じ変換結果を使う：
     ・ふりがな（ルビ／括弧書き）… ふりがなの設定のまま。ルビは、Wordの実際のルビ（ふりがな）として入れる
     ・AI解説をつける／つけない … PDFと同じ設定。本文のあと、新しいページから
     ・文字サイズ（本文／AI解説は別）・フォント … PDFと同じ設定
   外部のライブラリは使わず、.docx（ZIP形式）をこのファイルだけで作る。
   ※ render.js の後に読み込むこと
   ============================================================ */
// Wordのフォント名（PDFのフォントの選択肢に対応）。お使いの端末に入っている書体だけが使える
const DX_FONTS = {
  mincho: {ascii: 'Yu Mincho',  ea: '游明朝'},
  gothic: {ascii: 'Yu Gothic',  ea: '游ゴシック'},
  meiryo: {ascii: 'Meiryo UI',  ea: 'Meiryo UI'}
};
const DX_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function dxEsc(s){
  return String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const dxHalf = pt => Math.max(2, Math.round(pt*2));   // pt → ハーフポイント（Wordの文字サイズの単位）

/* ---------- 文字（run）・段落（paragraph） ---------- */
// fmt: {bold, color, size(ハーフポイント), shade}
function dxRPr(fmt){
  fmt = fmt || {};
  return '<w:rPr>' + (fmt.bold ? '<w:b/><w:bCs/>' : '') + (fmt.color ? `<w:color w:val="${fmt.color}"/>` : '')
    + (fmt.size ? `<w:sz w:val="${fmt.size}"/><w:szCs w:val="${fmt.size}"/>` : '') + '</w:rPr>';
}
function dxRun(text, fmt){ return text==='' ? '' : `<w:r>${dxRPr(fmt)}<w:t xml:space="preserve">${dxEsc(text)}</w:t></w:r>`; }
function dxRuby(base, reading, fmt, baseSize){
  const hps = Math.max(2, Math.round(baseSize*0.5)), raise = Math.round(baseSize*0.86);
  return '<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="center"/>'
    + `<w:hps w:val="${hps}"/><w:hpsRaise w:val="${raise}"/><w:hpsBaseText w:val="${baseSize}"/><w:lid w:val="ja-JP"/></w:rubyPr>`
    + `<w:rt><w:r><w:rPr><w:sz w:val="${hps}"/><w:szCs w:val="${hps}"/></w:rPr><w:t xml:space="preserve">${dxEsc(reading)}</w:t></w:r></w:rt>`
    + `<w:rubyBase><w:r>${dxRPr(fmt)}<w:t xml:space="preserve">${dxEsc(base)}</w:t></w:r></w:rubyBase></w:ruby></w:r>`;
}
// p: {align, left, hanging, shade, spaceAfter, keepNext, pageBreakBefore, borderBottom, line}
function dxPara(inner, p){
  p = p || {};
  const ppr = (p.keepNext ? '<w:keepNext/>' : '') + (p.pageBreakBefore ? '<w:pageBreakBefore/>' : '')
    + (p.borderBottom ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${p.borderBottom}"/></w:pBdr>` : '')
    + (p.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>` : '')
    + `<w:spacing w:before="${p.before||0}" w:after="${p.spaceAfter==null?160:p.spaceAfter}" w:line="${p.line||456}" w:lineRule="auto"/>`
    + ((p.left||p.hanging) ? `<w:ind w:left="${p.left||0}"${p.hanging?` w:hanging="${p.hanging}"`:''}/>` : '')
    + (p.align ? `<w:jc w:val="${p.align}"/>` : '');
  return `<w:p><w:pPr>${ppr}</w:pPr>${inner}</w:p>`;
}

/* ---------- 本文のHTML（renderStructuredText の結果）→ Wordの段落 ---------- */
function dxInline(node, fmt, baseSize){
  let out = '';
  node.childNodes.forEach(ch=>{
    if(ch.nodeType===3){ out += dxRun(ch.nodeValue, fmt); return; }
    if(ch.nodeType!==1) return;
    const tag = ch.tagName;
    if(tag==='BR'){ out += '<w:r><w:br/></w:r>'; return; }
    if(tag==='RUBY'){
      let base = '', rt = '';
      ch.childNodes.forEach(c=>{ if(c.nodeType===1 && c.tagName==='RT') rt += c.textContent; else base += c.textContent; });
      out += rt ? dxRuby(base, rt, fmt, baseSize) : dxRun(base, fmt);
      return;
    }
    if(tag==='RT' || tag==='RP') return;
    const f2 = (tag==='STRONG' || tag==='B') ? Object.assign({}, fmt, {bold:true}) : fmt;
    out += dxInline(ch, f2, baseSize);
  });
  return out;
}
function dxBody(bodyHtml, baseSize){
  const box = document.createElement('div');
  box.innerHTML = bodyHtml;
  let out = '';
  const heading = (el, scale, fill, color, bold, align)=>{
    const sz = Math.round(baseSize*scale);
    return dxPara(dxInline(el, {bold, color, size: sz}, sz), {align, shade: fill, keepNext: true, before: 200, spaceAfter: 140});
  };
  const walk = (parent, depth)=>{
    parent.childNodes.forEach(el=>{
      if(el.nodeType!==1) return;
      const tag = el.tagName;
      if(tag==='H1') out += heading(el, 1.455, null, null, true, null);
      else if(tag==='H2') out += heading(el, 1.18, '000000', 'FFFFFF', true, 'center');
      else if(tag==='H3') out += heading(el, 1.136, '555555', 'FFFFFF', true, 'center');
      else if(tag==='H4') out += heading(el, 1.09, 'DDDDDD', '1C1C1C', false, 'center');
      else if(tag==='H5') out += heading(el, 1.09, null, '1C1C1C', true, 'center');
      else if(tag==='UL'){ walk(el, depth+1); }
      else if(tag==='LI'){
        const left = 420 + (depth-1)*420;
        out += dxPara(dxRun('・', {size: baseSize}) + dxInline(el, {size: baseSize}, baseSize), {left, hanging: 210, spaceAfter: 80});
      }
      else out += dxPara(dxInline(el, {size: baseSize}, baseSize), {align: el.classList && el.classList.contains('align-center') ? 'center' : null});
    });
  };
  walk(box, 0);
  return out;
}
function dxNotes(notes, notesPt){
  if(!notes || !notes.length) return '';
  const sz = dxHalf(notesPt), cat = {person:'人物', term:'語句', event:'出来事'};
  let out = dxPara(dxRun('AI解説', {bold:true, size: Math.round(sz*1.3)}), {align:'center', pageBreakBefore:true, borderBottom:'1C2B4A', spaceAfter:240, line:360});
  notes.forEach(n=>{
    let inner = '';
    if(n.item){
      inner += dxRun(n.item, {bold:true, size:sz});
      if(n.reading && n.reading!==n.item) inner += dxRun('（'+n.reading+'）', {color:'555555', size:sz});
      inner += dxRun('［'+(cat[n.category]||'語句')+'］', {color:'6B7080', size: Math.round(sz*0.85)}) + '<w:r><w:br/></w:r>';
    }
    inner += dxRun(n.desc||'', {size:sz}).replace(/\n/g,' ');
    if(n.source) inner += dxRun('（出典：'+n.source+(n.credibility?'／信頼度'+n.credibility:'')+'）', {color:'666666', size: Math.round(sz*0.92)});
    out += dxPara(inner, {spaceAfter:140, line:432});
  });
  return out;
}

/* ---------- .docx の組み立て ---------- */
function dxDocumentXml(title, bodyHtml, o){
  const base = dxHalf(o.size);
  const titleP = dxPara(dxRun(title||'（無題）', {bold:true, size: Math.round(base*1.636)}), {align:'center', borderBottom:'1C2B4A', spaceAfter:360, line:360});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${DX_NS}><w:body>`
    + titleP + dxBody(bodyHtml, base) + dxNotes(o.notes, o.notesSize)
    + '<w:sectPr><w:headerReference w:type="default" r:id="rId11"/><w:footerReference w:type="default" r:id="rId12"/>'
    + '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1020" w:bottom="1134" w:left="1020" w:header="680" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
}
function dxStylesXml(o){
  const f = DX_FONTS[o.font] || DX_FONTS.mincho, base = dxHalf(o.size);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${DX_NS}><w:docDefaults><w:rPrDefault><w:rPr>`
    + `<w:rFonts w:ascii="${f.ascii}" w:hAnsi="${f.ascii}" w:eastAsia="${f.ea}" w:cs="${f.ascii}"/><w:color w:val="1C1C1C"/><w:sz w:val="${base}"/><w:szCs w:val="${base}"/><w:lang w:val="ja-JP" w:eastAsia="ja-JP"/>`
    + '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="456" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';
}
function dxHeaderXml(title){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${DX_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${dxRun(title||'（無題）', {color:'666666', size:18})}</w:p></w:hdr>`;
}
function dxFooterXml(){
  const r = t=>dxRun(t, {color:'666666', size:18});
  const fld = (instr)=>`<w:fldSimple w:instr=" ${instr} "><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${DX_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${r('ページ ')}${fld('PAGE')}${r(' / ')}${fld('NUMPAGES')}</w:p></w:ftr>`;
}

/* ---------- ZIP（無圧縮）の書き出し ---------- */
const DX_CRC_TABLE = (()=>{ const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c = n; for(let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); t[n] = c>>>0; } return t; })();
function dxCrc32(bytes){ let c = 0xFFFFFFFF; for(let i=0;i<bytes.length;i++) c = DX_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c>>>8); return (c ^ 0xFFFFFFFF)>>>0; }
function dxZipBytes(files){   // files: [{name, text}] → 無圧縮ZIPのバイト列
  const enc = new TextEncoder(), now = new Date();
  const dosTime = (now.getHours()<<11) | (now.getMinutes()<<5) | (now.getSeconds()>>1);
  const dosDate = ((now.getFullYear()-1980)<<9) | ((now.getMonth()+1)<<5) | now.getDate();
  const chunks = [], central = []; let offset = 0;
  const u16 = n=>[n&255, (n>>>8)&255], u32 = n=>[n&255, (n>>>8)&255, (n>>>16)&255, (n>>>24)&255];
  files.forEach(f=>{
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = dxCrc32(data);
    const local = Uint8Array.from([0x50,0x4B,0x03,0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(local, name, data);
    central.push(Uint8Array.from([0x50,0x4B,0x01,0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  });
  const cdSize = central.reduce((s,c)=>s+c.length, 0);
  const end = Uint8Array.from([0x50,0x4B,0x05,0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const parts = [...chunks, ...central, end];
  const out = new Uint8Array(parts.reduce((n,c)=>n+c.length, 0));
  let pos = 0; parts.forEach(c=>{ out.set(c, pos); pos += c.length; });
  return out;
}
function dxZip(files){ return new Blob([dxZipBytes(files)], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}); }
function dxBuildDocxBlob(title, bodyHtml, o){ return new Blob([dxBuildDocxBytes(title, bodyHtml, o)], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}); }
function dxBuildDocxBytes(title, bodyHtml, o){
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
    + '<Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  return dxZipBytes([
    {name:'[Content_Types].xml', text: ct}, {name:'_rels/.rels', text: rels},
    {name:'word/document.xml', text: dxDocumentXml(title, bodyHtml, o)}, {name:'word/styles.xml', text: dxStylesXml(o)},
    {name:'word/header1.xml', text: dxHeaderXml(title)}, {name:'word/footer1.xml', text: dxFooterXml()},
    {name:'word/_rels/document.xml.rels', text: docRels}
  ]);
}

/* ---------- 画面からの呼び出し ---------- */
// opts.notes＝この書き起こしのAI解説の一覧（docPdfNotes の結果）。「AI解説をつける」がオンのときだけ、本文のあとにつける
function exportWord(title, text, opts){
  opts = opts || {};
  const bodyHtml = renderStructuredText(text||'');
  const notes = (getPdfNotes() && opts.notes && opts.notes.length) ? opts.notes : null;
  const blob = dxBuildDocxBlob(title, bodyHtml, {font: getPdfFont(), size: getPdfSize(), notes, notesSize: getPdfNotesSize()});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = String(title||'無題').replace(/[\\\/:*?"<>|]/g,'_').slice(0,80) + '.docx';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 8000);
}
// 全文の画面の「Word出力」ボタンに、いま開いている内容を結びつける
function setFullTextWordBtn(title, text, notes){
  const b = document.getElementById('fullTextModalWordBtn');
  if(b) b.onclick = ()=> exportWord(title, text, {notes});
}
