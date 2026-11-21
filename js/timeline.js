/* ============================================================
   timeline.js — 統合年表
   簡略表示（一項目一行）固定＋詳細ポップアップ、時代区分ジャンプ／追従ハイライト、
   複数フィルター、検索、本文全文モーダル、人物データベース連動の自動出来事生成
   ※ db.js・eras.js・parser.js の後に読み込むこと
   ============================================================ */

function toggleTimelineEditMode(){
  STATE.timelineEditMode = !STATE.timelineEditMode;
  const btn = document.getElementById('timelineEditModeBtn');
  if(btn){
    btn.classList.toggle('active', STATE.timelineEditMode);
    btn.innerHTML = STATE.timelineEditMode
      ? '<i class="fa-solid fa-lock-open"></i>編集モード（ON）'
      : '<i class="fa-solid fa-lock"></i>閲覧モード（編集する場合はタップ）';
  }
  if(!STATE.timelineEditMode) cancelEventEdit();
  renderTimeline();
}
function toggleTypeFilter(key){
  STATE.typeFilters[key] = !STATE.typeFilters[key];
  const btn = document.querySelector(`[data-typekey="${key}"]`);
  if(btn) btn.classList.toggle('active', STATE.typeFilters[key]);
  renderTimeline();
}
function onTimelineSearch(){
  STATE.searchQuery = document.getElementById('timelineSearch').value;
  renderTimeline();
}
function toggleEventForm(){
  const el = document.getElementById('eventForm');
  el.classList.toggle('hidden');
  if(!el.classList.contains('hidden')) populateEventRelatedDocSelect(document.getElementById('ev_relateddoc').value||'');
}

// 西暦・仏紀・和暦のいずれかで年表の日付を整形する
function formatYMD(y, m, d){
  if(y===null || y===undefined || y==='' || isNaN(y)) return '';
  const parts = [y<0 ? '前'+(-y) : y];                              // 紀元前は「前949」のように表す
  if(m) parts.push(m);
  if(m && d) parts.push(d);
  return parts.join('.');
}
function formatWareki(wk, fallbackM, fallbackD){
  if(!wk || !wk.era) return '';
  const mo = wk.month || fallbackM, da = wk.day || fallbackD;
  const parts = [wk.waYear!=null? wk.waYear : ''];
  if(mo) parts.push((wk.isLeapMonth? '閏' : '') + mo);   // 閏月は「文永8.閏10.12」のように月の前に「閏」を付ける
  if(mo && da) parts.push(da);
  return wk.era + parts.join('.');
}
function calendarLabel(y, m, d, warekiText){
  const mode = STATE.calendarMode || 'seireki';
  if(mode==='seireki') return formatYMD(y, m, d);
  if(mode==='butsuki') return formatYMD(butsukiFromSeireki(y), m, d);
  if(mode==='wareki'){
    const wk = parseWarekiText(warekiText||'');
    if(wk && wk.era) return formatWareki(wk, m, d);
    return formatYMD(y, m, d) + (y<701 ? '（和暦なし）' : '（和暦不明）');
  }
  return formatYMD(y, m, d);
}

// 出来事フォームの和暦ピッカー（ev_era/ev_wayear/ev_wamonth/ev_waday）の<select>を初期化・再描画する
function initWarekiPickerEv(era, year, month, day, isLeap){
  const leapCb = document.getElementById('ev_waleap');
  if(leapCb) leapCb.checked = !!isLeap;
  document.getElementById('ev_era').innerHTML = buildEraSelectOptions(era);
  document.getElementById('ev_wayear').innerHTML = buildYearSelectOptions(year);
  document.getElementById('ev_wamonth').innerHTML = buildMonthSelectOptions(month);
  document.getElementById('ev_waday').innerHTML = buildDaySelectOptions(day);
  document.getElementById('ev_eraChips').innerHTML = buildEraChipsHtml('ev', era);
}

// 出来事フォームの「参照御書」セレクトを最新の御書一覧で再構築する
function populateEventRelatedDocSelect(selectedId){
  const sel = document.getElementById('ev_relateddoc');
  if(!sel) return;
  const sorted = STATE.documents.slice().sort((a,b)=>(a.seirekiYear||0)-(b.seirekiYear||0));
  sel.innerHTML = '<option value="">（参照御書なし）</option>' +
    sorted.map(d=>`<option value="${d.id}" ${selectedId===d.id?'selected':''}>${escapeHtml(d.title||'（無題）')}</option>`).join('');
}

// ピッカーのいずれかが変更された時：和暦テキストを組み立てて ev_wareki（隠しテキスト）に反映する
function onEvWarekiPickerChange(){
  const era = document.getElementById('ev_era').value;
  const year = document.getElementById('ev_wayear').value;
  const month = document.getElementById('ev_wamonth').value;
  const day = document.getElementById('ev_waday').value;
  const leapCb = document.getElementById('ev_waleap');
  document.getElementById('ev_wareki').value = composeWarekiText(era, year, month, day, !!(leapCb && leapCb.checked));
  refreshEraChipActive('ev_eraChips', era);
  // 元号と年が揃っていれば、西暦・仏紀を自動で入れる（揃っていない間は、入力済みの西暦を残す）
  if(era && year){
    const y = seirekiFromWareki(era, parseInt(year,10));
    if(y!==null){
      document.getElementById('ev_syear').value = y;
      document.getElementById('ev_butsuki').value = butsukiFromSeireki(y);
      updateEvYearHint(y);
    }
  }
}

// 西暦から和暦のピッカー（元号・年）を当てはめる。月・日・閏月の選択はそのまま残す。
function applyEvSeireki(y){
  const hint = document.getElementById('ev_yearHint');
  if(y===null || isNaN(y) || y===0){ if(hint) hint.textContent=''; return; }
  document.getElementById('ev_syear').value = y;
  document.getElementById('ev_butsuki').value = butsukiFromSeireki(y);
  const w = warekiFromSeireki(y);
  const month = document.getElementById('ev_wamonth').value;
  const day = document.getElementById('ev_waday').value;
  const leapCb = document.getElementById('ev_waleap');
  const isLeap = !!(leapCb && leapCb.checked);
  if(w){
    initWarekiPickerEv(w.era, w.waYear, month, day, isLeap);
    document.getElementById('ev_wareki').value = composeWarekiText(w.era, w.waYear, month, day, isLeap);
  } else {
    initWarekiPickerEv('', '', month, day, isLeap);
    document.getElementById('ev_wareki').value = '';
  }
  updateEvYearHint(y);
}
function updateEvYearHint(y){
  const hint = document.getElementById('ev_yearHint');
  if(hint) hint.textContent = describeYearAll(y);
}
function onEvSeirekiInput(){
  const t = toHalfWidthDigits(document.getElementById('ev_syear').value||'').trim();
  if(t===''){ return; }   // 空欄にしても和暦側は消さない
  applyEvSeireki(parseInt(t,10));
}
function onEvButsukiInput(){
  const t = toHalfWidthDigits(document.getElementById('ev_butsuki').value||'').trim();
  if(t===''){ return; }
  const b = parseInt(t,10);
  if(isNaN(b)){ return; }
  if(b===0){ alert('仏紀に0年はありません（釈尊の入滅の年が仏紀1年、その前の年が−1年です）'); return; }
  applyEvSeireki(seirekiFromButsuki(b));
}

function resetEventForm(){
  ['ev_wareki','ev_syear','ev_butsuki','ev_title','ev_desc'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  updateEvYearHint(null);
  const hintEl = document.getElementById('ev_yearHint');
  if(hintEl) hintEl.textContent = '西暦か仏紀を入力すると、和暦を自動で当てはめます。和暦を選ぶと、西暦・仏紀が自動で入ります。';
  document.getElementById('ev_type').value = 'general';
  initWarekiPickerEv('','','','');
  populateEventRelatedDocSelect('');
  if(typeof themePickerRender==='function') themePickerRender('ev_themes', []);
  STATE.editingEventId = null;
  const btn = document.getElementById('eventFormSubmitBtn');
  if(btn) btn.innerHTML = '<i class="fa-solid fa-check"></i>年表に追加';
  const cancelBtn = document.getElementById('eventFormCancelBtn');
  if(cancelBtn) cancelBtn.classList.add('hidden');
}

// 編集モード時：既存の出来事をフォームに読み込み、その場での修正を可能にする
function editEvent(id){
  const e = STATE.events.find(x=>x.id===id);
  if(!e || e.auto) return;
  document.getElementById('eventForm').classList.remove('hidden');
  STATE.editingEventId = id;
  const wk = parseWarekiText(e.warekiText||'');
  initWarekiPickerEv(wk?wk.era:'', wk?wk.waYear:'', wk?wk.month:'', wk?wk.day:'', wk?wk.isLeapMonth:false);
  document.getElementById('ev_wareki').value = e.warekiText||'';
  document.getElementById('ev_syear').value = e.seirekiYear||'';
  document.getElementById('ev_butsuki').value = e.seirekiYear? butsukiFromSeireki(e.seirekiYear) : '';
  if(e.seirekiYear) updateEvYearHint(e.seirekiYear);
  document.getElementById('ev_title').value = e.title||'';
  document.getElementById('ev_person').value = e.person||'';
  document.getElementById('ev_type').value = e.eventType||'general';
  document.getElementById('ev_desc').value = e.description||'';
  populateEventRelatedDocSelect(e.relatedDocId||'');
  if(typeof themePickerRender==='function') themePickerRender('ev_themes', e.themeTagIds||[]);
  const btn = document.getElementById('eventFormSubmitBtn');
  if(btn) btn.innerHTML = '<i class="fa-solid fa-check"></i>この出来事を更新';
  const cancelBtn = document.getElementById('eventFormCancelBtn');
  if(cancelBtn) cancelBtn.classList.remove('hidden');
  document.getElementById('eventForm').scrollIntoView({behavior:'smooth', block:'center'});
}
function cancelEventEdit(){ resetEventForm(); }

function saveManualEvent(){
  let wareki = document.getElementById('ev_wareki').value.trim();
  const syear = parseInt(document.getElementById('ev_syear').value)||null;
  if(!wareki && syear){
    const w = warekiFromSeireki(syear);
    if(w){
      const mo = document.getElementById('ev_wamonth').value, dy = document.getElementById('ev_waday').value;
      const lp = document.getElementById('ev_waleap');
      wareki = composeWarekiText(w.era, w.waYear, mo, dy, !!(lp && lp.checked));
    }
  }
  const title = document.getElementById('ev_title').value.trim();
  const person = document.getElementById('ev_person').value;
  const eventType = document.getElementById('ev_type').value || 'general';
  const desc = document.getElementById('ev_desc').value.trim();
  const relatedDocId = document.getElementById('ev_relateddoc').value || null;
  if(!title){ alert('出来事タイトルを入力してください'); return; }
  const wk = parseWarekiText(wareki);
  const year = syear || (wk? wk.seirekiYear : null);
  const payload = {
    warekiText: wareki, seirekiYear: year,
    seirekiMonth: wk?wk.month:null, seirekiDay: wk?wk.day:null,
    title, person, eventType, description: desc, relatedDocId, manual:true,
    themeTagIds: (typeof themePickerValue==='function') ? themePickerValue('ev_themes') : []
  };
  if(STATE.editingEventId){
    const idx = STATE.events.findIndex(e=>e.id===STATE.editingEventId);
    if(idx>=0) STATE.events[idx] = {...STATE.events[idx], ...payload};
  } else {
    STATE.events.push({id: uid(), ...payload});
  }
  persistAll();
  resetEventForm();
  renderTimeline();
}
// 旧関数名（互換用エイリアス）
function addManualEvent(){ saveManualEvent(); }

function deleteEvent(id){
  const e = STATE.events.find(x=>x.id===id);
  if(!e) return;
  requestDelete(e.title, ()=>{
    STATE.events = STATE.events.filter(x=>x.id!==id);
    persistAll();
    renderTimeline();
  });
}

function personAutoEvents(){
  const out = [];
  STATE.persons.forEach(p=>{
    const by = personSeireki(p,'birth');
    if(by){ out.push({id:'auto_birth_'+p.id, seirekiYear:by, seirekiMonth:p.birthMonth, seirekiDay:p.birthDay,
      title: p.name+' 御出生', person:p.name, description:'', auto:true, eventType:'follower', themeTagIds: themeIdsOf(p),   // 人物のテーマタグを、そのまま引き継ぐ
      warekiText: p.birthEra? (p.birthEra+(p.birthWaYear===1?'元':p.birthWaYear)+'年') : ''}); }
    const dy = personSeireki(p,'death');
    if(dy){ out.push({id:'auto_death_'+p.id, seirekiYear:dy, seirekiMonth:p.deathMonth, seirekiDay:p.deathDay,
      title: p.name+' '+(p.deathLabel||'御入滅')+(p.deathAgeText?'（'+p.deathAgeText+'）':''), person:p.name, description:'', auto:true, eventType:'follower', themeTagIds: themeIdsOf(p),
      warekiText: p.deathEra? (p.deathEra+(p.deathWaYear===1?'元':p.deathWaYear)+'年'+(p.deathMonth?p.deathMonth+'月':'')+(p.deathDay?p.deathDay+'日':'')) : ''}); }
  });
  return out;
}

function populatePersonFilter(){
  const sel = document.getElementById('personFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="all">全員</option>' + STATE.persons.map(p=>`<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  sel.value = current || 'all';
}

// 年の列（各項目の左）：その年の最初の行にだけ「西暦／(仏紀)」と●を出し、2行目以降は空欄。
// 年ジャンプ・追従ハイライトの目印（.tl-era / id / data-year）も、この最初の行の列に付ける。
function yearCellHtml(y, isFirst){
  if(!isFirst) return '<div class="tl-year"></div>';
  return `<div class="tl-year tl-era" id="tl-y-${y}" data-year="${y}"><span class="dot"></span><span class="y-sei">${y<0? '前'+(-y) : y}</span><span class="y-but">(${(()=>{ const b=butsukiFromSeireki(y); return b<0? '前'+(-b) : b; })()})</span></div>`;
}

function passesTypeFilter(item){
  if(item.type==='doc') return !!STATE.typeFilters.doc;
  const isFollower = !!item.data.auto || item.data.eventType==='follower';
  return isFollower? !!STATE.typeFilters.follower : !!STATE.typeFilters.general;
}
function passesSearch(item){
  const q = (STATE.searchQuery||'').trim().toLowerCase();
  if(!q) return true;
  if(item.type==='doc'){
    const d = item.data;
    const hay = [d.title, d.honbun, ...(d.subheadings||[]).map(subheadingText)].join(' ').toLowerCase();
    return hay.includes(q);
  }
  const e = item.data;
  const hay = [e.title, e.description].join(' ').toLowerCase();
  return hay.includes(q);
}

/* ------------------------------------------------------------
   年表の描画（簡略表示＝一項目一行に固定）
   ・行データは TL_ROWS に保持し、最初の一部だけ先に描画、残りは少しずつ後から追加する（分割描画）
   ・行をタップすると詳細ポップアップ（openTlRow）を開く
   ------------------------------------------------------------ */
let TL_ROWS = [];              // 表示中の行データ（日付順）
let TL_RENDERED = 0;           // 描画済みの行数
let TL_TOKEN = 0;              // 再描画された時に、古い分割描画を止めるための番号
let TL_ERA_FIRST = {};         // 時代区分ID → その区分に属する最初の行のindex
let TL_CURRENT_ERA = null;     // 現在画面上部にある時代区分ID（追従ハイライト用）
let TL_JUMP_LOCK = null;       // ジャンプ直後のハイライト固定 {id, y}

/* ------------------------------------------------------------
   「書き起こし」タブ：年表モード⇄一覧モードの切り替え
   統合年表と書き起こし一覧は同じ1つのタブの中の「表示モード」であり、
   タブを開くと必ず一覧モードから始まる（setKakiokoshiMode は switchTab から呼ばれる）。年表へは、右下の丸いボタンで切り替える。
   ------------------------------------------------------------ */
let KAKIOKOSHI_MODE = 'list'; // 'timeline' | 'list'

function isKakiokoshiTimelineActive(){
  const v = document.getElementById('view-archive');
  return !!(v && v.classList.contains('active') && KAKIOKOSHI_MODE==='timeline');
}

function setKakiokoshiMode(mode){
  KAKIOKOSHI_MODE = mode;
  const tlBlock = document.getElementById('khMode-timeline');
  const listBlock = document.getElementById('khMode-list');
  if(tlBlock) tlBlock.style.display = mode==='timeline' ? '' : 'none';
  if(listBlock) listBlock.style.display = mode==='list' ? '' : 'none';
  const btn = document.getElementById('kakiokoshiModeToggleBtn');
  if(btn){
    btn.innerHTML = mode==='timeline'
      ? '<i class="fa-solid fa-list"></i>一覧モードへ'
      : '<i class="fa-solid fa-timeline"></i>年表モードへ';
  }
  if(mode==='timeline') renderTimeline(); else renderArchive();
  if(typeof updateToTopUi==='function') updateToTopUi();
}

function toggleKakiokoshiMode(){
  setKakiokoshiMode(KAKIOKOSHI_MODE==='timeline' ? 'list' : 'timeline');
}
const TL_FIRST_CHUNK = 120;
const TL_CHUNK = 250;

function renderTimeline(){
  populatePersonFilter();
  if(typeof renderThemeBars==='function') renderThemeBars();
  const personFilterVal = document.getElementById('personFilter').value;
  let items = [];

  STATE.documents.forEach(d=>{
    if(d.timelineInclude===false) return; // 「統合年表に表示する」がオフの御書・御指導は年表には出さない（書き起こし一覧では見られる）
    items.push({type:'doc', data:d, y:d.seirekiYear, m:d.seirekiMonth, dd:d.seirekiDay, person:d.author});
  });
  STATE.events.forEach(e=>{
    items.push({type:'event', data:e, y:e.seirekiYear, m:e.seirekiMonth, dd:e.seirekiDay, person:e.person});
  });
  personAutoEvents().forEach(e=>{
    items.push({type:'event', data:e, y:e.seirekiYear, m:e.seirekiMonth, dd:e.seirekiDay, person:e.person});
  });

  items = items.filter(passesTypeFilter);
  if(typeof passesThemeFilter==='function') items = items.filter(passesThemeFilter);   // テーマの絞り込み（themes.js）
  if(personFilterVal!=='all') items = items.filter(i=>i.person===personFilterVal);
  items = items.filter(passesSearch);
  items = items.filter(i=>i.y);

  items.sort((a,b)=> (a.y-b.y) || ((a.m||99)-(b.m||99)) || ((a.dd||99)-(b.dd||99)) );

  const token = ++TL_TOKEN;
  const container = document.getElementById('timelineContainer');
  TL_ROWS = buildTimelineRows(items);
  TL_RENDERED = 0;
  TL_CURRENT_ERA = null;
  TL_JUMP_LOCK = null;

  // 各時代区分に属する最初の行（ジャンプ先）を求める。該当データが無い区分のボタンは無効化される。
  TL_ERA_FIRST = {};
  TL_ROWS.forEach((r,i)=>{
    const e = eraForYear(r.y);
    if(e && TL_ERA_FIRST[e.id]===undefined) TL_ERA_FIRST[e.id] = i;
  });

  if(TL_ROWS.length===0){
    container.innerHTML = '<p class="text-sm text-gray-400 py-10 text-center">該当する項目がありません</p>';
    renderEraJumpBar();
    return;
  }
  container.innerHTML = '';
  renderTimelineChunk(TL_FIRST_CHUNK);
  renderEraJumpBar();
  updateEraHighlight();

  // 残りは少しずつ後から追加（初期表示を軽くする）
  const step = ()=>{
    if(token!==TL_TOKEN) return;               // 再描画された場合は中止
    if(TL_RENDERED>=TL_ROWS.length){ updateEraHighlight(); return; }
    renderTimelineChunk(TL_CHUNK);
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

// 同一日付・同一御書名のデータを1行に集約する
function buildTimelineRows(items){
  const groups = new Map();
  const rows = [];
  items.forEach(it=>{
    if(it.type==='doc'){
      const key = [it.y, it.m, it.dd, it.data.title].join('|');
      if(!groups.has(key)){ const arr=[]; groups.set(key, arr); rows.push({kind:'docgroup', y:it.y, m:it.m, dd:it.dd, items:arr}); }
      groups.get(key).push(it);
    } else {
      rows.push({kind:'event', y:it.y, m:it.m, dd:it.dd, data:it.data});
    }
  });
  rows.sort((a,b)=> (a.y-b.y) || ((a.m||99)-(b.m||99)) || ((a.dd||99)-(b.dd||99)) );
  return rows;
}

// TL_ROWS の TL_RENDERED 行目以降を n 行ぶん描画して末尾に追加する
function renderTimelineChunk(n){
  const container = document.getElementById('timelineContainer');
  const end = Math.min(TL_ROWS.length, TL_RENDERED + n);
  let html = '';
  for(let i=TL_RENDERED; i<end; i++){
    const r = TL_ROWS[i];
    const isFirst = (i===0 || TL_ROWS[i-1].y !== r.y);
    html += `<div class="tl-item${isFirst?' year-start':''}">${yearCellHtml(r.y, isFirst)}` +
      (r.kind==='docgroup'? renderDocGroupRowSimple(r, i) : renderEventRowSimple(r, i)) + '</div>';
  }
  container.insertAdjacentHTML('beforeend', html);
  TL_RENDERED = end;
}
function ensureRenderedThrough(idx){
  if(TL_RENDERED <= idx) renderTimelineChunk(idx + 1 - TL_RENDERED);
}

/* ------------------------------------------------------------
   時代区分：ジャンプボタン＋スクロール追従ハイライト
   ------------------------------------------------------------ */
function renderEraJumpBar(){
  const el = document.getElementById('eraJumpBar');
  if(!el) return;
  const eras = getEras();
  if(eras.length===0){ el.classList.add('hidden'); el.innerHTML=''; return; }
  el.classList.remove('hidden');
  el.innerHTML = '<span class="text-xs font-semibold" style="color:var(--gray)">時代へジャンプ：</span>' +
    eras.map(e=>{
      const has = TL_ERA_FIRST[e.id] !== undefined;
      const title = (e.startYear===null||e.startYear===undefined)? '最初から' : e.startYear+'年〜';
      return `<button type="button" class="filter-btn era-jump-btn${e.id===TL_CURRENT_ERA?' active':''}" data-eraid="${e.id}" title="${title}" ${has?'':'disabled'} onclick="jumpToEra('${e.id}')">${escapeHtml(e.name)}</button>`;
    }).join('');
}

function jumpToEra(id){
  const idx = TL_ERA_FIRST[id];
  if(idx===undefined) return;
  ensureRenderedThrough(idx); // ジャンプ先がまだ描画されていなければ、そこまで先に描画する
  const el = document.getElementById('tl-y-'+TL_ROWS[idx].y);
  if(el) el.scrollIntoView({behavior:'auto', block:'start'});
  // 末尾に近い短い区分などは、ページ端に阻まれて先頭まで上がらないことがある。
  // その場合でも、押したボタンのハイライトを保つ（自分でスクロールしたら解除）
  TL_JUMP_LOCK = {id, y: window.scrollY};
  setCurrentEra(id);
}

// 画面上部にある年ヘッダーを二分探索で特定し、その年の時代区分をハイライトする
function updateEraHighlight(){
  if(!isKakiokoshiTimelineActive()) return;
  if(TL_JUMP_LOCK){
    if(Math.abs(window.scrollY - TL_JUMP_LOCK.y) < 3){ setCurrentEra(TL_JUMP_LOCK.id); return; }
    TL_JUMP_LOCK = null;
  }
  const H = document.getElementById('timelineContainer').getElementsByClassName('tl-era');
  if(!H.length){ setCurrentEra(null); return; }
  let lo = 0, hi = H.length-1, ans = 0;
  while(lo<=hi){
    const mid = (lo+hi)>>1;
    if(H[mid].getBoundingClientRect().top <= 80){ ans = mid; lo = mid+1; } else { hi = mid-1; }
  }
  const e = eraForYear(parseInt(H[ans].dataset.year,10));
  setCurrentEra(e? e.id : null);
}
function setCurrentEra(id){
  if(id===TL_CURRENT_ERA) return;
  TL_CURRENT_ERA = id;
  document.querySelectorAll('#eraJumpBar [data-eraid]').forEach(b=>b.classList.toggle('active', b.dataset.eraid===id));
  if(typeof updateToTopUi==='function') updateToTopUi();
}

/* ------------------------------------------------------------
   簡略表示の1行と、詳細ポップアップ
   ------------------------------------------------------------ */
function renderDocGroupRowSimple(r, i){
  const first = r.items[0].data;
  const meta = CATEGORY_META[first.category]||CATEGORY_META.other;
  const dateStr = calendarLabel(r.y, r.m, r.dd, first.warekiText);
  const single = r.items.length===1;
  const mgmt = single? `<span class="sr-mgmt hidden sm:inline-block">${escapeHtml(first.managementNumber||'')}</span>` : `<span class="chip">[${r.items.length}件]</span>`;
  const extra = (single && first.honbun)? kanjiReadingToRuby(escapeHtml(first.honbun)) : '';
  // 書き起こし＝年表の主役。行頭に巻物の印、左線は墨で統一。種類の色は、右端の小さな文字にだけ使う
  return `<div class="simple-row sr-doc" role="button" tabindex="0" onclick="openTlRow(${i})" onkeydown="if(event.key==='Enter')openTlRow(${i})">
    <i class="fa-solid fa-scroll sr-ico" aria-hidden="true"></i>
    <span class="sr-date">${escapeHtml(dateStr)}</span>
    ${mgmt}
    <span class="sr-title">${escapeHtml(first.title||'（無題）')}</span>
    <span class="sr-extra">${extra}</span>
    <span class="sr-cat" style="color:${meta.color}">${escapeHtml(meta.label)}</span>
    <span class="sr-chev">›</span>
    <span class="sr-br"></span>
  </div>`;
}

function renderEventRowSimple(r, i){
  const e = r.data;
  // 人物DB自動の項目（誕生・御入滅など）＝人物。淡く・小さく表示する。手入力の出来事（一般・門下）＝脇役。行頭に旗の印
  const isPerson = !!e.auto;
  const isFollower = isPerson || e.eventType==='follower';
  const color = isFollower? 'var(--c-follower)' : 'var(--c-event)';
  const dateStr = calendarLabel(r.y, r.m, r.dd, e.warekiText);
  const kind = isPerson ? 'sr-person' : 'sr-event';
  const icon = isPerson ? 'fa-user' : 'fa-flag';
  const lineStyle = isPerson ? '' : `style="border-left-color:${color};--sr-c:${color}" `;
  return `<div class="simple-row ${kind}" ${lineStyle}role="button" tabindex="0" onclick="openTlRow(${i})" onkeydown="if(event.key==='Enter')openTlRow(${i})">
    <i class="fa-solid ${icon} sr-ico" aria-hidden="true"></i>
    <span class="sr-date">${escapeHtml(dateStr)}</span>
    <span class="sr-title">${escapeHtml(e.title)}</span>
    <span class="sr-extra">${escapeHtml(e.description||'')}</span>
    <span class="sr-chev">›</span>
  </div>`;
}

// 行をタップした時の詳細ポップアップ（一覧は簡潔な1行、詳細はここだけに表示する）
function openTlRow(i){
  const r = TL_ROWS[i];
  if(!r) return;
  const body = document.getElementById('tlDetailBody');
  if(r.kind==='event'){
    body.innerHTML = renderEventCard(r.data);
  } else if(r.items.length===1){
    body.innerHTML = renderDocCard(r.items[0].data);
  } else {
    const first = r.items[0].data;
    const dateStr = calendarLabel(r.y, r.m, r.dd, first.warekiText);
    body.innerHTML = `<div class="mb-3">
        <span class="chip">[${r.items.length}件]</span>
        <h4 class="font-display text-lg mt-1" style="color:var(--navy)">${escapeHtml(first.title||'（無題）')}</h4>
        <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(dateStr)}</p>
      </div>` + r.items.map(it=>renderDocCard(it.data, {hideTitle:true})).join('');
  }
  body.scrollTop = 0;
  openModal('tlDetailModal');
}

function renderSubheadingsOutline(subheadings){
  if(!subheadings || !subheadings.length) return '';
  const levelStyle = {
    1: 'background:#111111;color:#fff;font-weight:800;',
    2: 'background:#5a5a5a;color:#fff;font-weight:700;',
    3: 'background:#e2e2e2;color:#333;font-weight:400;',
    4: 'background:transparent;color:#1f1f1f;font-weight:700;'
  };
  return `<div class="mt-3 space-y-1">${subheadings.map(s=>{
    const lvl = s.level || 4;
    const indent = (lvl-1)*14;
    const style = levelStyle[lvl] || levelStyle[4];
    return `<div style="margin-left:${indent}px"><span class="text-xs" style="${style}padding:1px 8px;border-radius:4px;display:inline-block;">${escapeHtml(subheadingText(s))}</span></div>`;
  }).join('')}</div>`;
}

function renderDocCard(d, opts){
  opts = opts || {};
  const meta = CATEGORY_META[d.category]||CATEGORY_META.other;
  const dateLabel = calendarLabel(d.seirekiYear, d.seirekiMonth, d.seirekiDay, d.warekiText);
  return `<div class="tl-card" style="border-left-color:${meta.color}">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <span class="badge" style="background:${meta.color}">${meta.label}</span>
        <span class="text-xs text-gray-400 ml-2">${escapeHtml(d.managementNumber||'')}</span>
        ${opts.hideTitle? '' : `<h4 class="font-display text-lg mt-1" style="color:var(--navy)">${escapeHtml(d.title||'（無題）')}</h4>`}
        <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(dateLabel)} ${d.author?'・ '+escapeHtml(d.author):''} ${d.ageNote?'（'+escapeHtml(d.ageNote)+'）':''} ${d.recipient?'・受持者：'+escapeHtml(d.recipient):''}</p>
      </div>
      <div class="flex gap-1 flex-shrink-0">
        <button class="btn btn-outline text-xs" onclick="openFullTextModal('${d.id}')"><i class="fa-solid fa-file-lines"></i>本文全文</button>
        ${STATE.timelineEditMode? `<button class="btn btn-outline text-xs" onclick="closeModal('tlDetailModal');goToDoc('${d.id}')"><i class="fa-solid fa-pen"></i>編集</button>` : ''}
      </div>
    </div>
    ${d.honbun? `<p class="text-sm mt-3 italic" style="color:#4a4a44;white-space:pre-wrap">「${kanjiReadingToRuby(escapeHtml(d.honbun))}」</p>` : ''}
    ${(d.summary&&d.summary.length)? `<div class="mt-2 flex flex-wrap gap-1">${d.summary.map(s=>`<span class="chip">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
    ${typeof themeChipsHtml==='function' ? themeChipsHtml(themeIdsOf(d)) : ''}
    ${renderSubheadingsOutline(d.subheadings)}
  </div>`;
}

async function openFullTextModal(docId){
  const d = STATE.documents.find(x=>x.id===docId);
  if(!d) return;
  document.getElementById('fullTextModalTitle').innerHTML = '<i class="fa-solid fa-file-lines mr-2"></i>'+escapeHtml(d.title || '（無題）');
  document.getElementById('fullTextModalBody').textContent = '読み込み中…';
  openModal('fullTextModal');
  await ensureDocFullLoaded(docId);
  const notes = docPdfNotes(d);
  FULLTEXT_MODAL_CURRENT = {title: d.title||'（無題）', text: d.fullText || '', notes};
  if(typeof syncRubyModeSelect==='function') syncRubyModeSelect();
  if(typeof syncPdfNotesControl==='function') syncPdfNotesControl(notes);
  renderStructuredTextInto('fullTextModalBody', d.fullText || '（本文全文が登録されていません）');
  const pdfBtn = document.getElementById('fullTextModalPdfBtn');
  if(pdfBtn) pdfBtn.onclick = ()=> openPdfPreview(d.title||'（無題）', d.fullText||'', {notes});
  if(typeof setFullTextWordBtn==='function') setFullTextWordBtn(d.title||'（無題）', d.fullText||'', notes);
}

function renderEventCard(e){
  const isAuto = !!e.auto;
  const isFollower = isAuto || e.eventType==='follower';
  const color = isFollower? 'var(--c-follower)' : 'var(--c-event)';
  const typeLabel = isFollower? '門下' : '一般';
  const dateLabel = calendarLabel(e.seirekiYear, e.seirekiMonth, e.seirekiDay, e.warekiText);
  const relatedDoc = e.relatedDocId? STATE.documents.find(d=>d.id===e.relatedDocId) : null;
  return `<div class="tl-card" style="border-left-color:${color}">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <span class="badge" style="background:${color}"><i class="fa-solid fa-flag"></i> ${typeLabel}</span>
        ${isAuto? '<span class="chip">人物DB自動</span>' : ''}
        <h4 class="font-display text-lg mt-1" style="color:var(--navy)">${escapeHtml(e.title)}</h4>
        <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(dateLabel)} ${e.person?'・ '+escapeHtml(e.person):''}</p>
        ${e.description? `<p class="text-sm mt-2">${escapeHtml(e.description)}</p>` : ''}
        ${typeof themeChipsHtml==='function' ? themeChipsHtml(themeIdsOf(e)) : ''}
        ${relatedDoc? `<button class="btn btn-outline text-xs mt-2" onclick="openFullTextModal('${relatedDoc.id}')"><i class="fa-solid fa-scroll"></i>参照御書：${escapeHtml(relatedDoc.title||'（無題）')}</button>` : ''}
      </div>
      ${(!isAuto && STATE.timelineEditMode)? `<div class="flex gap-1 flex-shrink-0">
        <button class="btn btn-outline text-xs" onclick="closeModal('tlDetailModal');editEvent('${e.id}')"><i class="fa-solid fa-pen"></i>編集</button>
        <button class="btn btn-danger text-xs" onclick="closeModal('tlDetailModal');deleteEvent('${e.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   TERMS & AI NOTES
   ============================================================ */


/* ------------------------------------------------------------
   書き起こし一覧（年表とは別の一覧）
   「統合年表に表示する」の設定に関わらず、登録済みの御書・御指導を
   カテゴリ→題名（講演日の古い順。日曜勤行は管理番号順）の順にたどれる。詳細は年表と同じ
   詳細ポップアップ（tlDetailModal / renderDocCard）を使い回す。
   ------------------------------------------------------------ */
let ARCHIVE_CATEGORY = null; // 選択中のカテゴリ。null＝1段目（カテゴリ一覧）

/* ------------------------------------------------------------
   一覧モードの並べ方
   ・基本：講演日の古い順（講演順）。日付と題名を表示する。
     講演日は、①西暦が現代（1868年以降）の書き起こしは、その実施日（総幹部会など）、
     ②御書講義など、御書そのものの日付が入っているものは、本文の冒頭にある講演日、
     ③それが無ければ、管理番号（書R08.4 → 令和8年4月）の年月、④それも無ければ、従来の日付、の順に採る。
   ・日曜勤行：管理番号の順（001.1, 001.2, … 009.2 など）。日付の代わりに管理番号を表示する。
   ------------------------------------------------------------ */
const SPEECH_MODERN_ERAS = [['令和',2019],['平成',1989],['昭和',1926],['大正',1912],['明治',1868]];
const SPEECH_ERA_BY_LETTER = {M:'明治',T:'大正',S:'昭和',H:'平成',R:'令和'};
function speechModernWareki(y, m, d){      // 西暦 → 現代の和暦（令和8年4月5日）
  for(const [era, start] of SPEECH_MODERN_ERAS){
    if(y>=start){ const w = y-start+1; return era+(w===1?'元':w)+'年'+(m?m+'月':'')+(m&&d?d+'日':''); }
  }
  return '';
}
function speechDateFromText(text){          // 本文の冒頭（先頭の「# 題名」の行は除く）にある、現代の日付
  const head = String(text||'').replace(/^#[^\n]*\n/, '').slice(0, 150);
  let m = head.match(/(令和|平成|昭和|大正|明治)\s*([0-9０-９〇一二三四五六七八九十百元]{1,4})年(?:\s*([0-9０-９一二三四五六七八九十]{1,3})月)?(?:\s*([0-9０-９一二三四五六七八九十]{1,3})日)?/);
  if(m){
    const y = seirekiFromWareki(m[1], kanjiToInt(m[2]));
    if(y) return {y, m: m[3]? kanjiToInt(m[3]) : null, d: m[4]? kanjiToInt(m[4]) : null};
  }
  m = head.match(/[RＲ]\s*([0-9]{1,2})[.．]([0-9]{1,2})[.．]([0-9]{1,2})/);      // R7.3.9 の形
  if(m){ const y = seirekiFromWareki('令和', parseInt(m[1],10)); if(y) return {y, m:parseInt(m[2],10), d:parseInt(m[3],10)}; }
  return null;
}
function speechDateFromMgmt(mgmt){          // 管理番号（書R08.4 など）の年月
  const m = String(mgmt||'').match(/^[^A-Za-z0-9]?([MTSHR])(\d{1,2})\.(\d{1,2})$/);
  if(!m) return null;
  const y = seirekiFromWareki(SPEECH_ERA_BY_LETTER[m[1]], parseInt(m[2],10));
  return y ? {y, m: parseInt(m[3],10)||null, d: null} : null;
}
function speechDateOf(doc){
  if(doc.seirekiYear && doc.seirekiYear>=1868) return {y:doc.seirekiYear, m:doc.seirekiMonth||null, d:doc.seirekiDay||null, src:'date'};
  const t = speechDateFromText(doc.fullText); if(t) return Object.assign(t, {src:'text'});
  const g = speechDateFromMgmt(doc.managementNumber); if(g) return Object.assign(g, {src:'mgmt'});
  return {y:doc.seirekiYear||null, m:doc.seirekiMonth||null, d:doc.seirekiDay||null, src:'orig'};
}
function speechDateLabel(doc, sd){
  if(!sd.y) return '';
  if(sd.src==='orig') return calendarLabel(doc.seirekiYear, doc.seirekiMonth, doc.seirekiDay, doc.warekiText);
  return calendarLabel(sd.y, sd.m, sd.d, speechModernWareki(sd.y, sd.m, sd.d));
}
function mgmtSortKey(s){ const m = String(s||'').match(/^(\d+)\.(\d+)/); return m? [parseInt(m[1],10), parseInt(m[2],10)] : null; }
// 並び順の向き：'desc'＝新しい順（既定）、'asc'＝古い順。日曜勤行では、管理番号の大きい順／小さい順。選んだ向きは、次回も使う
let ARCHIVE_ORDER = (()=>{ try{ return localStorage.getItem('gosho_archive_order')==='asc' ? 'asc' : 'desc'; }catch(e){ return 'desc'; } })();
function toggleArchiveOrder(){
  ARCHIVE_ORDER = (ARCHIVE_ORDER==='desc') ? 'asc' : 'desc';
  try{ localStorage.setItem('gosho_archive_order', ARCHIVE_ORDER); }catch(e){}
  renderArchive();
}
// 題名の下に出す、御文（要文）の最初の一文
function archiveFirstSentence(text){
  const t = String(text||'').replace(/\s+/g, ' ').trim();
  if(!t) return '';
  const i = t.indexOf('。');
  let s = (i>=0) ? t.slice(0, i+1) : t;
  if(s.length>120) s = s.slice(0,120) + '…';
  return s;
}
function archiveComparator(cat, dir){
  dir = dir===-1 ? -1 : 1;
  if(cat==='sunday'){
    return (a,b)=>{
      const ka = mgmtSortKey(a.managementNumber), kb = mgmtSortKey(b.managementNumber);
      if(ka && kb) return dir * ((ka[0]-kb[0]) || (ka[1]-kb[1]));
      if(ka) return -1; if(kb) return 1;                  // 管理番号のないものは、どちら向きでも最後
      return dir * ((a.createdAt||0)-(b.createdAt||0));
    };
  }
  // 並べる順：①講演日が分かるもの（講演日の古い順）→ ②従来の日付だけのもの（その日付の古い順）→ ③日付のないもの
  //   ※六巻抄のように、全部が②のカテゴリは、②の中の日付の順になる
  const rank = d=>{ const s = speechDateOf(d); return s.y==null? 2 : (s.src==='orig'? 1 : 0); };
  const key  = d=>{ const s = speechDateOf(d); return s.y==null? 0 : s.y*10000 + (s.m||0)*100 + (s.d||0); };
  return (a,b)=>{
    return (rank(a)-rank(b)) || dir * (
      (key(a)-key(b)) ||
      String(a.managementNumber||'').localeCompare(String(b.managementNumber||''), 'ja', {numeric:true}) || (a.createdAt||0)-(b.createdAt||0));
  };
}
// 講演日を本文の冒頭から読み取る必要がある書き起こしの本文を、先に読み込んでおく（遅延読み込み）
async function archivePrepareSpeechDates(list){
  const targets = list.filter(d=>!(d.seirekiYear && d.seirekiYear>=1868) && !d._fullLoaded);
  let i = 0;
  const worker = async()=>{ while(i<targets.length){ const d = targets[i++]; try{ await ensureDocFullLoaded(d.id); }catch(e){} } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}
const ARCHIVE_SUNDAY_NOTE = '始めの3桁は日曜勤行冊子の番号と対応しており、「．」の次の数値は冊子の何番目に載っているかを示しています。(例：009.2→日曜勤行⑨の2番目)';
let ARCHIVE_RENDER_SEQ = 0;

async function renderArchive(){
  const el = document.getElementById('archiveContainer');
  if(!el) return;
  const seq = ++ARCHIVE_RENDER_SEQ;

  if(!ARCHIVE_CATEGORY){
    const counts = {};
    STATE.documents.forEach(d=>{ counts[d.category] = (counts[d.category]||0)+1; });
    el.innerHTML = '<div class="archive-cat-grid">' + Object.keys(CATEGORY_META).map(key=>{
      const meta = CATEGORY_META[key];
      const n = counts[key]||0;
      return `<button type="button" class="archive-cat-card" style="border-left-color:${meta.color}" ${n? `onclick="openArchiveCategory('${key}')"` : 'disabled'}>
        <span class="ac-label">${meta.label}</span>
        <span class="ac-count">${n}件</span>
      </button>`;
    }).join('') + '</div>';
    return;
  }

  const cat = ARCHIVE_CATEGORY;
  const meta = CATEGORY_META[cat] || CATEGORY_META.other;
  const list = STATE.documents.filter(d=>d.category===cat);
  const head = `<button type="button" class="btn btn-outline text-xs mb-4" onclick="backToArchiveCategories()"><i class="fa-solid fa-arrow-left"></i>カテゴリ一覧へ戻る</button>
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <h3 class="font-display text-lg" style="color:var(--navy)">${meta.label}（${list.length}件）</h3>
      <button type="button" class="btn btn-outline text-xs ml-auto" onclick="toggleArchiveOrder()" title="押すと、並び順が逆になります"><i class="fa-solid ${ARCHIVE_ORDER==='desc'?'fa-arrow-down-wide-short':'fa-arrow-up-short-wide'}"></i>${cat==='sunday' ? (ARCHIVE_ORDER==='desc'?'番号の大きい順':'番号の小さい順') : (ARCHIVE_ORDER==='desc'?'新しい順':'古い順')}</button>
    </div>
    ${cat==='sunday'? `<p class="text-sm text-gray-500 mb-3" style="line-height:1.8">${escapeHtml(ARCHIVE_SUNDAY_NOTE)}</p>` : ''}`;

  if(cat!=='sunday' && list.some(d=>!(d.seirekiYear && d.seirekiYear>=1868) && !d._fullLoaded)){
    el.innerHTML = head + '<p class="text-sm text-gray-400 py-8 text-center">読み込んでいます…</p>';
    await archivePrepareSpeechDates(list);
    if(seq!==ARCHIVE_RENDER_SEQ || ARCHIVE_CATEGORY!==cat) return;      // 待っている間に、別の画面へ移ったとき
  }
  list.sort(archiveComparator(cat, ARCHIVE_ORDER==='desc' ? -1 : 1));

  const rows = list.length? list.map(d=>{
    const dateStr = (cat==='sunday')? (d.managementNumber||'') : speechDateLabel(d, speechDateOf(d));
    const sub = archiveFirstSentence(d.honbun);
    const hidden = d.timelineInclude===false? '<span class="chip" title="統合年表には表示されていません"><i class="fa-solid fa-eye-slash"></i></span>' : '';
    return `<div class="simple-row" style="border-left-color:${meta.color}" role="button" tabindex="0" onclick="openArchiveDoc('${d.id}')" onkeydown="if(event.key==='Enter')openArchiveDoc('${d.id}')">
      <span class="sr-date">${escapeHtml(dateStr)}</span>
      <span class="sr-title">${escapeHtml(d.title||'（無題）')}</span>
      ${hidden}
      <span class="sr-chev">›</span>
      ${sub? `<span class="sr-sub">${escapeHtml(sub)}</span>` : ''}
    </div>`;
  }).join('') : '<p class="text-sm text-gray-400 py-8 text-center">この分類にはまだ登録がありません</p>';

  el.innerHTML = head + rows;
}

function openArchiveCategory(cat){ ARCHIVE_CATEGORY = cat; renderArchive(); }
function backToArchiveCategories(){ ARCHIVE_CATEGORY = null; renderArchive(); }

async function openArchiveDoc(id){
  await ensureDocFullLoaded(id);
  const d = STATE.documents.find(x=>x.id===id);
  if(!d) return;
  document.getElementById('tlDetailBody').innerHTML = renderDocCard(d);
  openModal('tlDetailModal');
}
