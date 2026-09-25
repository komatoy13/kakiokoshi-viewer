/* ============================================================
   eras.js — 時代区分（統合年表のジャンプボタン・追従ハイライト用）
   ------------------------------------------------------------
   レコード構造：{id, name（名称）, startYear（開始年・西暦。null＝最初から）}
   ・終了年は持たない。「年 → 区分」の判定は、その年以前で最も新しい開始年の区分を採用する
     （区分が重なって見える場合は、より新しい区分が優先される）。
   ・この判定部品（getEras / eraForYear）は年表側の「ジャンプ方式」と
     将来の「絞り込み方式」のどちらからも共通で使える。
   ※ db.js の後に読み込むこと
   ============================================================ */

function defaultEraRanges(){
  return [
    {id:'era_default_1', name:'釈尊在世',     startYear:null},
    {id:'era_default_2', name:'大聖人御在世', startYear:1052},
    {id:'era_default_3', name:'上代〜幕末',   startYear:1337},
    {id:'era_default_4', name:'幕末〜終戦',   startYear:1868},
    {id:'era_default_5', name:'昭和以降',     startYear:1926}
  ];
}

function eraSortKey(e){ return (e.startYear===null || e.startYear===undefined || isNaN(e.startYear)) ? -Infinity : e.startYear; }

// 開始年の昇順に並べた時代区分（未設定なら初期値）。元の配列は変更しない。
function getEras(){
  const src = Array.isArray(STATE.eraRanges) ? STATE.eraRanges : defaultEraRanges();
  return src.slice().sort((a,b)=> eraSortKey(a)-eraSortKey(b));
}

// 西暦年から、その年が属する時代区分（レコード）を返す。どこにも属さなければ null。
function eraForYear(y){
  if(y===null || y===undefined || isNaN(y)) return null;
  const eras = getEras();
  for(let i=eras.length-1; i>=0; i--){
    if(y >= eraSortKey(eras[i])) return eras[i];
  }
  return null;
}

// 編集操作の前に、未設定（null）だった区分を初期値の実体に置き換える
function materializeEras(){
  if(!Array.isArray(STATE.eraRanges)) STATE.eraRanges = defaultEraRanges();
}

/* ---------- 設定タブ：時代区分マスターの管理 ---------- */
function renderEraRangeMaster(){
  const el = document.getElementById('eraRangeMaster');
  if(!el) return;
  const eras = getEras();
  if(eras.length===0){
    el.innerHTML = '<p class="text-xs text-gray-400">時代区分がありません。下のフォームから追加してください。</p>';
    return;
  }
  el.innerHTML = eras.map((e,i)=>`
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xs text-gray-400 w-5 text-right flex-shrink-0">${i+1}</span>
      <input type="text" class="field-input flex-1 min-w-0" value="${escapeHtml(e.name)}" placeholder="名称"
        onchange="updateEraRange('${e.id}','name',this.value)">
      <input type="number" class="field-input flex-shrink-0" style="width:120px" value="${(e.startYear===null||e.startYear===undefined)?'':e.startYear}"
        placeholder="最初から" title="開始年（西暦）。空欄＝最初から"
        onchange="updateEraRange('${e.id}','startYear',this.value)">
      <span class="text-xs text-gray-400 flex-shrink-0">年〜</span>
      <button type="button" class="tag-remove-btn" title="この区分を削除" onclick="removeEraRange('${e.id}')">×</button>
    </div>`).join('');
}

function addEraRange(){
  const nameEl = document.getElementById('newEraNameInput');
  const yearEl = document.getElementById('newEraYearInput');
  const name = (nameEl.value||'').trim();
  if(!name){ alert('区分の名称を入力してください'); return; }
  const ys = (yearEl.value||'').trim();
  const y = ys===''? null : parseInt(ys,10);
  if(ys!=='' && isNaN(y)){ alert('開始年は数字（西暦）で入力してください'); return; }
  materializeEras();
  STATE.eraRanges.push({id: uid(), name, startYear: y});
  nameEl.value = ''; yearEl.value = '';
  persistAll();
  renderEraRangeMaster();
}

function updateEraRange(id, field, val){
  materializeEras();
  const e = STATE.eraRanges.find(x=>x.id===id);
  if(!e) return;
  if(field==='name'){
    const n = (val||'').trim();
    if(n) e.name = n;
  } else if(field==='startYear'){
    const t = (val||'').trim();
    const y = t===''? null : parseInt(t,10);
    e.startYear = (t!=='' && isNaN(y))? e.startYear : y;
  }
  persistAll();
  renderEraRangeMaster(); // 開始年を変えると並び順が変わるため再描画
}

function removeEraRange(id){
  const e = (STATE.eraRanges||defaultEraRanges()).find(x=>x.id===id);
  if(!e) return;
  requestDelete(e.name, ()=>{
    materializeEras();
    STATE.eraRanges = STATE.eraRanges.filter(x=>x.id!==id);
    persistAll();
    renderEraRangeMaster();
  });
}
