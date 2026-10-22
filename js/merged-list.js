/* ============================================================
   merged-list.js — 「結合した御書」の一覧タブ（編集アプリ・公開ビューアの共通）
   ------------------------------------------------------------
   御書ごとに、結合済みの文面（統合御書文面）と、元になる御文（文書の御文・解説書の御文）を見る画面。
   ・結合済みの御書：結合した文面を開く／PDFにする／元の御文の出所を見る
   ・未結合の御書　：取り込み済みの御文を、出所つきで順に開く
   ・編集アプリでは、さらに「結合タブで開く」「結合済み文面の削除」ができる（ビューアでは閲覧のみ）
   ※ db.js・render.js の後、app.js／viewer.js の前に読み込むこと
   ============================================================ */

const ML = { query:'', kind:'', status:'', openIds:new Set() };

// 結合タブ（merge.js）がある＝編集アプリ。ビューアには無いので、編集用のボタンは出さない
function mlIsEditor(){ return typeof onMergeGoshoChange === 'function' && typeof requestDelete === 'function'; }
function mlEsc(s){ return escapeHtml(String(s==null?'':s)); }

// 御書1件ぶんの、元になる御文（文書の御文 → 解説書の御文の順）
function mlFragments(goshoId){
  const docs = (STATE.documents||[])
    .filter(d=> d.goshoId===goshoId && (d.honbun||'').trim())
    .sort((a,b)=> (a.seirekiYear||0)-(b.seirekiYear||0) || (a.seirekiMonth||0)-(b.seirekiMonth||0) || (a.seirekiDay||0)-(b.seirekiDay||0))
    .map(d=>({kind:'doc', label:(d.title||'（無題）')+(d.author? '・'+d.author : ''), note:'', text:d.honbun}));
  const cits = (STATE.citations||[])
    .filter(c=> c.status==='ok' && c.goshoId===goshoId && String(c.text||'').trim())
    .map(c=>({kind:'cit', label:((c.book||'')+' '+(c.chapter||'')).trim() || '解説書',
      note:[c.sourceName? '本文の表記：'+c.sourceName : '', c.section||''].filter(Boolean).join('／'), text:c.text}));
  return docs.concat(cits);
}

// 一覧に出す項目：結合済みの文面がある御書、または元になる御文がある御書
function mlEntries(){
  const map = new Map();
  const get = id=>{ if(!map.has(id)) map.set(id, {goshoId:id, merged:null}); return map.get(id); };
  (STATE.mergedGoshos||[]).forEach(m=>{ if(m.goshoId && String(m.text||'').trim()) get(m.goshoId).merged = m; });
  (STATE.documents||[]).forEach(d=>{ if(d.goshoId && (d.honbun||'').trim()) get(d.goshoId); });
  (STATE.citations||[]).forEach(c=>{ if(c.status==='ok' && c.goshoId && String(c.text||'').trim()) get(c.goshoId); });
  const list = [];
  map.forEach(e=>{
    e.rec = goshoRecordById(e.goshoId);
    e.title = e.rec ? goshoRecordLabel(e.rec) : (e.merged ? (e.merged.title||'（不明な御書）') : '（不明な御書）');
    e.kind = e.rec ? goshoKindOf(e.rec) : 'gosho';
    e.frags = mlFragments(e.goshoId);
    e.nDoc = e.frags.filter(f=>f.kind==='doc').length;
    e.nCit = e.frags.filter(f=>f.kind==='cit').length;
    if(e.merged || e.frags.length) list.push(e);
  });
  const kinds = Object.keys(GOSHO_KIND_LABEL);
  list.sort((a,b)=> kinds.indexOf(a.kind)-kinds.indexOf(b.kind) || a.title.localeCompare(b.title,'ja'));
  return list;
}

function mlFmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();
}

function mlBuildFilters(){
  const kSel = document.getElementById('mlKind'), sSel = document.getElementById('mlStatus');
  if(kSel && !kSel.dataset.built){
    kSel.innerHTML = '<option value="">すべての種類</option>' + Object.keys(GOSHO_KIND_LABEL).map(k=>`<option value="${k}">${mlEsc(GOSHO_KIND_LABEL[k])}</option>`).join('');
    kSel.dataset.built = '1';
  }
  if(sSel && !sSel.dataset.built){
    sSel.innerHTML = '<option value="">結合済み・未結合の両方</option><option value="merged">結合済みだけ</option><option value="unmerged">未結合だけ</option>';
    sSel.dataset.built = '1';
  }
}
function onMlSearch(){ ML.query = (document.getElementById('mlSearch').value||'').trim(); renderMergedList(); }
function onMlFilter(){
  ML.kind = document.getElementById('mlKind').value;
  ML.status = document.getElementById('mlStatus').value;
  renderMergedList();
}

function renderMergedList(){
  const box = document.getElementById('mlList');
  if(!box) return;
  mlBuildFilters();
  const all = mlEntries();
  const q = ML.query;
  const shown = all.filter(e=>{
    if(ML.kind && e.kind!==ML.kind) return false;
    if(ML.status==='merged' && !e.merged) return false;
    if(ML.status==='unmerged' && e.merged) return false;
    if(q){
      const hay = e.title + ' ' + (e.merged? e.merged.text : '') + ' ' + e.frags.map(f=>f.text+' '+f.note).join(' ');
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const nMerged = all.filter(e=>e.merged).length;
  const head = `<p class="text-xs text-gray-400 mb-2">${all.length}件（結合済み${nMerged}件・未結合${all.length-nMerged}件）${shown.length!==all.length? '　／　絞り込み：'+shown.length+'件' : ''}</p>`;
  if(!all.length){
    box.innerHTML = head + '<p class="text-sm text-gray-400 py-6 text-center">まだ、結合した御書や、取り込んだ御文がありません。</p>';
    return;
  }
  if(!shown.length){
    box.innerHTML = head + '<p class="text-sm text-gray-400 py-6 text-center">条件に合う御書がありません。</p>';
    return;
  }
  let lastKind = null, html = head;
  shown.forEach(e=>{
    if(e.kind!==lastKind){
      html += `<h4 class="font-display text-sm mt-4 mb-2" style="color:var(--navy)">${mlEsc(GOSHO_KIND_LABEL[e.kind]||'')}</h4>`;
      lastKind = e.kind;
    }
    const open = ML.openIds.has(e.goshoId);
    const preview = e.merged ? e.merged.text : (e.frags[0] ? e.frags[0].text : '');
    const sources = e.frags.map(f=>`<li class="text-xs text-gray-500" style="line-height:1.7">${f.kind==='doc'?'文書':'解説書'}：${mlEsc(f.label)}${f.note? '（'+mlEsc(f.note)+'）':''}</li>`).join('');
    const mergedInfo = e.merged
      ? `<span class="chip" style="background:var(--gold-soft)">結合済み</span>`
      : `<span class="chip">未結合</span>`;
    html += `<div class="panel p-3 mb-2">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold text-sm" style="color:var(--navy)">${mlEsc(e.title)}</span>
        ${mergedInfo}
        <span class="text-xs text-gray-400">御文：文書${e.nDoc}件・解説書${e.nCit}件${e.merged? '／更新 '+mlEsc(mlFmtDate(e.merged.updatedAt||e.merged.createdAt)) : ''}</span>
      </div>
      <p class="text-sm mt-1 clamp2" style="line-height:1.8">${mlEsc(String(preview).replace(/\s+/g,' '))}</p>
      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <button type="button" class="btn btn-outline text-xs" onclick="mlOpen('${e.goshoId}')"><i class="fa-solid fa-book-open"></i>${e.merged?'結合した文面を開く':'御文を開く'}</button>
        <button type="button" class="text-xs" style="color:var(--navy);text-decoration:underline" onclick="mlToggleSources('${e.goshoId}')">${open?'▲出典を閉じる':'▼元の御文の出典'}</button>
        ${mlIsEditor()? `<button type="button" class="btn btn-outline text-xs ml-auto" onclick="mlEditInMerge('${e.goshoId}')"><i class="fa-solid fa-puzzle-piece"></i>結合タブで開く</button>` : ''}
        ${(mlIsEditor() && e.merged)? `<button type="button" class="btn btn-outline btn-icon text-xs" onclick="mlDeleteMerged('${e.goshoId}')" title="結合済みの文面を削除（元の御文は残ります）" aria-label="結合済みの文面を削除"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
      ${open? `<ul class="mt-2 pl-4" style="list-style:disc">${sources || '<li class="text-xs text-gray-400">元の御文はありません。</li>'}</ul>` : ''}
    </div>`;
  });
  box.innerHTML = html;
}

function mlToggleSources(goshoId){
  if(ML.openIds.has(goshoId)) ML.openIds.delete(goshoId); else ML.openIds.add(goshoId);
  renderMergedList();
}

// 結合した文面（なければ、御文を出所つきで順に並べたもの）を、全文モーダルで開く
function mlOpen(goshoId){
  const e = mlEntries().find(x=>x.goshoId===goshoId);
  if(!e) return;
  let text;
  if(e.merged){
    text = e.merged.text;
  } else {
    text = e.frags.map(f=> String(f.text).trim() + '\n（出典：' + f.label + (f.note? '／'+f.note : '') + '）').join('\n\n');
  }
  document.getElementById('fullTextModalTitle').innerHTML = '<i class="fa-solid fa-puzzle-piece mr-2"></i>'+mlEsc(e.title);
  if(typeof syncRubyModeSelect==='function') syncRubyModeSelect();
  renderStructuredTextInto('fullTextModalBody', text);
  const pdfBtn = document.getElementById('fullTextModalPdfBtn');
  if(pdfBtn) pdfBtn.onclick = ()=> openPdfPreview(e.title, text);
  openModal('fullTextModal');
}

// ---- 編集アプリのみ ----
function mlEditInMerge(goshoId){
  STATE.mergeSelectedGoshoId = goshoId;
  switchTab('merge');
}
function mlDeleteMerged(goshoId){
  const e = mlEntries().find(x=>x.goshoId===goshoId);
  if(!e || !e.merged) return;
  requestDelete('「'+e.title+'」の結合済み文面（元の御文は残ります）', ()=>{
    STATE.mergedGoshos = STATE.mergedGoshos.filter(m=>m.goshoId!==goshoId);
    persistAll();
    renderMergedList();
  });
}
