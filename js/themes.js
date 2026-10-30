/* ============================================================
   themes.js — テーマタグ（編集アプリ・ビューア共通）
   「御在世」「大石寺歴史」「日本会議」「御遺命守護」のような、話題・テーマのタグ。
   ・出来事・書き起こし（御書・御指導）・人物に、複数付けられる（項目側は themeTagIds＝タグIDの配列）。
   ・タグの一覧（名前・色・並び順）は STATE.themeTags。名前を直しても、付いている全部に反映される。
   ・年表と人物データベースに、テーマの絞り込みボタンを出す（選んだテーマが付いた項目だけ表示）。
   ・タグを付ける・直す処理は、編集アプリ専用の themes-editor.js にある。
   ※ db.js の後、timeline.js などより前に読み込むこと
   ============================================================ */
const THEME_COLORS = ['#3b6ea5','#7a5aa6','#c0652d','#2f8f6f','#b0486b','#8a7a2a','#2c7f8f','#6b6f7a'];
if(!STATE.themeFilter) STATE.themeFilter = {ids: [], mode: 'or'};   // 絞り込みの状態（保存はしない）

function themeTags(){ return Array.isArray(STATE.themeTags) ? STATE.themeTags.slice().sort((a,b)=>(a.order||0)-(b.order||0)) : []; }
function themeTagById(id){ return themeTags().find(t=>t.id===id) || null; }
function themeIdsOf(obj){ return (obj && Array.isArray(obj.themeTagIds)) ? obj.themeTagIds : []; }
function themeChipHtml(t){ return `<span class="theme-chip" style="--tc:${escapeHtml(t.color||'#6b6f7a')}">${escapeHtml(t.name)}</span>`; }
// 項目に付いたテーマの小さな印（詳細表示用）。付いていなければ空
function themeChipsHtml(ids){
  const chips = (ids||[]).map(themeTagById).filter(Boolean).map(themeChipHtml);
  return chips.length ? `<div class="flex flex-wrap gap-1 mt-2">${chips.join('')}</div>` : '';
}

/* ---------- 絞り込み ---------- */
function themeFilterActive(){ return !!(STATE.themeFilter && STATE.themeFilter.ids.length); }
function themeMatch(ids){
  const f = STATE.themeFilter;
  if(!f || !f.ids.length) return true;
  return f.mode==='and' ? f.ids.every(i=>ids.includes(i)) : f.ids.some(i=>ids.includes(i));
}
function passesThemeFilter(item){ return themeMatch(themeIdsOf(item.data)); }
function personPassesTheme(p){ return themeMatch(themeIdsOf(p)); }

function renderThemeBars(){
  const tags = themeTags();
  ['themeBar','personThemeBar'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(!tags.length){ el.innerHTML = ''; el.classList.add('hidden'); return; }
    const f = STATE.themeFilter;
    el.classList.remove('hidden');
    el.innerHTML = '<span class="text-xs font-semibold" style="color:var(--gray)">テーマ：</span>'
      + tags.map(t=>`<button type="button" class="filter-btn theme-btn${f.ids.includes(t.id)?' active':''}" style="--tc:${escapeHtml(t.color||'#6b6f7a')}" onclick="toggleThemeFilter('${t.id}')"><span class="theme-dot"></span>${escapeHtml(t.name)}</button>`).join('')
      + (f.ids.length ? `<span class="text-xs ml-2" style="color:var(--gray)">条件：</span>`
          + `<button type="button" class="filter-btn${f.mode==='or'?' active':''}" onclick="setThemeMode('or')">どれか</button>`
          + `<button type="button" class="filter-btn${f.mode==='and'?' active':''}" onclick="setThemeMode('and')">すべて</button>`
          + `<button type="button" class="text-xs underline ml-1" style="color:var(--navy)" onclick="clearThemeFilter()">解除</button>` : '');
  });
}
function themeRefresh(){
  renderThemeBars();
  const active = document.querySelector('.view.active');
  const id = active ? active.id : '';
  if(id==='view-persons' && typeof renderPersonCards==='function') renderPersonCards();
  else if(typeof renderTimeline==='function') renderTimeline();
}
function toggleThemeFilter(id){
  const f = STATE.themeFilter, i = f.ids.indexOf(id);
  if(i>=0) f.ids.splice(i,1); else f.ids.push(id);
  themeRefresh();
}
function setThemeMode(m){ STATE.themeFilter.mode = (m==='and' ? 'and' : 'or'); themeRefresh(); }
function clearThemeFilter(){ STATE.themeFilter.ids = []; themeRefresh(); }
