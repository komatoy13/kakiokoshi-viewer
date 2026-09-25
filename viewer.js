/* ============================================================
   viewer.js — 閲覧専用ビューアの起動・タブ切り替え
   db.js・eras.js・timeline.js・render.js・ai-notes.js・search.js は
   編集用アプリと同じものをそのまま読み込んでいる（編集系のボタン・
   フォームが画面上に無いので、編集系の関数は呼ばれない）。
   このファイルでは、
     ① 公開Gistからデータを取得してSTATEに読み込む起動処理
     ② タブ切り替え・サイドバー・「▲上へ」ボタンなど、app.jsの代わり
     ③ 「詳細を見る」等の遷移先を、編集フォームではなく詳細ポップアップに
        差し替える（同名関数を後から再定義して上書きしている）
   を行う。
   ※ db.js・eras.js・timeline.js・render.js・ai-notes.js・search.js の
     後に読み込むこと
   ============================================================ */

// parser.js（取り込み解析。閲覧専用ビューアには不要なので含めていない）から、
// 小見出しの表示に必要なこの1関数だけ複製している。
function subheadingText(s){
  return typeof s==='string' ? s : ((s && s.text) || '');
}

/* ---------- ①：公開Gistの設定と読み込み ----------
   下のDEFAULT_GIST_IDに、編集アプリの「設定→公開ビューアへの反映」で
   発行したGist IDを入れておくと、リンクを開くだけで読み込みます。
   （代わりに、リンクの末尾に ?gist=あなたのGistID を付けて共有することもできます） */
const DEFAULT_GIST_ID = '8e67ce5dccc8fdf00e42a3cd84ebaa2b';
const PUB_GIST_FILENAME_VIEWER = 'kakiokoshi_viewer_data.json';

function currentGistId(){
  const q = new URLSearchParams(location.search).get('gist');
  return (q && q.trim()) || DEFAULT_GIST_ID;
}

async function bootViewer(){
  const boot = document.getElementById('bootStatus');
  const gistId = currentGistId();
  if(!gistId || gistId.indexOf('ここに')===0){
    boot.innerHTML = '<span style="color:#c1473f"><i class="fa-solid fa-triangle-exclamation mr-1"></i>公開用のGist IDが設定されていません（viewer.js の DEFAULT_GIST_ID、またはリンクの末尾に ?gist=... を指定してください）</span>';
    return;
  }
  try{
    const res = await fetch('https://api.github.com/gists/'+encodeURIComponent(gistId), {cache:'no-store'});
    if(!res.ok) throw new Error('データの取得に失敗しました（HTTP '+res.status+'）');
    const gist = await res.json();
    const file = gist.files && (gist.files[PUB_GIST_FILENAME_VIEWER] || Object.values(gist.files)[0]);
    if(!file) throw new Error('公開データのファイルが見つかりませんでした');
    // Gistのファイルが1MBを超える場合、GitHubはtruncated:trueにしてcontentを切り詰めることがあるため、その場合はraw_urlから取り直す
    const raw = file.truncated ? await (await fetch(file.raw_url, {cache:'no-store'})).text() : file.content;
    const data = JSON.parse(raw);

    STATE.documents = data.documents || [];
    STATE.events = data.events || [];
    STATE.persons = (data.persons && data.persons.length) ? data.persons : DEFAULT_PERSONS;
    STATE.relationTagsMaster = data.relationTagsMaster || STATE.relationTagsMaster;
    STATE.goshoMaster = data.goshoMaster || [];
    STATE.mergedGoshos = data.mergedGoshos || [];
    STATE.eraRanges = Array.isArray(data.eraRanges) ? data.eraRanges : null;
    // 公開データは既に本文まで全部含んでいるため、開いていない御書だけ本文が空になる問題を避けるよう、
    // 全件「読み込み済み」として扱う（そうしないとensureDocFullLoadedが本文を空で上書きしてしまう）
    STATE.documents.forEach(d=>{ d._fullLoaded = true; });
    migrateGoshoMasterToRecords();

    boot.classList.add('hidden');
    const updated = data.exportedAt ? new Date(data.exportedAt).toLocaleString('ja-JP') : '';
    if(updated){
      const note = document.createElement('div');
      note.className = 'text-center text-xs py-1';
      note.style.cssText = 'background:var(--paper-dim); color:var(--gray)';
      note.textContent = '最終更新：'+updated;
      boot.insertAdjacentElement('afterend', note);
    }
    switchTab('timeline');
  }catch(err){
    boot.innerHTML = '<span style="color:#c1473f"><i class="fa-solid fa-triangle-exclamation mr-1"></i>'+escapeHtml(err.message)+'</span>';
  }
}

/* ---------- ②：タブ切り替え・サイドバー・「▲上へ」ボタン（app.jsの代わり） ---------- */
function isWideScreen(){ return window.matchMedia && window.matchMedia('(min-width:1024px)').matches; }
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  const mainWrap = document.getElementById('mainWrap');
  if(isWideScreen()){
    const collapsed = sidebar.classList.toggle('collapsed');
    mainWrap.classList.toggle('full', collapsed);
  } else {
    if(sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  }
}
window.addEventListener('resize', ()=>{
  if(isWideScreen()) closeSidebar();
});

function switchTab(tabName){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabName));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const view = document.getElementById('view-'+tabName);
  if(view) view.classList.add('active');
  if(tabName==='timeline') renderTimeline();
  if(tabName==='archive') renderArchive();
  if(tabName==='terms') renderTerms();
  if(tabName==='persons') renderPersonCards();
  if(tabName==='search') renderSearchResults();
  if(!isWideScreen()) closeSidebar();
  window.scrollTo({top:0, behavior:'smooth'});
  updateToTopUi();
}
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
});

function scrollToTop(){ window.scrollTo({top:0, behavior:'smooth'}); }
function updateToTopUi(){
  const wrap = document.getElementById('toTopWrap');
  if(!wrap) return;
  wrap.classList.toggle('show', window.scrollY > 400);
  const pill = document.getElementById('toTopEra');
  const tlView = document.getElementById('view-timeline');
  const inTimeline = !!(tlView && tlView.classList.contains('active'));
  const era = (inTimeline && typeof TL_CURRENT_ERA!=='undefined' && TL_CURRENT_ERA)? getEras().find(x=>x.id===TL_CURRENT_ERA) : null;
  pill.textContent = era? era.name : '';
}
let _scrollTick = false;
window.addEventListener('scroll', ()=>{
  if(_scrollTick) return;
  _scrollTick = true;
  requestAnimationFrame(()=>{
    _scrollTick = false;
    if(typeof updateEraHighlight==='function') updateEraHighlight();
    updateToTopUi();
  });
}, {passive:true});

/* ---------- ③：編集フォームへの遷移を、閲覧用の詳細ポップアップに差し替える ----------
   db.js・search.js・ai-notes.js は編集アプリと共通のファイルをそのまま使っているため、
   「詳細を見る」等から本来は編集フォームを開く関数（goToDoc等）を、
   同名の関数として後から再定義し、代わりに読み取り専用の詳細ポップアップを開くようにする。 */

// 横断検索・人物カード詳細の「詳細を見る」→ 編集フォームではなく詳細ポップアップ
async function goToDoc(id){
  closeModal('personDetailModal');
  closeModal('searchPreviewModal');
  await openArchiveDoc(id);
}

// AI解説「他での使用」一覧のクリック → 同じく詳細ポップアップ
async function switchToIntakeAndEdit(docId){
  closeModal('crossUsageModal');
  await openArchiveDoc(docId);
}

// 人物DB詳細ポップアップ：メモの編集欄・保存ボタンを外した閲覧専用版
function openPersonDetail(id){
  const p = STATE.persons.find(x=>x.id===id);
  if(!p) return;
  const docs = personRelatedDocs(p);
  const events = personRelatedEvents(p);
  document.getElementById('personDetailTitle').textContent = p.name + (p.alias? '（'+p.alias+'）':'');
  const badges = [...(p.relationshipTags||[]), ...(p.periodTags||[])].map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('');
  const activity = personActivityLabel(p);
  const docsHtml = docs.length? docs.map(d=>`<div class="p-2 border-b last:border-0 flex items-center justify-between gap-2" style="border-color:var(--line)">
      <span class="text-sm truncate">${escapeHtml(d.title||'（無題）')}</span>
      <button class="btn btn-outline text-xs flex-shrink-0" onclick="goToDoc('${d.id}')"><i class="fa-solid fa-arrow-right"></i>詳細</button>
    </div>`).join('') : '<p class="text-xs text-gray-400 p-2">関連する御書はありません</p>';
  const eventsHtml = events.length? events.map(e=>`<div class="p-2 border-b last:border-0" style="border-color:var(--line)">
      <span class="text-xs text-gray-400">${escapeHtml(calendarLabel(e.seirekiYear,e.seirekiMonth,e.seirekiDay,e.warekiText))}</span>
      <p class="text-sm">${escapeHtml(e.title)}</p>
    </div>`).join('') : '<p class="text-xs text-gray-400 p-2">関連する年表出来事はありません</p>';
  document.getElementById('personDetailBody').innerHTML = `
    <div class="flex flex-wrap gap-1 mb-2">${badges}</div>
    ${activity? `<p class="text-xs mb-3" style="color:var(--gray)"><i class="fa-solid fa-clock mr-1"></i>${escapeHtml(activity)}</p>` : ''}
    ${p.bio? `<p class="text-sm whitespace-pre-wrap mb-4" style="line-height:1.8">${escapeHtml(p.bio)}</p>` : (p.summary? `<p class="text-sm mb-4">${escapeHtml(p.summary)}</p>` : '')}
    <h5 class="font-display text-sm mt-4 mb-1" style="color:var(--navy)"><i class="fa-solid fa-scroll mr-1"></i>関連する御書</h5>
    <div class="rounded-lg" style="background:var(--paper-dim)">${docsHtml}</div>
    <h5 class="font-display text-sm mt-4 mb-1" style="color:var(--navy)"><i class="fa-solid fa-timeline mr-1"></i>関連する年表出来事</h5>
    <div class="rounded-lg" style="background:var(--paper-dim)">${eventsHtml}</div>
    ${p.notes? `<h5 class="font-display text-sm mt-4 mb-1" style="color:var(--navy)"><i class="fa-solid fa-note-sticky mr-1"></i>メモ・AI解説</h5><p class="text-sm whitespace-pre-wrap p-2 rounded-lg" style="background:var(--paper-dim)">${escapeHtml(p.notes)}</p>` : ''}
  `;
  openModal('personDetailModal');
}

// AI解説カード：編集・統合・削除ボタンを外した閲覧専用版（出典・他での使用は残す）
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
        </div>
        <p class="note-desc clamp-2 text-sm text-gray-600 mt-1" style="white-space:pre-wrap">${escapeHtml(n.desc)}</p>
        <button type="button" class="note-desc-toggle hidden" onclick="toggleNoteDesc(this)">▼ 続きを読む</button>
        <p class="text-[11px] text-gray-400 mt-1">出典御書：${escapeHtml(n.docTitle||'')}${n.docMgmt?'（'+escapeHtml(n.docMgmt)+'）':''}</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <button class="btn btn-outline text-xs" onclick="openSourcePopup('${n.docId}',${n.index})"><i class="fa-solid fa-book"></i>出典</button>
          ${n.item? `<button class="btn btn-outline text-xs" onclick="openCrossUsage('${n.docId}',${n.index})"><i class="fa-solid fa-magnifying-glass"></i>他での使用</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

bootViewer();
