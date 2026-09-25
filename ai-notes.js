/* ============================================================
   ai-notes.js — AI解説
   50音順辞書表示、個別編集、カテゴリ・語句検索、
   他文書での使用箇所の横断検索、同名語句の統合、出典表示
   ※ db.js の後に読み込むこと
   ============================================================ */

const CRED_COLOR = {A:'#2f9e6f', B:'#d9822b', C:'#8a8f9c'};
const NOTE_CATEGORY_LABEL = {person:'人物', term:'語句', event:'出来事'};

function setNoteCategoryFilter(cat){
  STATE.noteCategoryFilter = cat;
  document.querySelectorAll('[data-catfilter]').forEach(b=>b.classList.toggle('active', b.dataset.catfilter===cat));
  renderTerms();
}

// 全御書のAI解説を横断収集し、カテゴリ・検索で絞り込んだ上で読み（ふりがな）の50音順に整列する
function collectAllNotes(){
  const flat = [];
  STATE.documents.forEach(d=>{
    (d.aiNotes||[]).forEach((n,idx)=>{
      flat.push({docId:d.id, index:idx, docTitle:d.title, docMgmt:d.managementNumber,
        item:n.item||'', reading:n.reading||n.item||'', desc:n.desc||'', source:n.source||'',
        credibility:n.credibility||'C', category:n.category||'term'});
    });
    (d.annotations||[]).forEach(a=>{
      flat.push({docId:d.id, index:-1, docTitle:d.title, docMgmt:d.managementNumber,
        item:'', reading:'', desc:a.replace(/^※/,'').trim(), source:'', credibility:'C', category:'term'});
    });
  });
  flat.forEach(n=>{ if(!n.reading) n.reading = n.item || n.desc.slice(0,10); });
  return flat;
}

function renderTerms(){
  const catFilter = STATE.noteCategoryFilter || 'all';
  const q = (document.getElementById('noteSearch')?.value||'').trim().toLowerCase();
  let flat = collectAllNotes();

  // 同名語句のグループを検出し、[統合]ボタンの表示判定に使う
  const groupCount = {};
  flat.forEach(n=>{ if(n.item){ const k=n.item.trim(); groupCount[k]=(groupCount[k]||0)+1; } });
  flat.forEach(n=>{ n.hasDuplicate = !!(n.item && groupCount[n.item.trim()]>1); });

  if(catFilter!=='all') flat = flat.filter(n=>n.category===catFilter);
  if(q) flat = flat.filter(n=> (n.item||'').toLowerCase().includes(q) || (n.reading||'').toLowerCase().includes(q) || (n.desc||'').toLowerCase().includes(q));
  flat.sort((a,b)=> (a.reading||'').localeCompare(b.reading||'', 'ja'));

  const container = document.getElementById('termsContainer');
  if(flat.length===0){ container.innerHTML='<p class="text-sm text-gray-400 py-10 text-center">該当するAI解説がありません</p>'; return; }

  let html = '';
  let lastInitial = null;
  flat.forEach(n=>{
    const initial = (n.reading||'').charAt(0) || '#';
    if(initial!==lastInitial){
      html += `<div class="flex items-center gap-3 mt-6 mb-2 first:mt-0"><span class="font-display text-2xl" style="color:var(--gold)">${escapeHtml(initial)}</span><div class="flex-1 h-px" style="background:var(--line)"></div></div>`;
      lastInitial = initial;
    }
    html += renderNoteCard(n);
  });
  container.innerHTML = html;
  setupNoteDescToggles(container);
}

function renderNoteCard(n){
  const catLabel = NOTE_CATEGORY_LABEL[n.category] || '語句';
  return `<div class="p-4 rounded-lg panel mb-2">
    <div class="flex items-start gap-3">
      <span class="cred-badge" style="background:${CRED_COLOR[n.credibility]||CRED_COLOR.C}">${escapeHtml(n.credibility||'C')}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-wrap gap-2">
          ${n.item? `<p class="text-base font-semibold">${escapeHtml(n.item)}</p>` : ''}
          ${n.reading && n.reading!==n.item? `<span class="text-xs text-gray-400">（${escapeHtml(n.reading)}）</span>` : ''}
          <span class="chip">${catLabel}</span>
          ${n.hasDuplicate? '<span class="chip" style="background:#fde7c7;color:#9a6a1f">同名あり</span>' : ''}
        </div>
        <p class="note-desc clamp-2 text-sm text-gray-600 mt-1" style="white-space:pre-wrap">${escapeHtml(n.desc)}</p>
        <button type="button" class="note-desc-toggle hidden" onclick="toggleNoteDesc(this)">▼ 続きを読む</button>
        <p class="text-[11px] text-gray-400 mt-1">出典御書：${escapeHtml(n.docTitle||'')}${n.docMgmt?'（'+escapeHtml(n.docMgmt)+'）':''}</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <button class="btn btn-outline text-xs" onclick="openSourcePopup('${n.docId}',${n.index})"><i class="fa-solid fa-book"></i>出典</button>
          ${n.item? `<button class="btn btn-outline text-xs" onclick="openCrossUsage('${n.docId}',${n.index})"><i class="fa-solid fa-magnifying-glass"></i>他での使用</button>` : ''}
          ${n.index>=0? `<button class="btn btn-outline text-xs" onclick="openNoteEdit('${n.docId}',${n.index})"><i class="fa-solid fa-pen"></i>編集</button>` : ''}
          ${n.hasDuplicate && n.index>=0? `<button class="btn btn-gold text-xs" onclick="mergeDuplicateNotes('${n.docId}',${n.index})"><i class="fa-solid fa-code-merge"></i>統合</button>` : ''}
          ${n.index>=0? `<button class="btn btn-danger text-xs" onclick="deleteNote('${n.docId}',${n.index})"><i class="fa-solid fa-trash"></i>削除</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function deleteNote(docId, index){
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d || !d.aiNotes || !d.aiNotes[index]) return;
  const label = d.aiNotes[index].item || '（語句なしのAI解説）';
  requestDelete(label, ()=>{
    // 確認中に並びが変わっていても正しい項目を消せるよう、実行時に改めて位置を確認する
    const cur = STATE.documents.find(x=>x.id===docId);
    if(!cur || !cur.aiNotes || !cur.aiNotes[index]) return;
    cur.aiNotes.splice(index,1);
    persistAll();
    renderTerms();
  });
}

// AI解説の解説文：2行で省略表示 ⇄ 全文展開
function toggleNoteDesc(btn){
  const p = btn.previousElementSibling;
  if(!p) return;
  const collapsed = p.classList.toggle('clamp-2');
  btn.textContent = collapsed? '▼ 続きを読む' : '▲ 折りたたむ';
}
// 描画後に、2行を超える解説文にだけ「▼続きを読む」を出す
function setupNoteDescToggles(root){
  (root||document).querySelectorAll('.note-desc.clamp-2').forEach(p=>{
    const btn = p.nextElementSibling;
    if(!btn || !btn.classList.contains('note-desc-toggle')) return;
    // 画面が非表示（高さ0）の時は測れないため、文字数で代用する
    const overflow = p.clientHeight>0 ? (p.scrollHeight > p.clientHeight+1) : (p.textContent.length>40);
    btn.classList.toggle('hidden', !overflow);
  });
}

// 御書一覧・講義タブへ切り替えて該当ドキュメントを編集フォームに読み込む（他での使用ポップアップから使用）
function switchToIntakeAndEdit(docId){
  closeModal('crossUsageModal');
  const tabBtn = document.querySelector('[data-tab="intake"]');
  if(tabBtn) tabBtn.click();
  editDoc(docId);
}

// 他の御書・御指導の本文の中に、この語句が含まれていないか横断検索する
function openCrossUsage(docId, index){
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d || !d.aiNotes || !d.aiNotes[index]) return;
  const term = (d.aiNotes[index].item||'').trim();
  document.getElementById('crossUsageTitle').innerHTML = '<i class="fa-solid fa-magnifying-glass mr-2"></i>「'+escapeHtml(term)+'」の他での使用箇所';
  const body = document.getElementById('crossUsageBody');
  if(!term){
    body.innerHTML = '<p class="text-sm text-gray-400">検索対象の語句がありません</p>';
    openModal('crossUsageModal');
    return;
  }
  const hits = STATE.documents.filter(doc=>{
    if(doc.id===docId) return false;
    const haystack = [doc.honbun, ...(doc.subheadings||[]).map(subheadingText)].filter(Boolean).join('\n');
    return haystack.includes(term);
  });
  if(hits.length===0){
    body.innerHTML = '<p class="text-sm text-gray-400">他の御書・御指導では見つかりませんでした</p>';
  } else {
    body.innerHTML = hits.map(doc=>{
      const meta = CATEGORY_META[doc.category]||CATEGORY_META.other;
      return `<div class="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:shadow-sm" style="border-color:var(--line)" onclick="switchToIntakeAndEdit('${doc.id}')">
        <span class="badge" style="background:${meta.color}">${meta.label}</span>
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHtml(doc.title||'（無題）')}</p>
          <p class="text-[11px] text-gray-400">${escapeHtml(doc.managementNumber||'')}</p>
        </div>
      </div>`;
    }).join('');
  }
  openModal('crossUsageModal');
}

// 同名の語句カードをすべて集め、1つに統合する（解説文は改行で結合、信用度はA>B>Cで最も高いものを採用）
function mergeDuplicateNotes(docId, index){
  const startDoc = STATE.documents.find(x=>x.id===docId);
  if(!startDoc || !startDoc.aiNotes || !startDoc.aiNotes[index]) return;
  const targetItem = (startDoc.aiNotes[index].item||'').trim();
  if(!targetItem) return;

  const matches = [];
  STATE.documents.forEach(doc=>{
    (doc.aiNotes||[]).forEach((n,idx)=>{
      if((n.item||'').trim()===targetItem) matches.push({doc, idx});
    });
  });
  if(matches.length<2){ alert('統合できる同名の語句が見つかりません'); return; }
  if(!confirm(`「${targetItem}」というカードが${matches.length}件見つかりました。1つに統合してよろしいですか？（この操作は元に戻せません）`)) return;

  const credOrder = {A:3,B:2,C:1};
  const kept = matches[0];
  const keptNote = kept.doc.aiNotes[kept.idx];
  const descs = [keptNote.desc].filter(Boolean);
  let bestCred = keptNote.credibility || 'C';
  let bestReading = keptNote.reading;
  let bestSource = keptNote.source;
  matches.slice(1).forEach(m=>{
    const n = m.doc.aiNotes[m.idx];
    if(n.desc && !descs.includes(n.desc)) descs.push(n.desc);
    if((credOrder[n.credibility]||1) > (credOrder[bestCred]||1)) bestCred = n.credibility;
    if(!bestReading && n.reading) bestReading = n.reading;
    if(!bestSource && n.source) bestSource = n.source;
  });
  keptNote.desc = descs.join('\n');
  keptNote.credibility = bestCred;
  keptNote.reading = bestReading || keptNote.reading;
  keptNote.source = bestSource || keptNote.source;

  // 同一ドキュメント内で複数ヒットした場合にインデックスがずれないよう、降順に削除する
  const byDoc = new Map();
  matches.slice(1).forEach(m=>{
    if(!byDoc.has(m.doc)) byDoc.set(m.doc, []);
    byDoc.get(m.doc).push(m.idx);
  });
  byDoc.forEach((idxs, doc)=>{
    idxs.sort((a,b)=>b-a).forEach(idx=>{ doc.aiNotes.splice(idx,1); });
  });

  persistAll();
  renderTerms();
  alert('統合しました');
}

function openSourcePopup(docId, index){
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d) return;
  const n = index>=0? (d.aiNotes||[])[index] : null;
  const body = document.getElementById('sourcePopupBody');
  body.innerHTML = `
    <p><span class="field-label">管理番号</span>${escapeHtml(d.managementNumber||'（なし）')}</p>
    <p><span class="field-label">文書タイトル</span>${escapeHtml(d.title||'（無題）')}</p>
    <p class="field-label mt-2">該当の段落文面</p>
    <p class="p-3 rounded-lg" style="background:var(--paper-dim)">${escapeHtml(n? (n.desc||'（本文なし）') : '（本文なし）')}</p>
  `;
  openModal('sourcePopup');
}

function openNoteEdit(docId, index){
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d || !d.aiNotes || !d.aiNotes[index]) return;
  const n = d.aiNotes[index];
  document.getElementById('en_docid').value = docId;
  document.getElementById('en_index').value = index;
  document.getElementById('en_item').value = n.item||'';
  document.getElementById('en_reading').value = n.reading||'';
  document.getElementById('en_desc').value = n.desc||'';
  document.getElementById('en_category').value = n.category||'term';
  document.getElementById('en_credibility').value = n.credibility||'C';
  document.getElementById('en_source').value = n.source||'';
  openModal('editNoteModal');
}

function saveNoteEdit(){
  const docId = document.getElementById('en_docid').value;
  const index = parseInt(document.getElementById('en_index').value);
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d || !d.aiNotes || !d.aiNotes[index]) return;
  d.aiNotes[index] = {
    item: document.getElementById('en_item').value.trim(),
    reading: document.getElementById('en_reading').value.trim(),
    desc: document.getElementById('en_desc').value.trim(),
    category: document.getElementById('en_category').value,
    credibility: document.getElementById('en_credibility').value,
    source: document.getElementById('en_source').value.trim()
  };
  d.updatedAt = Date.now();
  persistAll();
  closeModal('editNoteModal');
  renderTerms();
}

/* ============================================================
   SETTINGS / PERSON DB
   ============================================================ */
