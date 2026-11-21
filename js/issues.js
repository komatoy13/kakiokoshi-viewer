/* ============================================================
   issues.js — 法論資料（論点別の発言一覧）…編集アプリ・ビューア共通
   ・「論点」＝法論で使うための分類名（例：「正本堂を戒壇と意義付けた」「田中智学について語ったもの」）。
     登録した御文（発言）に、複数付けられる（御文側は issueTagIds＝論点IDの配列）。論点の一覧は STATE.issueTags。
     年表の絞り込み用のテーマタグ（themes.js）とは、別のもの。
   ・話者の種類（御書マスターの種類）で絞れる。最初は、池田大作・細井日達・阿部日顕・歴代上人（正師御文）。
     日興上人・日目上人・日寛上人は含めない。早瀬日如・浅井先生・浅井会長なども、チェックすれば加えられる。
   ・論点を選ぶと、論点ごとの見出しの下に、発言を一覧で並べる。コピー・PDF・Wordで書き出せる。
   ・論点を付ける・直す処理（分類する画面・論点の管理）は、編集アプリ専用の issues-editor.js にある。
   ※ db.js・render.js・docx-export.js の後に読み込むこと
   ============================================================ */
const ISSUE_COLORS = ['#b0486b','#3b6ea5','#c0652d','#2f8f6f','#7a5aa6','#8a7a2a','#2c7f8f','#6b6f7a'];
const ISSUE_DEFAULT_KINDS = ['ikeda','hosoi','abe','shoshi'];
const HR = {issueSel: [], kinds: null, q: '', limit: 60, edit: false, unclassified: false, selected: new Set()};

function issueTags(){ return (Array.isArray(STATE.issueTags) ? STATE.issueTags : []).slice().sort((a,b)=>(a.order||0)-(b.order||0)); }
function issueTagById(id){ return issueTags().find(t=>t.id===id) || null; }
function issueIdsOf(c){ return (c && Array.isArray(c.issueTagIds)) ? c.issueTagIds : []; }
function issueChipHtml(t){ return `<span class="theme-chip" style="--tc:${escapeHtml(t.color||'#6b6f7a')}">${escapeHtml(t.name)}</span>`; }
function houronKindLabel(kind){ return kind==='shoshi' ? '歴代上人（正師御文）' : (GOSHO_KIND_LABEL[kind] || kind); }
function houronKinds(){ if(!HR.kinds) HR.kinds = new Set(ISSUE_DEFAULT_KINDS); return HR.kinds; }
// 種類の並び：最初の4つ（池田・細井・阿部・歴代上人）、そのあと御書マスターの種類の順
function houronKindOrder(){ return ISSUE_DEFAULT_KINDS.concat(Object.keys(GOSHO_KIND_LABEL).filter(k=>!ISSUE_DEFAULT_KINDS.includes(k))); }

/* ---------- 対象の御文 ---------- */
function houronAll(){
  return STATE.citations.map((c,idx)=>{ const rec = goshoRecordById(c.goshoId); return rec ? {c, rec, idx, kind: rec.kind || 'gosho'} : null; }).filter(Boolean);
}
function houronSourceLabel(x){
  const bk = [x.c.book, x.c.chapter].filter(Boolean).join(' ');
  return goshoRecordLabel(x.rec) + (bk ? '（'+bk+'）' : '');
}
function houronSpeaker(x){
  const k = houronKindLabel(x.kind), au = x.rec.author || '';
  return (au && !k.includes(au) && !PERSON_KIND_NAMES[x.kind]) ? k+'／'+au : k;
}
function houronFiltered(){
  const kinds = houronKinds(), q = HR.q.trim().toLowerCase(), order = houronKindOrder();
  return houronAll().filter(x=>kinds.has(x.kind) && (!q || (String(x.c.text||'')+' '+houronSourceLabel(x)+' '+(x.rec.author||'')).toLowerCase().includes(q)))
    .sort((a,b)=> order.indexOf(a.kind)-order.indexOf(b.kind) || String(a.rec.name||'').localeCompare(String(b.rec.name||''),'ja') || a.idx-b.idx);
}

/* ---------- 画面の部品 ---------- */
function houronIssueButtons(items){
  const tags = issueTags();
  if(!tags.length) return '<span class="text-xs text-gray-400">論点がまだ登録されていません。</span>';
  return tags.map(t=>{
    const n = items.filter(x=>issueIdsOf(x.c).includes(t.id)).length, on = HR.issueSel.includes(t.id);
    return `<button type="button" class="filter-btn theme-btn${on?' active':''}" style="--tc:${escapeHtml(t.color||'#6b6f7a')}" onclick="houronToggleIssue('${t.id}')"><span class="theme-dot"></span>${escapeHtml(t.name)}（${n}）</button>`;
  }).join('') + (HR.issueSel.length ? '<button type="button" class="text-xs underline ml-1" style="color:var(--navy)" onclick="houronClearIssues()">選択を解除</button>' : '');
}
function houronKindChecks(){
  const all = houronAll(), kinds = houronKinds(), order = houronKindOrder();
  const cnt = k=>all.filter(x=>x.kind===k).length;
  const chk = k=>`<label class="text-xs flex items-center gap-1"><input type="checkbox" ${kinds.has(k)?'checked':''} onchange="houronSetKind('${k}',this.checked)">${escapeHtml(houronKindLabel(k))}（${cnt(k)}）</label>`;
  const main = ISSUE_DEFAULT_KINDS.map(chk).join('');
  const others = order.filter(k=>!ISSUE_DEFAULT_KINDS.includes(k) && (cnt(k) || kinds.has(k)));
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-1">${main}</div>`
    + (others.length ? `<details class="mt-1"${others.some(k=>kinds.has(k))?' open':''}><summary class="text-xs cursor-pointer" style="color:var(--navy)">そのほかの種類を加える</summary><div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">${others.map(chk).join('')}</div></details>` : '');
}
function houronExportControls(){
  const opt = (v,l,cur)=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${l}</option>`;
  const sizes = PDF_SIZES.map(n=>opt(n, n+'pt', getPdfSize())).join('');
  return `<div class="flex flex-wrap items-center gap-2 mt-3 p-2 rounded-lg" style="background:var(--paper-dim)">
    <span class="text-xs font-semibold" style="color:var(--navy)">書き出し</span>
    <label class="text-xs flex items-center gap-1">ふりがな <select class="field-select text-xs" style="width:auto" onchange="setRubyMode(this.value)">${opt('ruby','ルビ',getRubyMode())}${opt('paren','括弧書き',getRubyMode())}</select></label>
    <label class="text-xs flex items-center gap-1">フォント <select class="field-select text-xs" style="width:auto" onchange="setPdfFont(this.value)">${opt('mincho','明朝体',getPdfFont())}${opt('gothic','ゴシック体',getPdfFont())}${opt('meiryo','Meiryo UI',getPdfFont())}</select></label>
    <label class="text-xs flex items-center gap-1">文字サイズ <select class="field-select text-xs" style="width:auto" onchange="setPdfSize(this.value)">${sizes}</select></label>
    <button type="button" class="btn btn-outline text-xs" onclick="houronCopy()"><i class="fa-solid fa-copy"></i>コピー</button>
    <button type="button" class="btn btn-gold text-xs" onclick="houronPdf()"><i class="fa-solid fa-file-pdf"></i>PDF出力</button>
    <button type="button" class="btn btn-gold text-xs" onclick="houronWord()"><i class="fa-solid fa-file-word"></i>Word出力</button></div>`;
}

/* ---------- 論点ごとの一覧（見る） ---------- */
function houronGroups(items){
  const tags = issueTags(), sel = HR.issueSel;
  const use = sel.length ? tags.filter(t=>sel.includes(t.id)) : tags;
  return use.map(t=>({tag: t, items: items.filter(x=>issueIdsOf(x.c).includes(t.id))})).filter(g=>g.items.length || sel.length);
}
function houronText(groups, plain){
  return groups.map(g=>{
    const head = plain ? `■ ${g.tag.name}（${g.items.length}件）` : `## ${g.tag.name}（${g.items.length}件）`;
    const body = g.items.map(x=>{
      const src = `【${houronSpeaker(x)}】${houronSourceLabel(x)}`;
      return (plain ? src : `**${src}**`) + '\n\n' + String(x.c.text||'').trim();
    }).join('\n\n');
    return head + '\n\n' + (body || '（該当する発言はありません）');
  }).join('\n\n');
}
function houronTitle(groups){
  const names = groups.map(g=>g.tag.name);
  return '法論資料：' + (names.length && names.length<=3 ? names.join('・') : '論点別の発言一覧');
}
function houronCurrentGroups(){ return houronGroups(houronFiltered()); }
function houronCopy(){
  const text = houronText(houronCurrentGroups(), true);
  if(!text.trim()){ alert('一覧に出ている発言がありません。'); return; }
  const done = ()=>alert('一覧をコピーしました。');
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, ()=>{ houronCopyFallback(text); done(); });
  else { houronCopyFallback(text); done(); }
}
function houronCopyFallback(text){ const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(t); }
function houronPdf(){
  const g = houronCurrentGroups(); if(!g.length){ alert('一覧に出ている発言がありません。'); return; }
  openPdfPreview(houronTitle(g), houronText(g, false), {});
}
function houronWord(){
  const g = houronCurrentGroups(); if(!g.length){ alert('一覧に出ている発言がありません。'); return; }
  exportWord(houronTitle(g), houronText(g, false), {});
}
function houronItemHtml(x, extra){
  const others = issueIdsOf(x.c).map(issueTagById).filter(Boolean).map(issueChipHtml).join('');
  return `<div class="hr-item">${extra||''}<div class="hr-head"><span class="hr-speaker">${escapeHtml(houronSpeaker(x))}</span> <span class="hr-src">${escapeHtml(houronSourceLabel(x))}</span></div>
    <div class="hr-text">${escapeHtml(String(x.c.text||'').trim())}</div>${others && !extra ? '<div class="flex flex-wrap gap-1 mt-2">'+others+'</div>' : ''}</div>`;
}
function houronRenderView(items){
  const list = document.getElementById('houronList'); if(!list) return;
  const groups = houronGroups(items);
  if(!groups.length){
    list.innerHTML = '<div class="panel p-4 text-sm text-gray-500">' + (issueTags().length ? '分類された発言がありません。話者の種類を増やすか、論点を選び直してみてください。' : '論点がまだ登録されていません。') + '</div>'; return;
  }
  let shown = 0, h = '';
  groups.forEach(g=>{
    h += `<div class="panel p-4 mb-3"><h3 class="hr-group" style="--tc:${escapeHtml(g.tag.color||'#6b6f7a')}"><span class="theme-dot"></span>${escapeHtml(g.tag.name)}<span class="hr-count">${g.items.length}件</span></h3>`;
    if(!g.items.length) h += '<p class="text-xs text-gray-400">該当する発言はありません。</p>';
    g.items.forEach(x=>{ if(shown < HR.limit){ h += houronItemHtml(x); shown++; } });
    h += '</div>';
  });
  const total = groups.reduce((s,g)=>s+g.items.length,0);
  if(total > shown) h += `<button type="button" class="btn btn-outline text-xs w-full mb-3" onclick="HR.limit+=60;renderHouron()">さらに表示（残り ${total-shown}件）</button>`;
  list.innerHTML = h;
}

/* ---------- 画面全体 ---------- */
function renderHouron(){
  const ctl = document.getElementById('houronControls'); if(!ctl) return;
  const items = houronFiltered();
  const edit = !!(HR.edit && typeof houronRenderEdit==='function');
  ctl.innerHTML = (typeof houronModeHtml==='function' ? houronModeHtml() : '')
    + `<p class="text-xs font-semibold mb-1" style="color:var(--gray)">論点${edit?'（選ぶと、その論点が付いた発言だけ表示）':'（選ぶ。選ばないときは、すべての論点）'}</p><div class="flex flex-wrap items-center gap-1 mb-3">${houronIssueButtons(items)}</div>`
    + `<p class="text-xs font-semibold mb-1" style="color:var(--gray)">話者の種類</p>${houronKindChecks()}`
    + `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"><input type="text" class="field-input" placeholder="発言・出典で探す（入力して確定）" value="${escapeHtml(HR.q)}" onchange="HR.q=this.value;HR.limit=60;renderHouron()">`
    + (edit ? `<label class="text-xs flex items-center gap-2"><input type="checkbox" ${HR.unclassified?'checked':''} onchange="HR.unclassified=this.checked;HR.limit=60;renderHouron()">論点が付いていない発言だけ表示</label>` : '<span></span>') + '</div>'
    + (edit ? '' : houronExportControls());
  const bar = document.getElementById('houronApplyBar');
  if(edit){ houronRenderEdit(items); }
  else { houronRenderView(items); if(bar){ bar.innerHTML = ''; bar.classList.add('hidden'); } }
}
function houronToggleIssue(id){ const i = HR.issueSel.indexOf(id); if(i>=0) HR.issueSel.splice(i,1); else HR.issueSel.push(id); HR.limit = 60; renderHouron(); }
function houronClearIssues(){ HR.issueSel = []; HR.limit = 60; renderHouron(); }
function houronSetKind(k, on){ const s = houronKinds(); if(on) s.add(k); else s.delete(k); HR.limit = 60; renderHouron(); }
