/* ============================================================
   render.js — 軽量構造化テキストのレンダリング／PDF出力
   保存データは常にプレーンテキスト＋記号（# ##〜##### - :c: **太字**）のまま。
   画面表示・PDF生成の瞬間だけ、この記号を読み取って装飾済みHTMLに変換する。
   ※ db.js（escapeHtml）の後に読み込むこと
   ============================================================ */

/* ============================================================
   ふりがな（ルビ）の表示
   保存データは常にプレーンテキストの「漢字(読み)」のまま。表示・PDF出力の瞬間にだけ変換する。
   ■ 表示方式（切り替え可）
     ・ルビ：漢字の上に小さく読みを付ける（<ruby><rt>）
     ・括弧書き：「寂光(じゃっこう)」のまま表示する
     選択は端末ごとに記憶する。全文表示の画面と、PDF出力の両方に効く。
   ■ 読みの対象（土台）の範囲の決め方
     括弧の直前の漢字の連続のうち、どこからが土台かを、次の優先順位で決める。
     ①明示：直前のゼロ幅スペース（Wordのルビ取り込み分）／手入力の「｜」（例：皆｜寂光(じゃっこう)）
     ②辞書：登録済みの「語＝読み」（設定画面の辞書・Wordルビの取り込み分・AI解説・人物DB）と
            読みまで完全に一致する、最も長い末尾部分
     ③同じ本文内の根拠：同じ読みが、より短い語（例：「寂光(じゃっこう)」）にも付いていれば、
            その最短の末尾部分
     ④読みの長さ：読みが極端に短く、直前の漢字を全部含めると明らかに不自然な場合のみ短縮
     いずれにも当たらなければ、従来どおり直前の漢字の連続すべてを土台とする。
   ============================================================ */
const RUBY_MODE_KEY = 'gosho_ruby_mode';
function getRubyMode(){
  try{ return localStorage.getItem(RUBY_MODE_KEY)==='paren'? 'paren' : 'ruby'; }catch(e){ return 'ruby'; }
}
// 全文表示モーダルに今表示している内容（表示方式を切り替えたときに描き直すため）
let FULLTEXT_MODAL_CURRENT = null;
function setRubyMode(mode){
  try{ localStorage.setItem(RUBY_MODE_KEY, mode==='paren'? 'paren' : 'ruby'); }catch(e){ /* noop */ }
  const sel = document.getElementById('rubyModeSelect');
  if(sel) sel.value = getRubyMode();
  const modal = document.getElementById('fullTextModal');
  if(modal && !modal.classList.contains('hidden') && FULLTEXT_MODAL_CURRENT){
    renderStructuredTextInto('fullTextModalBody', FULLTEXT_MODAL_CURRENT.text);
  }
}
function syncRubyModeSelect(){
  const sel = document.getElementById('rubyModeSelect');
  if(sel) sel.value = getRubyMode();
  const f = document.getElementById('pdfFontSelect');
  if(f) f.value = getPdfFont();
  const z = document.getElementById('pdfSizeSelect');
  if(z) z.value = String(getPdfSize());
}

/* ---------- PDFのフォントと文字サイズ（この端末に記憶する） ----------
   ブラウザの印刷は、その端末にある書体しか使えない（Webフォントは印刷に間に合わない恐れがあるため使わない）。
   作成したPDFには、使われた書体が埋め込まれるので、受け取る側の環境には依存しない。
   端末に無い書体は、スタックの次の候補に自動で置き換わる。 */
const PDF_FONT_KEY = 'gosho_pdf_font';
const PDF_SIZE_KEY = 'gosho_pdf_size';
const PDF_FONT_STACKS = {
  mincho: '"BIZ UDMincho","BIZ UD明朝 Medium","Hiragino Mincho ProN","ヒラギノ明朝 ProN","Yu Mincho","游明朝","Noto Serif JP",serif',
  gothic: '"BIZ UDPGothic","BIZ UDPゴシック","Hiragino Sans","ヒラギノ角ゴ ProN","Yu Gothic","游ゴシック","Noto Sans JP",sans-serif',
  meiryo: '"Meiryo UI","メイリオ",Meiryo,"Hiragino Sans","Noto Sans JP",sans-serif'
};
const PDF_SIZES = [9, 10, 10.5, 11, 12, 13, 14, 16, 18];
const PDF_NOTES_KEY = 'gosho_pdf_notes';             // PDFにAI解説をつけるか（'1'＝つける）
const PDF_NOTES_SIZE_KEY = 'gosho_pdf_notes_size';   // AI解説の文字サイズ（本文とは別）
const PDF_NOTES_SIZES = [7, 8, 9, 9.5, 10, 10.5, 11, 12, 13];
const PDF_NOTES_SIZE_DEFAULT = 9;
const PDF_SIZE_DEFAULT = 11;
function getPdfFont(){
  try{ const v = localStorage.getItem(PDF_FONT_KEY); return PDF_FONT_STACKS[v]? v : 'mincho'; }catch(e){ return 'mincho'; }
}
function setPdfFont(v){
  try{ localStorage.setItem(PDF_FONT_KEY, PDF_FONT_STACKS[v]? v : 'mincho'); }catch(e){}
  const f = document.getElementById('pdfFontSelect'); if(f) f.value = getPdfFont();
}
function getPdfSize(){
  try{ const n = parseFloat(localStorage.getItem(PDF_SIZE_KEY)); return PDF_SIZES.includes(n)? n : PDF_SIZE_DEFAULT; }catch(e){ return PDF_SIZE_DEFAULT; }
}
function setPdfSize(v){
  const n = parseFloat(v);
  try{ localStorage.setItem(PDF_SIZE_KEY, String(PDF_SIZES.includes(n)? n : PDF_SIZE_DEFAULT)); }catch(e){}
  const z = document.getElementById('pdfSizeSelect'); if(z) z.value = String(getPdfSize());
}

/* ---------- PDFにつけるAI解説（本文とは別の文字サイズ） ---------- */
function getPdfNotes(){ try{ return localStorage.getItem(PDF_NOTES_KEY)==='1'; }catch(e){ return false; } }
function setPdfNotes(on){
  try{ localStorage.setItem(PDF_NOTES_KEY, on ? '1' : '0'); }catch(e){}
  const c = document.getElementById('pdfNotesOn'); if(c) c.checked = getPdfNotes();
  const z = document.getElementById('pdfNotesSizeSelect'); if(z) z.disabled = !getPdfNotes();
}
function getPdfNotesSize(){
  try{ const n = parseFloat(localStorage.getItem(PDF_NOTES_SIZE_KEY)); return PDF_NOTES_SIZES.includes(n) ? n : PDF_NOTES_SIZE_DEFAULT; }catch(e){ return PDF_NOTES_SIZE_DEFAULT; }
}
function setPdfNotesSize(v){
  const n = parseFloat(v);
  try{ localStorage.setItem(PDF_NOTES_SIZE_KEY, String(PDF_NOTES_SIZES.includes(n) ? n : PDF_NOTES_SIZE_DEFAULT)); }catch(e){}
  const z = document.getElementById('pdfNotesSizeSelect'); if(z) z.value = String(getPdfNotesSize());
}
// 書き起こし1件分のAI解説（語句・人物・出来事）と注釈を、PDF用の一覧にする
function docPdfNotes(d){
  const list = [];
  ((d && d.aiNotes) || []).forEach(n=>{
    if(n && (n.item || n.desc)) list.push({item: n.item||'', reading: n.reading||'', desc: n.desc||'', source: n.source||'', credibility: n.credibility||'', category: n.category||'term'});
  });
  ((d && d.annotations) || []).forEach(a=>{
    const t = String(a||'').replace(/^※/,'').trim();
    if(t) list.push({item:'', reading:'', desc:t, source:'', credibility:'', category:'term'});
  });
  return list;
}
// 全文の画面の下に、「AI解説をつける」の欄を出す。AI解説が無い書き起こしでは、欄ごと隠す
function syncPdfNotesControl(notes){
  const box = document.getElementById('pdfNotesCtl'); if(!box) return;
  const n = (notes && notes.length) || 0;
  box.classList.toggle('hidden', !n);
  const cnt = document.getElementById('pdfNotesCount'); if(cnt) cnt.textContent = n ? '（'+n+'件）' : '';
  setPdfNotes(getPdfNotes());
  setPdfNotesSize(getPdfNotesSize());
}
function buildPdfNotesHtml(notes){
  if(!notes || !notes.length) return '';
  const catLabel = {person:'人物', term:'語句', event:'出来事'};
  const body = notes.map(n=>{
    const head = n.item ? `<span class="n-item">${escapeHtml(n.item)}</span>` + (n.reading && n.reading!==n.item ? `<span class="n-reading">（${escapeHtml(n.reading)}）</span>` : '') + `<span class="n-cat">${catLabel[n.category]||'語句'}</span><br>` : '';
    const desc = escapeHtml(n.desc).replace(/\n/g,'<br>');
    // 出典があるものだけ「（出典／信頼度）」を付ける（出典が無いものには、信頼度も付けない）
    const meta = n.source ? ` <span class="n-meta">（出典：${escapeHtml(n.source)}${n.credibility ? '／信頼度'+escapeHtml(n.credibility) : ''}）</span>` : '';
    return `<div class="pdf-note">${head}${desc}${meta}</div>`;
  }).join('');
  return `<section class="pdf-notes"><h2 class="pdf-notes-title">AI解説</h2>${body}</section>`;
}

const RUBY_KANJI = '\u4E00-\u9FFF\u3005';
// ふりがなの括弧の中に使える文字：読み（ひらがな・カタカナ・長音・区切りの「・」）と、末尾の注記記号（※など）。
// 注記記号は、ルビにせず、ルビを付けた語のあとに「(※)」の形で残す。例：舎利弗(しゃりほつ※) → 舎利弗にルビ「しゃりほつ」＋(※)
const RUBY_READING = 'ぁ-んァ-ヶー・';
const RUBY_NOTE_MARKS = '※＊†‡★☆';
const RUBY_SMALL_KANA = 'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ';
function toHiraganaKey(t){
  return String(t||'').replace(/[\u30A1-\u30F6]/g, c=>String.fromCharCode(c.charCodeAt(0)-0x60));
}
// 拍（モーラ）数：小さい「ゃゅょ」等は直前の文字と1拍なので数えない。「っ」「ん」「ー」は1拍
function rubyMoraCount(reading){
  let n = 0;
  for(const c of String(reading||'')) if(!RUBY_SMALL_KANA.includes(c) && c!=='・') n++;   // 小さい「ゃゅょ」と、区切りの「・」は数えない
  return n;
}

// 辞書：語（漢字のみ）→ 読み（ひらがな）の集合。出どころは、設定の辞書（手動登録＋Wordルビの自動蓄積）・
// AI解説の語句と読み・人物DBの氏名と読み。短時間は使い回す（表示のたびに作り直さない）
let _rubyDictCache = null, _rubyDictAt = 0;
function getRubyDict(){
  const now = Date.now();
  if(_rubyDictCache && now - _rubyDictAt < 2000) return _rubyDictCache;
  const map = new Map();
  const add = (base, reading)=>{
    base = String(base||'').replace(/[\s\u3000\u200B]/g,'');
    reading = toHiraganaKey(String(reading||'').replace(/[\s\u3000]/g,''));
    if(!base || !reading) return;
    if(!new RegExp('^['+RUBY_KANJI+']+$').test(base) || !/^[ぁ-んー]+$/.test(reading)) return;
    if(!map.has(base)) map.set(base, new Set());
    map.get(base).add(reading);
  };
  try{
    const st = (typeof STATE!=='undefined')? STATE : null;
    if(st){
      ((st.settings && st.settings.rubyDict) || []).forEach(line=>{
        const m = String(line).split(/[=＝]/);
        if(m.length>=2) add(m[0], m[1]);
      });
      (st.documents||[]).forEach(d=>(d.aiNotes||[]).forEach(n=>add(n.item, n.reading)));
      (st.persons||[]).forEach(p=>add(p.name, p.reading));
    }
  }catch(e){ /* noop */ }
  _rubyDictCache = map; _rubyDictAt = now;
  return map;
}
function invalidateRubyDict(){ _rubyDictCache = null; }

// 同じ本文内の根拠：読み → その読みが付いている漢字の連続（土台候補）の集合
function buildRubyEvidence(text){
  const ev = new Map();
  const re2 = new RegExp('(['+RUBY_KANJI+']+)(?:\\*\\*)?[（(](['+RUBY_READING+']{1,40})['+RUBY_NOTE_MARKS+']*[）)]','g');
  let m;
  while((m = re2.exec(String(text||'')))){
    const key = toHiraganaKey(m[2]);
    if(!ev.has(key)) ev.set(key, new Set());
    ev.get(key).add(m[1]);
  }
  return ev;
}

// 括弧の直前の漢字の連続（run）のうち、末尾の何文字を読みの対象（土台）とするかを返す
function rubyBaseLength(run, reading, explicit, evidence){
  const N = run.length;
  if(N<=1 || explicit) return N;
  const rd = toHiraganaKey(reading);
  // ②辞書：読みまで完全に一致する、最も長い末尾部分
  const dict = getRubyDict();
  for(let i=0;i<N;i++){
    const set = dict.get(run.slice(i));
    if(set && set.has(rd)) return N-i;
  }
  // ③同じ本文内の根拠：同じ読みが付いている、より短い語（自分自身の末尾部分）のうち最短のもの
  if(evidence){
    const set = evidence.get(rd);
    if(set){
      for(let i=N-1;i>=1;i--){            // 最短（末尾1文字）から順に探す
        if(set.has(run.slice(i))) return N-i;
      }
    }
  }
  // ④読みの長さ：読みが、全体の標準的な長さ（漢字1字あたり約2拍）より3拍以上短い場合のみ短縮
  const m = rubyMoraCount(rd);
  if(m < 2*N - 3){
    let best = null;
    for(let n=1;n<=N;n++){
      const d = Math.abs(m - 2*n);
      if(best===null || d<=best.d) best = {d, n};   // 同点は長いほうを採用
    }
    return best.n;
  }
  return N;
}

let _rubyEvidence = null;
function kanjiReadingToRuby(escapedLine, evidence){
  const str = String(escapedLine==null? '' : escapedLine);
  const mode = getRubyMode();
  // 手入力の「｜」は土台の始まりの目印。表示には出さない（ルビ・括弧書きのどちらの方式でも除去）
  const markRe = new RegExp('｜(?=['+RUBY_KANJI+']+(?:\\*\\*)?[（(]['+RUBY_READING+']{1,40}['+RUBY_NOTE_MARKS+']*[）)])','g');
  if(mode==='paren') return str.replace(markRe,'');
  const ev = evidence || _rubyEvidence || buildRubyEvidence(str);
  const re = new RegExp('(｜)?(['+RUBY_KANJI+']+)(\\*\\*)?([（(])(['+RUBY_READING+']{1,40})(['+RUBY_NOTE_MARKS+']*)([）)])','g');
  return str.replace(re, (m, mark, run, bold, open, reading, marks, close, offset)=>{
    const explicit = !!mark || str.charAt(offset-1)==='\u200B';
    const n = rubyBaseLength(run, reading, explicit, ev);
    const head = run.slice(0, run.length-n), base = run.slice(run.length-n);
    // 注記記号（※など）は、ルビにせず、ルビを付けた語のあとに「(※)」として残す
    return head + '<ruby>'+base+'<rt>'+reading+'</rt></ruby>'+(bold||'')+(marks ? open+marks+close : '');
  });
}
// エスケープ後の文字列に対してのみ **太字** → <strong> を適用する（安全な順序）
function inlineMarkdownToHtml(escapedLine){
  return kanjiReadingToRuby(escapedLine).replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
}

// 軽量構造化テキスト（#タイトル／##〜#####見出し4階層／:c:中央寄せ／-リスト（2階層まで）／**太字**）
// をHTMLに変換する。
// 重要：入力は必ず最初にHTMLエスケープしてから記号を解釈する（`<` `>` `&` 等でレイアウトが
// 壊れるのを防ぐ）。エスケープ後に追加する <h1>/<h2〜h5>/<li>/<strong> は解析対象外なので安全。
// 見出し4階層は取り込み元（Word/Webページ）の detectHeadingLevel と対応：
//   ## =レベル1（白太字・黒地）／### =レベル2（白太字・濃灰地）／
//   ####=レベル3（黒細字・淡灰地）／#####=レベル4（黒太字・地なし）
function renderStructuredText(text, evidenceOverride){
  const raw = (text==null? '' : String(text));
  const prevEvidence = _rubyEvidence;
  _rubyEvidence = evidenceOverride || buildRubyEvidence(raw);
  try{ return renderStructuredTextCore(raw); } finally { _rubyEvidence = prevEvidence; }
}
function renderStructuredTextCore(raw){
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
  const evidenceAll = buildRubyEvidence(raw);   // 分割して描画しても、本文全体を根拠にする
  function renderNextChunk(){
    const chunkLines = lines.slice(i, i+CHUNK_SIZE);
    const div = document.createElement('div');
    div.innerHTML = renderStructuredText(chunkLines.join('\n'), evidenceAll);
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
  const notes = (typeof currentFormAiNotes==='function') ? currentFormAiNotes() : [];
  FULLTEXT_MODAL_CURRENT = {title, text, notes};
  syncRubyModeSelect();
  syncPdfNotesControl(notes);
  renderStructuredTextInto('fullTextModalBody', text);
  const pdfBtn = document.getElementById('fullTextModalPdfBtn');
  if(pdfBtn) pdfBtn.onclick = ()=> openPdfPreview(title, text, {notes});
  if(typeof setFullTextWordBtn==='function') setFullTextWordBtn(title, text, notes);
  openModal('fullTextModal');
}

/* ============================================================
   PDF出力（方式A：ブラウザの印刷機能経由）
   @page の余白ボックス（ヘッダー・フッター・ページ番号）はSafari 18.2/Chrome 131以降で
   対応。非対応の古いブラウザでも最低限タイトルは本文内に表示されるようフォールバックする。
   ============================================================ */
function buildPrintableHtml(title, bodyHtml, opts){
  opts = opts || {};
  const fontStack = PDF_FONT_STACKS[opts.font] || PDF_FONT_STACKS.mincho;
  const basePt = PDF_SIZES.includes(Number(opts.size))? Number(opts.size) : PDF_SIZE_DEFAULT;
  const notesPt = PDF_NOTES_SIZES.includes(Number(opts.notesSize)) ? Number(opts.notesSize) : PDF_NOTES_SIZE_DEFAULT;
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
  /* 本文の基準サイズ（${basePt}pt）。見出し・題名・余白は、この基準に対する倍率（em）で決めているので、
     基準を変えると一緒に大きく／小さくなる（標準の11ptのときに従来と同じ大きさ） */
  body{
    font-family: ${fontStack};
    font-size: ${basePt}pt; line-height: 1.9; color:#1c1c1c; margin:0; padding:0;
  }
  .print-title{
    font-size:1.636em; font-weight:700; text-align:center; margin: 0 0 1.636em 0;
    border-bottom: 2px solid #1c2b4a; padding-bottom: 0.9em;
  }
  h1{ font-size:1.455em; margin: 1.8em 0 0.9em; }
  h2.heading-lvl1, h3.heading-lvl2, h4.heading-lvl3, h5.heading-lvl4{
    margin: 1.45em auto 0.73em; padding: 0.27em 0.9em; border-radius: 3pt; display:table; text-align:center;
  }
  h2.heading-lvl1{ background:#000; color:#fff; font-weight:700; font-size:1.18em; }
  h3.heading-lvl2{ background:#555; color:#fff; font-weight:700; font-size:1.136em; }
  h4.heading-lvl3{ background:#ddd; color:#1c1c1c; font-weight:400; font-size:1.09em; }
  h5.heading-lvl4{ background:transparent; color:#1c1c1c; font-weight:700; font-size:1.09em; padding:0; }
  p{ margin: 0 0 0.9em; }
  p.align-center{ text-align:center; }
  ul{ margin: 0 0 0.9em 0; padding-left: 1.4em; }
  li{ margin-bottom: 0.36em; }
  strong{ font-weight:700; }
  ruby{ ruby-align: center; }
  rt{ font-size:0.5em; color:#1c1c1c; font-weight:400; }
  .print-footnote{ margin-top: 2.2em; font-size:0.77em; color:#999; text-align:center; }
  /* AI解説：本文とは別の文字サイズ（${notesPt}pt）。本文のあと、新しいページから始める */
  .pdf-notes{ break-before: page; page-break-before: always; font-size:${notesPt}pt; line-height:1.8; }
  .pdf-notes-title{ font-size:1.3em; text-align:center; margin:0 0 1em; padding-bottom:0.5em; border-bottom:1.5px solid #1c2b4a; }
  .pdf-note{ margin:0 0 0.8em; break-inside: avoid; page-break-inside: avoid; }
  .pdf-note .n-item{ font-weight:700; }
  .pdf-note .n-reading{ color:#555; }
  .pdf-note .n-cat{ display:inline-block; font-size:0.8em; color:#fff; background:#6b7080; padding:0 0.5em; border-radius:3pt; margin-left:0.5em; vertical-align:0.1em; }
  .pdf-note .n-meta{ color:#666; font-size:0.92em; }
</style>
</head><body>
  <div class="print-title">${esc}</div>
  ${bodyHtml}
  ${opts.notesHtml||''}
  <p class="print-footnote">※ ご利用の環境（主に2024年12月より前のiOS/Safari）によっては、ページ番号・ヘッダーが印刷されない場合があります。</p>
</body></html>`;
}

// 「PDF出力」ボタンの共通処理：印刷用ウィンドウを開いてブラウザの印刷ダイアログを呼び出す
// opts.notes＝この書き起こしのAI解説の一覧（docPdfNotes の結果）。「AI解説をつける」がオンのときだけ、本文のあとにつける
function openPdfPreview(title, text, opts){
  opts = opts || {};
  const bodyHtml = renderStructuredText(text||'');
  const notesHtml = (getPdfNotes() && opts.notes && opts.notes.length) ? buildPdfNotesHtml(opts.notes) : '';
  const html = buildPrintableHtml(title, bodyHtml, {font: getPdfFont(), size: getPdfSize(), notesHtml, notesSize: getPdfNotesSize()});
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
