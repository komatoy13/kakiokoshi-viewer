/* ============================================================
   search.js — 横断検索（御書／講義録／年表／人物DB）
   カテゴリ別タブ、ヒット件数バッジ、スニペット抜粋＋ハイライト、
   プレビューモーダル、詳細ページへのダイレクト移動
   ※ db.js・parser.js・timeline.js・ai-notes.js の後に読み込むこと
   ============================================================ */

function highlightQuery(escapedText, rawQuery){
  if(!rawQuery) return escapedText;
  const escQ = escapeHtml(rawQuery).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!escQ) return escapedText;
  const re = new RegExp(escQ, 'ig');
  return escapedText.replace(re, m=>`<mark>${m}</mark>`);
}

// queryの前後radius文字を抜粋してハイライトする（該当箇所が無ければ先頭から）
function buildSnippet(text, rawQuery, radius){
  radius = radius || 40;
  if(!text) return '';
  const idx = text.toLowerCase().indexOf((rawQuery||'').toLowerCase());
  if(idx<0){
    const head = text.slice(0, radius*2);
    return escapeHtml(head) + (text.length>radius*2? '…' : '');
  }
  const start = Math.max(0, idx-radius);
  const end = Math.min(text.length, idx+rawQuery.length+radius);
  let snippet = text.slice(start, end);
  if(start>0) snippet = '…'+snippet;
  if(end<text.length) snippet = snippet+'…';
  return highlightQuery(escapeHtml(snippet), rawQuery);
}

// カテゴリ別（すべて／御書／講義録／年表／人物DB）に分類した検索結果を返す
function crossSearchResults(rawQuery){
  const q = (rawQuery||'').trim().toLowerCase();
  const result = {all:[], doc:[], lecture:[], event:[], person:[]};
  if(!q) return result;

  STATE.documents.forEach(d=>{
    const goshoRec = d.goshoId ? goshoRecordById(d.goshoId) : null;
    const goshoLabel = goshoRec ? goshoRecordLabel(goshoRec) : '';
    const hay = [d.title, d.honbun, goshoLabel, (d.summary||[]).join(' ')].filter(Boolean).join(' ');
    if(!hay.toLowerCase().includes(q)) return;
    const bucket = d.category==='lecture' ? 'lecture' : 'doc';
    const meta = CATEGORY_META[d.category]||CATEGORY_META.other;
    const item = {
      type: bucket, id: d.id,
      title: d.title || '（無題）',
      snippet: buildSnippet(d.honbun || hay, rawQuery),
      meta: `${meta.label}・${calendarLabel(d.seirekiYear,d.seirekiMonth,d.seirekiDay,d.warekiText)}${d.managementNumber? '・'+d.managementNumber : ''}${goshoLabel? '・'+goshoLabel : ''}`
    };
    result[bucket].push(item); result.all.push(item);
  });

  const allEvents = [...STATE.events, ...(typeof personAutoEvents==='function'? personAutoEvents() : [])];
  allEvents.forEach(e=>{
    const hay = [e.title, e.description].filter(Boolean).join(' ');
    if(!hay.toLowerCase().includes(q)) return;
    const item = {
      type:'event', id: e.id,
      title: e.title,
      snippet: buildSnippet(e.description || e.title, rawQuery),
      meta: calendarLabel(e.seirekiYear,e.seirekiMonth,e.seirekiDay,e.warekiText) + (e.person? '・'+e.person : '')
    };
    result.event.push(item); result.all.push(item);
  });

  STATE.persons.forEach(p=>{
    const hay = [p.name, p.alias, p.summary, p.bio].filter(Boolean).join(' ');
    if(!hay.toLowerCase().includes(q)) return;
    const item = {
      type:'person', id: p.id,
      title: p.name + (p.alias? '（'+p.alias+'）' : ''),
      snippet: buildSnippet(p.bio || p.summary || '', rawQuery),
      meta: (p.relationshipTags||[]).join('・')
    };
    result.person.push(item); result.all.push(item);
  });

  return result;
}

function onCrossSearchInput(){
  STATE.crossSearch.query = document.getElementById('crossSearchInput').value;
  renderSearchResults();
}
function setSearchTab(tab){
  STATE.crossSearch.tab = tab;
  renderSearchResults();
}

const SEARCH_TAB_DEFS = [
  {key:'all', label:'すべて'},
  {key:'doc', label:'御書'},
  {key:'lecture', label:'講義録'},
  {key:'event', label:'年表'},
  {key:'person', label:'人物DB'}
];
const SEARCH_TYPE_LABEL = {doc:'御書', lecture:'講義録', event:'年表', person:'人物DB'};

function renderSearchResults(){
  const q = STATE.crossSearch.query || '';
  const results = crossSearchResults(q);

  const tabsEl = document.getElementById('searchTabs');
  tabsEl.innerHTML = SEARCH_TAB_DEFS.map(t=>
    `<button type="button" class="filter-btn ${STATE.crossSearch.tab===t.key?'active':''}" onclick="setSearchTab('${t.key}')">${t.label}<span class="search-tab-badge">${results[t.key].length}</span></button>`
  ).join('');

  const list = results[STATE.crossSearch.tab] || [];
  const container = document.getElementById('searchResults');
  if(!q.trim()){
    container.innerHTML = '<p class="text-sm text-gray-400 py-10 text-center">キーワードを入力してください</p>';
    return;
  }
  if(!list.length){
    container.innerHTML = '<p class="text-sm text-gray-400 py-10 text-center">該当する結果がありません</p>';
    return;
  }
  container.innerHTML = list.map(item=>`
    <div class="search-result">
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div class="min-w-0">
          <span class="chip">${SEARCH_TYPE_LABEL[item.type]}</span>
          <h4 class="font-display text-base mt-1" style="color:var(--navy)">${escapeHtml(item.title)}</h4>
          <p class="text-xs text-gray-400 mt-0.5">${escapeHtml(item.meta||'')}</p>
          <p class="text-sm mt-2">${item.snippet}</p>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="btn btn-outline text-xs" onclick="previewSearchResult('${item.type}','${item.id}')"><i class="fa-solid fa-eye"></i>プレビュー</button>
          <button class="btn btn-gold text-xs" onclick="goToSearchResult('${item.type}','${item.id}')"><i class="fa-solid fa-arrow-right"></i>詳細を見る</button>
        </div>
      </div>
    </div>
  `).join('');
}

// 一覧の「プレビュー」：前後の文脈をモーダルで確認
async function previewSearchResult(type, id){
  let title = '', body = '';
  if(type==='doc' || type==='lecture'){
    const d = STATE.documents.find(x=>x.id===id);
    if(!d) return;
    title = d.title || '（無題）';
    await ensureDocFullLoaded(id); // プレビューは個別文書の単発操作なので、この時だけ本文を読み込む
    body = d.fullText || d.honbun || '（本文が登録されていません）';
  } else if(type==='event'){
    const e = [...STATE.events, ...(typeof personAutoEvents==='function'? personAutoEvents():[])].find(x=>x.id===id);
    if(!e) return;
    title = e.title;
    body = e.description || '（詳細説明が登録されていません）';
  } else if(type==='person'){
    const p = STATE.persons.find(x=>x.id===id);
    if(!p) return;
    title = p.name;
    body = p.bio || p.summary || '（情報が登録されていません）';
  } else {
    return;
  }
  document.getElementById('searchPreviewTitle').textContent = title;
  document.getElementById('searchPreviewBody').textContent = body;
  document.getElementById('searchPreviewGotoBtn').onclick = ()=>{ closeModal('searchPreviewModal'); goToSearchResult(type, id); };
  openModal('searchPreviewModal');
}

// 一覧の「詳細を見る」：対象の本文ページ・詳細カードへダイレクト移動
function goToSearchResult(type, id){
  if(type==='doc' || type==='lecture'){
    goToDoc(id);
  } else if(type==='event'){
    switchTab('timeline');
  } else if(type==='person'){
    switchTab('persons');
    openPersonDetail(id);
  }
}
