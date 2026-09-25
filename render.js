/* ============================================================
   render.js — 軽量構造化テキストのレンダリング／PDF出力
   保存データは常にプレーンテキスト＋記号（# ##〜##### - :c: **太字**）のまま。
   画面表示・PDF生成の瞬間だけ、この記号を読み取って装飾済みHTMLに変換する。
   ※ db.js（escapeHtml）の後に読み込むこと
   ============================================================ */

// エスケープ後の文字列に対してのみ **太字** → <strong> を適用する（安全な順序）
function inlineMarkdownToHtml(escapedLine){
  return escapedLine.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
}

// 軽量構造化テキスト（#タイトル／##〜#####見出し4階層／:c:中央寄せ／-リスト（2階層まで）／**太字**）
// をHTMLに変換する。
// 重要：入力は必ず最初にHTMLエスケープしてから記号を解釈する（`<` `>` `&` 等でレイアウトが
// 壊れるのを防ぐ）。エスケープ後に追加する <h1>/<h2〜h5>/<li>/<strong> は解析対象外なので安全。
// 見出し4階層は取り込み元（Word/Webページ）の detectHeadingLevel と対応：
//   ## =レベル1（白太字・黒地）／### =レベル2（白太字・濃灰地）／
//   ####=レベル3（黒細字・淡灰地）／#####=レベル4（黒太字・地なし）
function renderStructuredText(text){
  const raw = (text==null? '' : String(text));
  const lines = raw.split(/\r\n|\r|\n/);
  let html = '';
  let paragraphBuf = [];
  let ulOpenLevels = []; // 開いている<ul>の階層スタック（0=通常、1=ネスト）

  function flushParagraph(){
    if(paragraphBuf.length){ html += '<p>'+paragraphBuf.join('<br>')+'</p>'; paragraphBuf = []; }
  }
  function closeAllLists(){ while(ulOpenLevels.length){ html += '</ul>'; ulOpenLevels.pop(); } }

  lines.forEach(line=>{
    const trimmed = line.trim();
    if(trimmed===''){ flushParagraph(); closeAllLists(); return; }

    let m;
    if((m = trimmed.match(/^#\s+(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<h1>'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</h1>';
      return;
    }
    if((m = trimmed.match(/^#####\s+(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<h5 class="heading-lvl4">'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</h5>';
      return;
    }
    if((m = trimmed.match(/^####\s+(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<h4 class="heading-lvl3">'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</h4>';
      return;
    }
    if((m = trimmed.match(/^###\s+(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<h3 class="heading-lvl2">'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</h3>';
      return;
    }
    if((m = trimmed.match(/^##\s+(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<h2 class="heading-lvl1">'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</h2>';
      return;
    }
    if((m = trimmed.match(/^:c:\s?(.*)$/))){
      flushParagraph(); closeAllLists();
      html += '<p class="align-center">'+inlineMarkdownToHtml(escapeHtml(m[1]))+'</p>';
      return;
    }
    const listMatch = line.match(/^(\s*)-\s?(.*)$/);
    if(listMatch){
      flushParagraph();
      const level = listMatch[1].replace(/\t/g,'  ').length >= 2 ? 1 : 0;
      if(!ulOpenLevels.length){ html += '<ul>'; ulOpenLevels.push(level); }
      else if(level > ulOpenLevels[ulOpenLevels.length-1]){ html += '<ul>'; ulOpenLevels.push(level); }
      else if(level < ulOpenLevels[ulOpenLevels.length-1]){ html += '</ul>'; ulOpenLevels.pop(); }
      html += '<li>'+inlineMarkdownToHtml(escapeHtml(listMatch[2]))+'</li>';
      return;
    }
    closeAllLists();
    paragraphBuf.push(inlineMarkdownToHtml(escapeHtml(trimmed)));
  });
  flushParagraph();
  closeAllLists();
  return html || '<p class="text-gray-400">（本文がありません）</p>';
}

// 長大テキスト（100ページ級）でも画面が固まらないよう、数百行ずつ requestAnimationFrame で
// 分割描画する。短い文書はそのまま一括描画する。
function renderStructuredTextInto(containerId, text){
  const container = document.getElementById(containerId);
  if(!container) return;
  const raw = (text==null? '' : String(text));
  const lines = raw.split(/\r\n|\r|\n/);
  const CHUNK_SIZE = 300;
  if(lines.length <= CHUNK_SIZE){
    container.innerHTML = renderStructuredText(raw);
    return;
  }
  container.innerHTML = '';
  let i = 0;
  function renderNextChunk(){
    const chunkLines = lines.slice(i, i+CHUNK_SIZE);
    const div = document.createElement('div');
    div.innerHTML = renderStructuredText(chunkLines.join('\n'));
    container.appendChild(div);
    i += CHUNK_SIZE;
    if(i < lines.length) requestAnimationFrame(renderNextChunk);
  }
  requestAnimationFrame(renderNextChunk);
}

/* ============================================================
   太字装飾アシスト：テキストエリアで選択した範囲を **太字** に変換／解除する
   ============================================================ */
function wrapSelectionBold(textareaId){
  const ta = document.getElementById(textareaId);
  if(!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  if(start===end){
    const before = ta.value.slice(0,start), after = ta.value.slice(start);
    ta.value = before+'****'+after;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start+2;
    return;
  }
  const selected = ta.value.slice(start,end);
  const before = ta.value.slice(0,start), after = ta.value.slice(end);
  if(selected.startsWith('**') && selected.endsWith('**') && selected.length>=4){
    const unwrapped = selected.slice(2,-2);
    ta.value = before+unwrapped+after;
    ta.focus();
    ta.selectionStart = start; ta.selectionEnd = start+unwrapped.length;
    return;
  }
  ta.value = before+'**'+selected+'**'+after;
  ta.focus();
  ta.selectionStart = start; ta.selectionEnd = end+4;
}

// 取り込みフォームの「本文全文」を、保存前でもその場でプレビューする
function previewCurrentFormFullText(){
  const title = document.getElementById('f_title').value || '（無題）';
  const text = document.getElementById('f_fulltext').value || '';
  document.getElementById('fullTextModalTitle').innerHTML = '<i class="fa-solid fa-file-lines mr-2"></i>'+escapeHtml(title);
  renderStructuredTextInto('fullTextModalBody', text);
  const pdfBtn = document.getElementById('fullTextModalPdfBtn');
  if(pdfBtn) pdfBtn.onclick = ()=> openPdfPreview(title, text);
  openModal('fullTextModal');
}

/* ============================================================
   PDF出力（方式A：ブラウザの印刷機能経由）
   @page の余白ボックス（ヘッダー・フッター・ページ番号）はSafari 18.2/Chrome 131以降で
   対応。非対応の古いブラウザでも最低限タイトルは本文内に表示されるようフォールバックする。
   ============================================================ */
function buildPrintableHtml(title, bodyHtml){
  const esc = escapeHtml(title||'（無題）');
  const escAttr = esc.replace(/"/g,'\\"');
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>${esc}</title>
<style>
  @page {
    size: A4;
    margin: 25mm 18mm 20mm 18mm;
    @top-center { content: "${escAttr}"; font-size: 9pt; color: #666; }
    @bottom-center { content: "ページ " counter(page) " / " counter(pages); font-size: 9pt; color: #666; }
  }
  /* ブラウザは既定で印刷時に背景色を省略するため、見出しの黒/灰ハイライトを確実に出すには
     print-color-adjust（旧仕様のベンダー接頭辞つきも併記）を明示する必要がある */
  *{ -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  body{
    font-family: "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;
    font-size: 11pt; line-height: 1.9; color:#1c1c1c; margin:0; padding:0;
  }
  .print-title{
    font-size:18pt; font-weight:700; text-align:center; margin: 0 0 18pt 0;
    border-bottom: 2px solid #1c2b4a; padding-bottom: 10pt;
  }
  h1{ font-size:16pt; margin: 20pt 0 10pt; }
  h2.heading-lvl1, h3.heading-lvl2, h4.heading-lvl3, h5.heading-lvl4{
    margin: 16pt auto 8pt; padding: 3pt 10pt; border-radius: 3pt; display:table; text-align:center;
  }
  h2.heading-lvl1{ background:#000; color:#fff; font-weight:700; font-size:13pt; }
  h3.heading-lvl2{ background:#555; color:#fff; font-weight:700; font-size:12.5pt; }
  h4.heading-lvl3{ background:#ddd; color:#1c1c1c; font-weight:400; font-size:12pt; }
  h5.heading-lvl4{ background:transparent; color:#1c1c1c; font-weight:700; font-size:12pt; padding:0; }
  p{ margin: 0 0 10pt; }
  p.align-center{ text-align:center; }
  ul{ margin: 0 0 10pt 0; padding-left: 1.4em; }
  li{ margin-bottom: 4pt; }
  strong{ font-weight:700; }
  .print-footnote{ margin-top: 24pt; font-size:8.5pt; color:#999; text-align:center; }
</style>
</head><body>
  <div class="print-title">${esc}</div>
  ${bodyHtml}
  <p class="print-footnote">※ ご利用の環境（主に2024年12月より前のiOS/Safari）によっては、ページ番号・ヘッダーが印刷されない場合があります。</p>
</body></html>`;
}

// 「PDF出力」ボタンの共通処理：印刷用ウィンドウを開いてブラウザの印刷ダイアログを呼び出す
function openPdfPreview(title, text){
  const bodyHtml = renderStructuredText(text||'');
  const html = buildPrintableHtml(title, bodyHtml);
  const win = window.open('', '_blank');
  if(!win){
    alert('ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してから、もう一度お試しください。');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(()=>{ try{ win.focus(); win.print(); }catch(e){ /* noop */ } }, 300);
}
