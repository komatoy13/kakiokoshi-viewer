/* ============================================================
   db.js — データ層
   STATE・和暦/仏紀変換・LocalStorage/クラウド保存・人物データベース・
   同名御書の整合性チェック（差分比較モーダル）・バックアップ/Gist同期
   ※ 他の全JSファイルより先に読み込むこと
   ============================================================ */

const KANJI_DIGIT = {'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};

function toHalfWidthDigits(s){
  return (s||'').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
function kanjiToInt(s){
  if(s===undefined||s===null||s==='') return null;
  s = toHalfWidthDigits(s.trim());
  if(/^[0-9]+$/.test(s)) return parseInt(s,10);
  if(s==='元') return 1;
  if(s.includes('十')){
    const parts = s.split('十');
    const left = parts[0]===''? 1 : (KANJI_DIGIT[parts[0]]!==undefined?KANJI_DIGIT[parts[0]]:parseInt(parts[0])||1);
    const right = parts[1]===''||parts[1]===undefined ? 0 : (KANJI_DIGIT[parts[1]]!==undefined?KANJI_DIGIT[parts[1]]:parseInt(parts[1])||0);
    return left*10+right;
  }
  if(s.length===1 && KANJI_DIGIT[s]!==undefined) return KANJI_DIGIT[s];
  // fallback: try summing (rare multi-digit without juu)
  let out = 0, ok=true;
  for(const ch of s){ if(KANJI_DIGIT[ch]===undefined){ok=false;break;} out=out*10+KANJI_DIGIT[ch]; }
  return ok? out : null;
}

// era name -> start seireki year (元年)
const ERA_TABLE = {
  '貞応':1222,'元仁':1224,'嘉禄':1225,'安貞':1227,'寛喜':1229,'貞永':1232,'天福':1233,
  '文暦':1234,'嘉禎':1235,'暦仁':1238,'延応':1239,'仁治':1240,'寛元':1243,'宝治':1247,
  '建長':1249,'康元':1256,'正嘉':1257,'正元':1259,'文応':1260,'弘長':1261,'文永':1264,
  '建治':1275,'弘安':1278,'正応':1288,'永仁':1293,'正安':1299,'乾元':1302,'嘉元':1303,
  '徳治':1307,'延慶':1308,'応長':1311,'正和':1312,'文保':1317,'元応':1319,'元亨':1321,
  '正中':1324,'嘉暦':1326,'元徳':1329,'元弘':1331,'正慶':1332,'建武':1334,
  '明治':1868,'大正':1912,'昭和':1926,'平成':1989,'令和':2019
};
const ERA_LETTER = {'明治':'M','大正':'T','昭和':'S','平成':'H','令和':'R'};
const ERA_NAMES_SORTED = Object.keys(ERA_TABLE).sort((a,b)=>b.length-a.length);

function seirekiFromWareki(era, waYear){
  if(!ERA_TABLE[era] || waYear===null) return null;
  return ERA_TABLE[era] + waYear - 1;
}
function butsukiFromSeireki(y){ return (y===null||y===undefined||isNaN(y))? null : y+949; }

// Parse free text like "弘安元年十一月二十九日" -> {era,waYear,month,day,seirekiYear,...}
function parseWarekiText(text){
  if(!text) return null;
  for(const era of ERA_NAMES_SORTED){
    const idx = text.indexOf(era);
    if(idx===-1) continue;
    const rest = text.slice(idx+era.length);
    const m = rest.match(/^([0-9０-９〇一二三四五六七八九十百千元]{1,4})年(?:\s*([0-9０-９一二三四五六七八九十]{1,3})月)?(?:\s*([0-9０-９一二三四五六七八九十]{1,3})日)?/);
    if(!m) continue;
    const waYear = kanjiToInt(m[1]);
    const month = m[2]? kanjiToInt(m[2]) : null;
    const day = m[3]? kanjiToInt(m[3]) : null;
    const seirekiYear = seirekiFromWareki(era, waYear);
    return {era, waYear, month, day, seirekiYear, butsuki: butsukiFromSeireki(seirekiYear)};
  }
  // fallback: 西暦○○年 pattern
  const m2 = text.match(/西暦\s*([0-9]{3,4})年/);
  if(m2) return {era:null, waYear:null, month:null, day:null, seirekiYear:parseInt(m2[1]), butsuki: butsukiFromSeireki(parseInt(m2[1]))};
  return null;
}

function pad2(n){ return (n<10? '0':'')+n; }
function pad3(n){ return String(n).padStart(3,'0'); }

function uid(){ return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }

/* ============================================================
   和暦ピッカー共通ヘルパー
   タイピングなしで「元号／年／月／日」をタップ・クリックだけで
   選べるようにするための <select> 生成関数群。
   f_wareki（御書フォーム）・ev_wareki（出来事フォーム）・
   人物DBの生没年の3箇所で共用する。
   ============================================================ */

// 元号名 -> 元年（西暦）の一覧を、時代順（古い→新しい）に並べた配列で返す
function eraNamesChronological(){
  return Object.keys(ERA_TABLE).sort((a,b)=>ERA_TABLE[a]-ERA_TABLE[b]);
}

// 過去に実際に入力された実績のある元号（御書データ・人物DBの生没年）の使用回数を集計。
// クイック選択チップの並び順（よく使う元号を左側に）に使う。
function eraUsageCounts(){
  const counts = {};
  const bump = era => { if(!era) return; counts[era] = (counts[era]||0)+1; };
  (STATE.documents||[]).forEach(d=>{ const wk = parseWarekiText(d.warekiText||''); if(wk) bump(wk.era); });
  (STATE.events||[]).forEach(e=>{ const wk = parseWarekiText(e.warekiText||''); if(wk) bump(wk.era); });
  (STATE.persons||[]).forEach(p=>{ bump(p.birthEra); bump(p.deathEra); });
  return counts;
}

// クイック選択チップに出す元号の並び：①実績のある元号（使用回数順）②主要元号（未実績でも常に表示）
const ERA_CHIP_DEFAULTS = ['文永','建治','弘安','貞応','明治','大正','昭和','平成','令和'];
function eraChipList(){
  const counts = eraUsageCounts();
  const used = Object.keys(counts).sort((a,b)=> counts[b]-counts[a]);
  const list = [...used];
  ERA_CHIP_DEFAULTS.forEach(e=>{ if(!list.includes(e)) list.push(e); });
  return list.slice(0,12);
}

function buildEraSelectOptions(selectedEra){
  const opts = ['<option value="">（元号を選択）</option>'];
  eraNamesChronological().forEach(era=>{
    opts.push(`<option value="${escapeHtml(era)}" ${selectedEra===era?'selected':''}>${escapeHtml(era)}（${ERA_TABLE[era]}〜）</option>`);
  });
  return opts.join('');
}

function buildYearSelectOptions(selectedYear, max){
  max = max||99;
  const opts = ['<option value="">（年）</option>'];
  for(let y=1;y<=max;y++){
    opts.push(`<option value="${y}" ${selectedYear==y?'selected':''}>${y===1?'元年（1年）':y+'年'}</option>`);
  }
  return opts.join('');
}

function buildMonthSelectOptions(selectedMonth){
  const opts = ['<option value="">（月・任意）</option>'];
  for(let m=1;m<=12;m++){ opts.push(`<option value="${m}" ${selectedMonth==m?'selected':''}>${m}月</option>`); }
  return opts.join('');
}

function buildDaySelectOptions(selectedDay){
  const opts = ['<option value="">（日・任意）</option>'];
  for(let d=1;d<=31;d++){ opts.push(`<option value="${d}" ${selectedDay==d?'selected':''}>${d}日</option>`); }
  return opts.join('');
}

// 元号チップのHTML（クリック／タップで選択）。onClickJs には
// 「そのチップを押したときに実行するJS文字列」を渡す（例：'setEraChip(\'f\',"弘安")'）
function buildEraChipsHtml(namespace, currentEra){
  return eraChipList().map(era=>
    `<button type="button" class="filter-btn era-chip ${currentEra===era?'active':''}" onclick="setEraChip('${namespace}','${escapeHtml(era)}')">${escapeHtml(era)}</button>`
  ).join('');
}

function composeWarekiText(era, year, month, day){
  if(!era || !year) return '';
  let t = era + year + '年';
  if(month) t += month + '月';
  if(day) t += day + '日';
  return t;
}

// 「語句（読み）」「語句〔読み〕」表記から読みを抽出。無ければ語句自体を読みとする
function extractReading(term){
  const t = (term||'').trim();
  if(!t) return {word:'', reading:''};
  const m = t.match(/^(.*?)[（(]([^）)]{1,30})[）)]\s*$/) || t.match(/^(.*?)[〔]([^〕]{1,30})[〕]\s*$/);
  if(m) return {word:m[1].trim(), reading:m[2].trim()};
  return {word:t, reading:t};
}

// モーダル表示制御（Tailwindのhidden/flexユーティリティを直接切替）
function openModal(id){ const el=document.getElementById(id); el.classList.remove('hidden'); el.classList.add('flex'); }
function closeModal(id){ const el=document.getElementById(id); el.classList.add('hidden'); el.classList.remove('flex'); }

/* ============================================================
   汎用の削除確認モーダル（誤削除防止）
   「完全に削除する」を選んだ時のみ、渡されたコールバックを実行して物理削除する。
   ============================================================ */
let PENDING_DELETE = null;
function requestDelete(label, onConfirm){
  PENDING_DELETE = onConfirm;
  document.getElementById('confirmDeleteText').textContent =
    `「${label}」を完全に削除します。この操作は元に戻せません。よろしいですか？`;
  openModal('confirmDeleteModal');
}
function confirmDeleteExecute(){
  const cb = PENDING_DELETE;
  PENDING_DELETE = null;
  closeModal('confirmDeleteModal');
  if(typeof cb === 'function') cb();
}
function cancelDelete(){ PENDING_DELETE = null; closeModal('confirmDeleteModal'); }

/* ============================================================
   STATE
   ============================================================ */
const CATEGORY_META = {
  sunday:{label:'日曜勤行', color:'var(--c-sunday)'},
  lecture:{label:'御書講義', color:'var(--c-lecture)'},
  gohoon:{label:'御報恩勤行会', color:'var(--c-gohoon)'},
  taikai:{label:'御大会式', color:'var(--c-taikai)'},
  sokan:{label:'総幹部会', color:'var(--c-sokan)'},
  rokkan:{label:'六巻抄', color:'var(--c-rokkan)'},
  other:{label:'その他', color:'var(--c-other)'}
};

const DEFAULT_PERSONS = [
  {id:'p_nichiren', name:'日蓮大聖人', reading:'にちれんだいしょうにん', alias:'', ageMethod:'kazoe', deathLabel:'御入滅',
    birthEra:'貞応', birthWaYear:1, birthMonth:null, birthDay:null,
    deathEra:'弘安', deathWaYear:5, deathMonth:10, deathDay:13, deathAgeText:'聖寿61歳',
    relationshipTags:[], periodTags:['御在世'],
    summary:'日蓮正宗の御本仏。', bio:'', notes:''},
  {id:'p_nikko', name:'日興上人', reading:'にっこうしょうにん', alias:'', ageMethod:'kazoe', deathLabel:'御遷化',
    birthEra:'寛元', birthWaYear:4, birthMonth:null, birthDay:null,
    deathEra:'正慶', deathWaYear:2, deathMonth:2, deathDay:7, deathAgeText:'88歳',
    relationshipTags:['門下僧'], periodTags:['御在世'],
    summary:'日蓮大聖人の直弟子で第二祖。', bio:'', notes:''},
  {id:'p_nichimoku', name:'日目上人', reading:'にちもくしょうにん', alias:'', ageMethod:'kazoe', deathLabel:'御遷化',
    birthEra:'建長', birthWaYear:7, birthMonth:null, birthDay:null,
    deathEra:'正慶', deathWaYear:2, deathMonth:11, deathDay:15, deathAgeText:'74歳',
    relationshipTags:['門下僧'], periodTags:['御在世'],
    summary:'日興上人の後を継いだ第三祖。', bio:'', notes:''},
  {id:'p_nikkan', name:'日寛上人', reading:'にちかんしょうにん', alias:'', ageMethod:'kazoe', deathLabel:'御遷化',
    birthEra:'寛文', birthWaYear:5, birthMonth:null, birthDay:null,
    deathEra:'享保', deathWaYear:11, deathMonth:8, deathDay:19, deathAgeText:'62歳',
    relationshipTags:['門下僧'], periodTags:['江戸時代'],
    summary:'教学の中興の祖と仰がれる第二十六世。', bio:'', notes:''},
  {id:'p_asaisensei', name:'浅井先生', reading:'あさいせんせい', alias:'', ageMethod:'man', deathLabel:'御逝去',
    birthEra:'昭和', birthWaYear:6, birthMonth:11, birthDay:30,
    deathEra:'令和', deathWaYear:5, deathMonth:10, deathDay:16, deathAgeText:'91歳',
    relationshipTags:['門下在家'], periodTags:['戦前・戦中','近代'],
    summary:'顕正会初代会長。', bio:'', notes:''},
  {id:'p_asaikaicho', name:'浅井会長', reading:'あさいかいちょう', alias:'', ageMethod:'man', deathLabel:'',
    birthEra:null, birthWaYear:null, birthMonth:null, birthDay:null,
    deathEra:null, deathWaYear:null, deathMonth:null, deathDay:null, deathAgeText:'',
    relationshipTags:['門下在家'], periodTags:['近代'],
    summary:'顕正会現会長。', bio:'', notes:''}
];
// 寛文/享保 not in ERA_TABLE by default (Edo era) -> add
ERA_TABLE['寛文']=1661; ERA_TABLE['享保']=1716;
ERA_NAMES_SORTED.length=0; Object.keys(ERA_TABLE).sort((a,b)=>b.length-a.length).forEach(e=>ERA_NAMES_SORTED.push(e));

/* ============================================================
   保存アーキテクチャ（v3）：文書ごとの個別キー化＋デバウンス＋遅延読み込み
   ------------------------------------------------------------
   v2まで：全文書・人物・設定を1つの巨大なJSONにまとめて保存していた（persistAll）。
     文書数・本文が増えると、些細な変更のたびに全データを再シリアライズ・再送信する
     ことになり重くなる。またクラウド保存は1キー5MBの上限があり、いずれ保存自体が
     失敗するおそれがある。
   v3から：
     - 索引（一覧表示に必要な軽い情報。fullTextという「重いフィールド」は
       含まない）を1つのキーにまとめて保存
     - 文書ごとの重いフィールドは `doc_full:<id>` という個別キーに分割保存し、
       実際にその文書を開いた時だけ読み込む（遅延読み込み・一度読めばメモリにキャッシュ）
   移行時は、事故に備えて旧形式データを自動でJSONファイルにダウンロードし、
   旧データも削除せず残したまま、新形式の書き込みが成功した場合のみ「移行済み」フラグを
   立てる。フラグが立つまでは何度アプリを開いても旧形式から安全に再移行を試みる。
   ============================================================ */
const STORAGE_KEY = 'gosho_app_data';           // 旧形式（v2）：読み込み専用（後方互換）
const INDEX_KEY = 'gosho_app_index_v3';         // 新形式：索引（軽量データ）
const MIGRATION_FLAG_KEY = 'gosho_app_migrated_v3';
const CLOUD_AVAILABLE = (typeof window!=='undefined') && !!window.storage;
const DOC_HEAVY_FIELDS = ['fullText'];
const DOC_TRANSIENT_FIELDS = ['_fullLoaded']; // 実行時だけのフラグ。索引にも本文キーにも保存しない

function docFullKey(id){ return 'doc_full:'+id; }

async function storageGet(key){
  if(CLOUD_AVAILABLE){
    try{
      const res = await window.storage.get(key, false);
      if(res && res.value) return res.value;
    }catch(e){ /* クラウド未保存/失敗時はlocalStorageにフォールバック */ }
  }
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}
async function storageSet(key, value){
  try{ localStorage.setItem(key, value); }catch(e){ /* 容量超過等はlocalStorageのみ諦める */ }
  if(CLOUD_AVAILABLE){
    try{ await window.storage.set(key, value, false); }
    catch(e){ console.error('クラウド同期に失敗しました：'+key, e); }
  }
}
async function storageDelete(key){
  try{ localStorage.removeItem(key); }catch(e){ /* noop */ }
  if(CLOUD_AVAILABLE){
    try{ await window.storage.delete(key, false); }catch(e){ /* 元々無ければ失敗するが無視してよい */ }
  }
}

// 文書を「索引用の軽いコピー」に変換する（fullText・実行時フラグを除いた残り全部）
function toLightDoc(d){
  const light = {};
  Object.keys(d).forEach(k=>{ if(!DOC_HEAVY_FIELDS.includes(k) && !DOC_TRANSIENT_FIELDS.includes(k)) light[k] = d[k]; });
  return light;
}

function formatBackupTimestamp(){
  const d = new Date();
  const p = n=>String(n).padStart(2,'0');
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes());
}
// 事故防止のための自動バックアップ：現在のデータを丸ごとJSONファイルとしてダウンロードする
function downloadJsonBackup(data, filename){
  try{
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }catch(e){ console.error('バックアップファイルの生成に失敗しました', e); }
}

// ------------------------------------------------------------
// 移行処理：実行前に必ず全データを自動バックアップし、旧データは削除せず残したまま
// 新形式（索引＋文書ごとの個別キー）を書き込む。成功した場合のみ移行済みフラグを立てる。
// ------------------------------------------------------------
async function migrateToPerDocStorage(oldData){
  try{
    downloadJsonBackup(oldData, 'gosho_backup_before_migration_'+formatBackupTimestamp()+'.json');

    const docs = oldData.documents || [];
    for(const d of docs){
      const heavy = {fullText: d.fullText||''};
      await storageSet(docFullKey(d.id), JSON.stringify(heavy));
    }

    const indexPayload = {
      documents: docs.map(toLightDoc),
      events: oldData.events || [],
      persons: oldData.persons || DEFAULT_PERSONS,
      settings: oldData.settings || {},
      relationTagsMaster: oldData.relationTagsMaster || ['門下僧','門下在家','邪宗僧','鎌倉幕府'],
      goshoMaster: oldData.goshoMaster || [],
      mergedGoshos: oldData.mergedGoshos || []
    };
    await storageSet(INDEX_KEY, JSON.stringify(indexPayload));
    await storageSet(MIGRATION_FLAG_KEY, '1');
    console.log('データ構造の移行が完了しました（旧データはバックアップとして残されています）');
  }catch(e){
    console.error('データ移行に失敗しました。旧形式のまま動作を継続します。', e);
    // フラグを立てないので、次回起動時にも旧形式からの再移行が試みられる（安全側に倒す）
  }
}

// ------------------------------------------------------------
// 起動時の読み込み：新形式（索引）があればそれを使用。無ければ旧形式を読み込んだ上で
// 安全な移行を実行する。新形式の読み込みに失敗した場合も旧形式へ自動フォールバックする。
// ------------------------------------------------------------
async function loadAppData(){
  const migrated = await storageGet(MIGRATION_FLAG_KEY);
  if(migrated){
    try{
      const indexRaw = await storageGet(INDEX_KEY);
      if(indexRaw) return JSON.parse(indexRaw); // documents は軽量版（fullTextは未読み込み）
    }catch(e){
      console.error('新形式データの読み込みに失敗しました。旧形式へフォールバックします。', e);
    }
  }
  let oldData = null;
  try{
    const raw = await storageGet(STORAGE_KEY);
    if(raw) oldData = JSON.parse(raw);
  }catch(e){ /* noop */ }
  if(!oldData){
    try{
      const documents = JSON.parse(localStorage.getItem('gosho_documents')||'[]');
      const events = JSON.parse(localStorage.getItem('gosho_events')||'[]');
      const persons = JSON.parse(localStorage.getItem('gosho_persons')||'null');
      const settings = JSON.parse(localStorage.getItem('gosho_settings')||'null');
      if((documents&&documents.length) || (events&&events.length)){
        oldData = {documents, events, persons: persons||undefined, settings: settings||undefined};
      }
    }catch(e){ /* noop */ }
  }
  if(!oldData) return null; // 初回起動：何も保存されていない

  if(!migrated) await migrateToPerDocStorage(oldData);
  (oldData.documents||[]).forEach(d=>{ d._fullLoaded = true; }); // 移行直後はメモリ上のデータがそのまま最新
  return oldData;
}

// ------------------------------------------------------------
// 文書の「重いフィールド」を必要になった時だけ読み込む（遅延読み込み）。
// 一度読み込んだ文書はSTATE.documents上にキャッシュされ、以後は再取得しない。
// ------------------------------------------------------------
async function ensureDocFullLoaded(id){
  const d = STATE.documents.find(x=>x.id===id);
  if(!d) return null;
  if(d._fullLoaded) return d; // 既に読み込み済み（メモリ上に本当のデータがある）
  try{
    const raw = await storageGet(docFullKey(id));
    const heavy = raw? JSON.parse(raw) : {fullText:''};
    d.fullText = heavy.fullText || '';
  }catch(e){
    console.error('文書本文の読み込みに失敗しました：'+id, e);
    d.fullText = d.fullText || '';
  }
  d._fullLoaded = true;
  return d;
}

// ------------------------------------------------------------
// 保存（デバウンス付き）：連続する変更は500msまとめてから1回だけ書き込む
// ------------------------------------------------------------
const _debounceTimers = {};
function debounce(key, fn, delay){
  if(_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(()=>{ delete _debounceTimers[key]; fn(); }, delay==null?500:delay);
}

async function persistIndexNow(){
  const payload = {
    documents: STATE.documents.map(toLightDoc),
    events: STATE.events,
    persons: STATE.persons,
    settings: STATE.settings,
    relationTagsMaster: STATE.relationTagsMaster,
    goshoMaster: STATE.goshoMaster,
    mergedGoshos: STATE.mergedGoshos,
    eraRanges: STATE.eraRanges
  };
  await storageSet(INDEX_KEY, JSON.stringify(payload));
}
// 文書一覧・人物・設定など「軽いデータ」の保存（デバウンス経由）
function persistAll(){ debounce('index', persistIndexNow, 500); }

async function persistDocFullNow(id){
  const d = STATE.documents.find(x=>x.id===id);
  if(!d) return;
  const heavy = {fullText: d.fullText||''};
  await storageSet(docFullKey(id), JSON.stringify(heavy));
}
// 文書の本文・御文（重いデータ）の保存（デバウンス経由、文書ごとに個別）
function persistDocFull(id){ debounce('docfull:'+id, ()=>persistDocFullNow(id), 500); }
async function deleteDocFull(id){ await storageDelete(docFullKey(id)); }

let STATE = {
  documents: [],
  events: [],
  persons: DEFAULT_PERSONS,
  settings: {},
  calendarMode: 'wareki', // 年表の日付は和暦表示に固定
  eraRanges: null, // 時代区分（null＝未設定→初期値を使う）。eras.js で管理
  typeFilters: {doc:true, general:true, follower:true},
  searchQuery: '',
  noteCategoryFilter: 'all',
  editingId: null,
  timelineEditMode: false,
  editingEventId: null,
  personBrowse: {query:'', kana:'all', relation:'all', period:'all'},
  personEdit: {query:'', kana:'all', expandedIds:null},
  goshoEdit: {query:'', expandedIds:null},
  crossSearch: {query:'', tab:'all'},
  relationTagsMaster: ['門下僧','門下在家','邪宗僧','鎌倉幕府'],
  goshoMaster: [], // {id, name, era, waYear, month, day, recipient, author, note} の配列
  mergedGoshos: [],
  mergeSelectedGoshoId: '',
  mergeCompare: null, // {leftBlockId, rightBlockId, preset, editedManually} 統合比較モーダルの状態
  mergeSelectedFragmentIds: []
};

function personSeireki(p, which){
  const era = which==='birth'? p.birthEra : p.deathEra;
  const wy = which==='birth'? p.birthWaYear : p.deathWaYear;
  if(era && wy!==null && wy!==undefined) return seirekiFromWareki(era, wy);
  return null;
}

function computeAge(authorName, seirekiYear, seirekiMonth, seirekiDay){
  if(!seirekiYear) return null;
  const p = STATE.persons.find(pp=>pp.name===authorName);
  if(!p) return null;
  const birthY = personSeireki(p,'birth');
  if(!birthY) return null;
  if(p.ageMethod==='kazoe'){
    return seirekiYear - birthY + 1;
  } else {
    let age = seirekiYear - birthY;
    if(p.birthMonth && seirekiMonth){
      if(seirekiMonth < p.birthMonth || (seirekiMonth===p.birthMonth && seirekiDay && p.birthDay && seirekiDay < p.birthDay)) age -= 1;
    }
    return age;
  }
}

/* ============================================================
   人物DBカード表示：属性バッジ・活動年代・50音インデックス・
   関連御書／関連年表出来事の紐付け
   ============================================================ */
const RELATION_TAGS_DEFAULT = ['門下僧','門下在家','邪宗僧','鎌倉幕府'];
const PERIOD_TAGS = ['釈尊在世','正法','像法','御在世','戦国時代','江戸時代','戦前・戦中','近代'];
const KANA_ROWS = [
  {key:'あ', chars:'あいうえおぁぃぅぇぉ'},
  {key:'か', chars:'かきくけこがぎぐげご'},
  {key:'さ', chars:'さしすせそざじずぜぞ'},
  {key:'た', chars:'たちつてとだぢづでどっ'},
  {key:'な', chars:'なにぬねの'},
  {key:'は', chars:'はひふへほばびぶべぼぱぴぷぺぽ'},
  {key:'ま', chars:'まみむめも'},
  {key:'や', chars:'やゆよゃゅょ'},
  {key:'ら', chars:'らりるれろ'},
  {key:'わ', chars:'わをんゎ'}
];
function kanaRow(reading){
  const c = (reading||'').trim()[0];
  if(!c) return '他';
  const hit = KANA_ROWS.find(r=>r.chars.includes(c));
  return hit? hit.key : '他';
}
function personActivityLabel(p){
  const by = personSeireki(p,'birth');
  const dy = personSeireki(p,'death');
  if(by && dy) return `西暦${by}〜${dy}年`;
  if(by) return `西暦${by}年〜`;
  if(dy) return `〜西暦${dy}年`;
  return '';
}
function personRelatedDocs(p){
  return STATE.documents.filter(d=> d.recipient===p.name || d.author===p.name);
}
function personRelatedEvents(p){
  const manual = STATE.events.filter(e=>e.person===p.name);
  const auto = (typeof personAutoEvents==='function'? personAutoEvents():[]).filter(e=>e.person===p.name);
  return [...manual, ...auto].sort((a,b)=>(a.seirekiYear||0)-(b.seirekiYear||0));
}

/* ============================================================
   同名御書データの自動整合性チェック・一括統一機能
   ============================================================ */
// 同じ「御書名」を持つ既存データ（excludeId自身は除く）を探す。複数あってもDB側は
// 既に一貫している前提で、最初に見つかったものを比較の基準として用いる。
function checkTitleConflict(title, excludeId){
  const t = (title||'').trim();
  if(!t) return null;
  return STATE.documents.find(d=> d.id!==excludeId && (d.title||'').trim()===t) || null;
}

function formatDateDisplay(d){
  if(d.warekiText) return d.warekiText;
  if(d.seirekiYear) return d.seirekiYear+'年'+(d.seirekiMonth?d.seirekiMonth+'月':'')+(d.seirekiDay?d.seirekiDay+'日':'');
  return '';
}

// 著者・受持者・日付（和暦／西暦）・年齢の4項目のうち、1つでも異なれば不一致とみなす
function valuesDiffer(existing, incoming){
  const diffs = {};
  if((existing.author||'') !== (incoming.author||'')) diffs.author = true;
  if((existing.recipient||'') !== (incoming.recipient||'')) diffs.recipient = true;
  const existingDateKey = [existing.warekiText||'', existing.seirekiYear||'', existing.seirekiMonth||'', existing.seirekiDay||''].join('|');
  const incomingDateKey = [incoming.warekiText||'', incoming.seirekiYear||'', incoming.seirekiMonth||'', incoming.seirekiDay||''].join('|');
  if(existingDateKey !== incomingDateKey) diffs.date = true;
  if((existing.ageNote||'') !== (incoming.ageNote||'')) diffs.age = true;
  return diffs;
}

let pendingConflictResolve = null;

// 差分比較モーダルを表示し、ユーザーの選択（'existing'/'incoming'/'keep'）をPromiseで返す
function showConflictModal(title, existingDoc, incomingValues, diffs){
  return new Promise(resolve=>{
    pendingConflictResolve = resolve;
    document.getElementById('conflictModalTitle').innerHTML =
      '<i class="fa-solid fa-triangle-exclamation mr-2"></i>【データ不一致の警告】『'+escapeHtml(title)+'』の既存データと今回の入力内容に差分があります。';
    const rows = [
      ['author', '著者', existingDoc.author, incomingValues.author],
      ['recipient', '受持者', existingDoc.recipient, incomingValues.recipient],
      ['date', '日付', formatDateDisplay(existingDoc), formatDateDisplay(incomingValues)],
      ['age', '年齢', existingDoc.ageNote, incomingValues.ageNote]
    ];
    document.getElementById('conflictModalBody').innerHTML = rows.map(([key,label,ex,inc])=>{
      const changed = !!diffs[key];
      return `<tr style="border-bottom:1px solid var(--line); ${changed?'background:#fff3e0':''}">
        <td class="py-2 pr-3 font-semibold whitespace-nowrap">${escapeHtml(label)}${changed?' <span style=\"color:#c1473f\">●</span>':''}</td>
        <td class="py-2 pr-3">${escapeHtml(ex||'（空欄）')}</td>
        <td class="py-2">${escapeHtml(inc||'（空欄）')}</td>
      </tr>`;
    }).join('');
    openModal('conflictModal');
  });
}
function resolveConflictChoice(choice){
  closeModal('conflictModal');
  if(pendingConflictResolve){ pendingConflictResolve(choice); pendingConflictResolve = null; }
}

// 「今回の入力データで統一する」が選ばれた場合、同名の既存データすべてを一括更新し、
// 人物DBに基づいて年齢も再計算する
function unifyExistingWithIncoming(title, incoming, excludeId){
  const matches = STATE.documents.filter(d=> d.id!==excludeId && (d.title||'').trim()===title.trim());
  const recalculated = computeAge(incoming.author, incoming.seirekiYear, incoming.seirekiMonth, incoming.seirekiDay);
  const ageForOthers = recalculated!==null ? recalculated+'歳' : incoming.ageNote;
  matches.forEach(m=>{
    m.author = incoming.author;
    m.recipient = incoming.recipient;
    m.warekiText = incoming.warekiText;
    m.seirekiYear = incoming.seirekiYear;
    m.seirekiMonth = incoming.seirekiMonth;
    m.seirekiDay = incoming.seirekiDay;
    m.butsuki = incoming.butsuki;
    m.ageNote = ageForOthers;
    m.updatedAt = Date.now();
  });
  return matches.length;
}

// 「既存のデータで統一する」が選ばれた場合、今回の入力側を既存データの値に合わせ、
// 人物DBに基づいて年齢を再計算する
function applyExistingValuesTo(target, existingDoc){
  target.author = existingDoc.author;
  target.recipient = existingDoc.recipient;
  target.warekiText = existingDoc.warekiText;
  target.seirekiYear = existingDoc.seirekiYear;
  target.seirekiMonth = existingDoc.seirekiMonth;
  target.seirekiDay = existingDoc.seirekiDay;
  target.butsuki = existingDoc.butsuki;
  const recalculated = computeAge(target.author, target.seirekiYear, target.seirekiMonth, target.seirekiDay);
  target.ageNote = recalculated!==null ? recalculated+'歳' : existingDoc.ageNote;
  return target;
}

// ファイル読み込み完了時：解析結果（draft）を既存の同名データと照合し、必要ならモーダルで選択させる
async function resolveTitleConflictForDraft(draft){
  const existingDoc = checkTitleConflict(draft.title, null);
  if(!existingDoc) return draft;
  const diffs = valuesDiffer(existingDoc, draft);
  if(Object.keys(diffs).length===0) return draft;
  const choice = await showConflictModal(draft.title, existingDoc, draft, diffs);
  if(choice==='existing'){
    applyExistingValuesTo(draft, existingDoc);
  } else if(choice==='incoming'){
    const count = unifyExistingWithIncoming(draft.title, draft, null);
    if(count>0){ persistAll(); renderDocList(); }
  }
  // 'keep' の場合は何もせずそのまま
  return draft;
}

// 保存／更新ボタン押下時：これから保存するdocを既存の同名データと照合し、必要ならモーダルで選択させる
async function resolveTitleConflictForSave(doc, excludeId){
  const existingDoc = checkTitleConflict(doc.title, excludeId);
  if(!existingDoc) return doc;
  const diffs = valuesDiffer(existingDoc, doc);
  if(Object.keys(diffs).length===0) return doc;
  const choice = await showConflictModal(doc.title, existingDoc, doc, diffs);
  if(choice==='existing'){
    applyExistingValuesTo(doc, existingDoc);
  } else if(choice==='incoming'){
    unifyExistingWithIncoming(doc.title, doc, excludeId);
  }
  // 'keep' の場合は何もせずそのまま保存
  return doc;
}

/* ============================================================
   TABS
   ============================================================ */
function ensureRecipientPerson(name){
  const trimmed = (name||'').trim();
  if(!trimmed) return;
  const exists = STATE.persons.some(p=>p.name===trimmed);
  if(exists) return;
  STATE.persons.push({
    id: uid(), name: trimmed, reading:'', alias:'', ageMethod:'kazoe', deathLabel:'',
    birthEra:null, birthWaYear:null, birthMonth:null, birthDay:null,
    deathEra:null, deathWaYear:null, deathMonth:null, deathDay:null, deathAgeText:'',
    relationshipTags:[], periodTags:[], summary:'', bio:'', notes:''
  });
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ============================================================
   TIMELINE
   ============================================================ */
/* 設定タブの人物編集一覧：件数が増えても探しやすいよう、検索・50音絞り込み・
   1行要約＋クリックで展開（アコーディオン）に対応する。 */
function onPersonEditSearch(){
  STATE.personEdit.query = document.getElementById('personEditSearch').value;
  renderPersonTable();
}
function setPersonEditKana(k){ STATE.personEdit.kana = k; renderPersonTable(); }
function togglePersonEditExpand(id){
  if(!STATE.personEdit.expandedIds) STATE.personEdit.expandedIds = new Set();
  if(STATE.personEdit.expandedIds.has(id)) STATE.personEdit.expandedIds.delete(id);
  else STATE.personEdit.expandedIds.add(id);
  renderPersonTable();
}

function renderPersonTable(){
  const el = document.getElementById('personTable');
  if(!el) return;
  if(!STATE.personEdit.expandedIds) STATE.personEdit.expandedIds = new Set();

  // 50音インデックス（人物DBカード画面と同じ区分を流用）
  const kanaEl = document.getElementById('personEditKanaIndex');
  if(kanaEl){
    kanaEl.innerHTML = `<button type="button" class="filter-btn ${STATE.personEdit.kana==='all'?'active':''}" onclick="setPersonEditKana('all')">すべて</button>` +
      KANA_ROWS.map(r=>`<button type="button" class="filter-btn ${STATE.personEdit.kana===r.key?'active':''}" onclick="setPersonEditKana('${r.key}')">${r.key}</button>`).join('');
  }

  // 元の配列インデックス（updatePerson等が使う）を保ったまま絞り込む
  let entries = STATE.persons.map((p,idx)=>({p, idx}));
  if(STATE.personEdit.kana!=='all') entries = entries.filter(e=>kanaRow(e.p.reading)===STATE.personEdit.kana);
  const q = (STATE.personEdit.query||'').trim().toLowerCase();
  if(q) entries = entries.filter(e=> (e.p.name+' '+(e.p.reading||'')+' '+(e.p.alias||'')+' '+(e.p.summary||'')).toLowerCase().includes(q));

  const countEl = document.getElementById('personEditCount');
  if(countEl) countEl.textContent = `${entries.length}件 / 全${STATE.persons.length}件`;

  if(!entries.length){
    el.innerHTML = '<p class="text-sm text-gray-400 py-6 text-center">該当する人物がいません。</p>';
    return;
  }

  el.innerHTML = entries.map(({p, idx})=>{
    const expanded = STATE.personEdit.expandedIds.has(p.id);
    const badges = (p.relationshipTags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('');
    const activity = personActivityLabel(p);
    if(!expanded){
      // 折りたたみ時：1行の要約だけを表示する
      return `<div class="border rounded-lg px-3 py-2 cursor-pointer hover:bg-black/5" style="border-color:var(--line)" onclick="togglePersonEditExpand('${p.id}')">
        <div class="flex items-center gap-2 flex-wrap">
          <i class="fa-solid fa-chevron-right text-xs" style="color:var(--gray)"></i>
          <span class="font-semibold text-sm">${escapeHtml(p.name)}</span>
          ${p.reading? `<span class="text-xs text-gray-400">（${escapeHtml(p.reading)}）</span>`:''}
          ${badges}
          ${activity? `<span class="text-xs" style="color:var(--gray)">${escapeHtml(activity)}</span>`:''}
        </div>
      </div>`;
    }
    return `
    <div class="border rounded-lg p-3" style="border-color:var(--line)">
      <div class="flex items-center gap-2 mb-2 cursor-pointer" onclick="togglePersonEditExpand('${p.id}')">
        <i class="fa-solid fa-chevron-down text-xs" style="color:var(--gray)"></i>
        <span class="font-semibold text-sm">${escapeHtml(p.name)}</span>
        <span class="text-xs text-gray-400 ml-auto">クリックで折りたたむ</span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <input class="field-input font-semibold flex-1" value="${escapeHtml(p.name)}" placeholder="氏名" onchange="updatePerson(${idx},'name',this.value)">
        <input class="field-input flex-1" placeholder="よみ（50音検索用）例：にちれんだいしょうにん" value="${escapeHtml(p.reading||'')}" onchange="updatePerson(${idx},'reading',this.value)">
        <button class="btn btn-danger text-xs flex-shrink-0" onclick="removePerson(${idx})"><i class="fa-solid fa-trash"></i>削除</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
        <input class="field-input" placeholder="別称（カード表示用）例：伊予房" value="${escapeHtml(p.alias||'')}" onchange="updatePerson(${idx},'alias',this.value)">
        <input class="field-input sm:col-span-2" placeholder="概要（カードに1〜2行で表示）" value="${escapeHtml(p.summary||'')}" onchange="updatePerson(${idx},'summary',this.value)">
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label class="field-label">生年月日</label>
          <div class="flex flex-wrap gap-1 mb-1">${buildEraChipsHtml('birth'+idx, p.birthEra)}</div>
          <div class="grid grid-cols-4 gap-1">
            <select class="field-select" onchange="updatePerson(${idx},'birthEra',this.value||null); renderPersonTable();">${buildEraSelectOptions(p.birthEra)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'birthWaYear',this.value?parseInt(this.value):null)">${buildYearSelectOptions(p.birthWaYear)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'birthMonth',this.value?parseInt(this.value):null)">${buildMonthSelectOptions(p.birthMonth)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'birthDay',this.value?parseInt(this.value):null)">${buildDaySelectOptions(p.birthDay)}</select>
          </div>
        </div>
        <div>
          <label class="field-label">没年月日</label>
          <div class="flex flex-wrap gap-1 mb-1">${buildEraChipsHtml('death'+idx, p.deathEra)}</div>
          <div class="grid grid-cols-4 gap-1">
            <select class="field-select" onchange="updatePerson(${idx},'deathEra',this.value||null); renderPersonTable();">${buildEraSelectOptions(p.deathEra)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'deathWaYear',this.value?parseInt(this.value):null)">${buildYearSelectOptions(p.deathWaYear)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'deathMonth',this.value?parseInt(this.value):null)">${buildMonthSelectOptions(p.deathMonth)}</select>
            <select class="field-select" onchange="updatePerson(${idx},'deathDay',this.value?parseInt(this.value):null)">${buildDaySelectOptions(p.deathDay)}</select>
          </div>
        </div>
        <div>
          <label class="field-label">没表現・年齢</label>
          <div class="grid grid-cols-2 gap-1">
            <select class="field-select" onchange="updatePerson(${idx},'deathLabel',this.value)">
              ${['御入滅','涅槃','御遷化','御逝去','死去','崩御','死亡',''].map(o=>`<option value="${o}" ${p.deathLabel===o?'selected':''}>${o||'（なし）'}</option>`).join('')}
            </select>
            <select class="field-select" onchange="updatePerson(${idx},'ageMethod',this.value)">
              <option value="kazoe" ${p.ageMethod==='kazoe'?'selected':''}>数え年</option>
              <option value="man" ${p.ageMethod==='man'?'selected':''}>満年齢</option>
            </select>
          </div>
          <input class="field-input mt-1" placeholder="没年齢テキスト（例：聖寿61歳）" value="${escapeHtml(p.deathAgeText||'')}" onchange="updatePerson(${idx},'deathAgeText',this.value)">
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <div>
          <label class="field-label">関係性バッジ（カード・絞り込み用／設定タブでタグを追加・削除できます）</label>
          <div class="flex flex-wrap gap-1">${STATE.relationTagsMaster.map(t=>`<button type="button" class="filter-btn ${(p.relationshipTags||[]).includes(t)?'active':''}" onclick="togglePersonTag(${idx},'relationshipTags','${escapeHtml(t)}')">${escapeHtml(t)}</button>`).join('')}</div>
        </div>
        <div>
          <label class="field-label">時代バッジ（カード・絞り込み用）</label>
          <div class="flex flex-wrap gap-1">${PERIOD_TAGS.map(t=>`<button type="button" class="filter-btn ${(p.periodTags||[]).includes(t)?'active':''}" onclick="togglePersonTag(${idx},'periodTags','${t}')">${t}</button>`).join('')}</div>
        </div>
      </div>
      <div class="mt-2">
        <label class="field-label">生涯背景（詳細ポップアップに表示）</label>
        <textarea class="field-textarea" rows="2" onchange="updatePerson(${idx},'bio',this.value)">${escapeHtml(p.bio||'')}</textarea>
      </div>
    </div>`;
  }).join('');
}
function togglePersonTag(idx, key, tag){
  const p = STATE.persons[idx];
  const list = p[key] ? p[key].slice() : [];
  const i = list.indexOf(tag);
  if(i>=0) list.splice(i,1); else list.push(tag);
  updatePerson(idx, key, list);
  renderPersonTable();
}
function updatePerson(idx, key, val){ STATE.persons[idx][key]=val; persistAll(); }
function addPerson(){
  STATE.persons.push({id:uid(), name:'新規人物', reading:'', alias:'', ageMethod:'kazoe', deathLabel:'',
    birthEra:null, birthWaYear:null, birthMonth:null, birthDay:null,
    deathEra:null, deathWaYear:null, deathMonth:null, deathDay:null, deathAgeText:'',
    relationshipTags:[], periodTags:[], summary:'', bio:'', notes:''});
  persistAll(); renderPersonTable();
}
function removePerson(idx){
  const p = STATE.persons[idx];
  requestDelete(p.name, ()=>{ STATE.persons.splice(idx,1); persistAll(); renderPersonTable(); });
}

/* ============================================================
   関係性タグのマスター管理（設定タブ）：ユーザーが自由に追加・削除できる
   ============================================================ */
function renderRelationTagMaster(){
  const el = document.getElementById('relationTagMaster');
  if(!el) return;
  el.innerHTML = STATE.relationTagsMaster.map(t=>
    `<span class="chip">${escapeHtml(t)}<button type="button" class="tag-remove-btn" title="このタグを削除" onclick="removeRelationTagMaster(${escapeHtml(JSON.stringify(t))})">×</button></span>`
  ).join('') || '<p class="text-xs text-gray-400">タグがありません。下のフォームから追加してください。</p>';
}
function addRelationTagMaster(){
  const input = document.getElementById('newRelationTagInput');
  const val = (input.value||'').trim();
  if(!val) return;
  if(!STATE.relationTagsMaster.includes(val)) STATE.relationTagsMaster.push(val);
  input.value = '';
  persistAll();
  renderRelationTagMaster();
  renderPersonTable();
  renderPersonCards();
}
function removeRelationTagMaster(tag){
  requestDelete(tag, ()=>{
    STATE.relationTagsMaster = STATE.relationTagsMaster.filter(t=>t!==tag);
    STATE.persons.forEach(p=>{ if(p.relationshipTags) p.relationshipTags = p.relationshipTags.filter(t=>t!==tag); });
    if(STATE.personBrowse.relation===tag) STATE.personBrowse.relation = 'all';
    persistAll();
    renderRelationTagMaster();
    renderPersonTable();
    renderPersonCards();
  });
}

/* ============================================================
   御書マスター管理（設定タブ）：「同じ御書」判定・御書結合機能の基準になる
   ------------------------------------------------------------
   レコード構造：{id, name（御書名）, era/waYear/month/day（執筆年代・和暦）,
                  recipient（宛先・対告衆）, author（説いた人）, note（識別メモ）}
   同名だが執筆年代の異なる御書（例：四条金吾殿御返事の建治版・弘安版）を
   別レコードとして管理できるよう、`name`の単純な文字列一致ではなく
   IDで文書と紐付ける。
   ============================================================ */

// 表示用ラベルを組み立てる（同名の御書が複数あっても年代で見分けられるようにする）
function goshoRecordLabel(rec){
  if(!rec) return '';
  const eraLabel = rec.era ? (rec.era + (rec.waYear===1?'元':rec.waYear||'') + '年'
    + (rec.month? rec.month+'月':'') + (rec.day? rec.day+'日':'')) : '';
  let label = rec.name || '（無題）';
  if(eraLabel) label += `（${eraLabel}）`;
  if(rec.note) label += `［${rec.note}］`;
  return label;
}
function goshoRecordById(id){ return STATE.goshoMaster.find(g=>g.id===id); }

/* 御書マスター編集一覧：件数が増えても探しやすいよう、検索と
   1行要約＋クリックで展開（アコーディオン）に対応する。 */
function onGoshoEditSearch(){
  STATE.goshoEdit.query = document.getElementById('goshoEditSearch').value;
  renderGoshoNameMaster();
}
function toggleGoshoEditExpand(id){
  if(!STATE.goshoEdit.expandedIds) STATE.goshoEdit.expandedIds = new Set();
  if(STATE.goshoEdit.expandedIds.has(id)) STATE.goshoEdit.expandedIds.delete(id);
  else STATE.goshoEdit.expandedIds.add(id);
  renderGoshoNameMaster();
}

function renderGoshoNameMaster(){
  const el = document.getElementById('goshoNameMaster');
  if(!el) return;
  if(!STATE.goshoEdit.expandedIds) STATE.goshoEdit.expandedIds = new Set();
  if(!STATE.goshoMaster.length){
    el.innerHTML = '<p class="text-xs text-gray-400">まだ御書が登録されていません。下のフォームから追加するか、文書取り込み時に自動追加されます。</p>';
    const c0 = document.getElementById('goshoEditCount');
    if(c0) c0.textContent = '0件';
    return;
  }
  // 元の配列インデックス（元号チップのnamespaceが重複しないよう）を保ったまま絞り込む
  let entries = STATE.goshoMaster.map((rec,idx)=>({rec, idx}));
  const q = (STATE.goshoEdit.query||'').trim().toLowerCase();
  if(q) entries = entries.filter(e=> (e.rec.name+' '+(e.rec.recipient||'')+' '+(e.rec.author||'')+' '+(e.rec.note||'')).toLowerCase().includes(q));

  const countEl = document.getElementById('goshoEditCount');
  if(countEl) countEl.textContent = `${entries.length}件 / 全${STATE.goshoMaster.length}件`;

  if(!entries.length){
    el.innerHTML = '<p class="text-sm text-gray-400 py-6 text-center">該当する御書がありません。</p>';
    return;
  }

  el.innerHTML = entries.map(({rec, idx})=>{
    const expanded = STATE.goshoEdit.expandedIds.has(rec.id);
    if(!expanded){
      return `<div class="border rounded-lg px-3 py-2 mb-2 cursor-pointer hover:bg-black/5" style="border-color:var(--line)" onclick="toggleGoshoEditExpand('${rec.id}')">
        <div class="flex items-center gap-2 flex-wrap">
          <i class="fa-solid fa-chevron-right text-xs" style="color:var(--gray)"></i>
          <span class="font-semibold text-sm">${escapeHtml(goshoRecordLabel(rec))}</span>
          ${rec.recipient? `<span class="chip">宛：${escapeHtml(rec.recipient)}</span>`:''}
          ${rec.author? `<span class="chip">${escapeHtml(rec.author)}</span>`:''}
        </div>
      </div>`;
    }
    return `
    <div class="border rounded-lg p-3 mb-2" style="border-color:var(--line)">
      <div class="flex items-center gap-2 mb-2 cursor-pointer" onclick="toggleGoshoEditExpand('${rec.id}')">
        <i class="fa-solid fa-chevron-down text-xs" style="color:var(--gray)"></i>
        <span class="font-semibold text-sm">${escapeHtml(goshoRecordLabel(rec))}</span>
        <span class="text-xs text-gray-400 ml-auto">クリックで折りたたむ</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <input class="field-input sm:col-span-2" placeholder="御書名（例：四条金吾殿御返事）" value="${escapeHtml(rec.name||'')}" onchange="updateGoshoRecord('${rec.id}','name',this.value)">
        <input class="field-input" placeholder="宛先・対告衆（例：四条金吾）" value="${escapeHtml(rec.recipient||'')}" onchange="updateGoshoRecord('${rec.id}','recipient',this.value)">
        <input class="field-input" placeholder="説いた人（例：日蓮大聖人）" value="${escapeHtml(rec.author||'')}" onchange="updateGoshoRecord('${rec.id}','author',this.value)">
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <div class="col-span-2 sm:col-span-4">
          <label class="field-label">執筆年代（和暦）</label>
          <div class="flex flex-wrap gap-1 mb-1">${buildEraChipsHtml('goshoMaster'+idx, rec.era)}</div>
          <div class="grid grid-cols-4 gap-1">
            <select class="field-select" onchange="updateGoshoRecord('${rec.id}','era',this.value||null); renderGoshoNameMaster();">${buildEraSelectOptions(rec.era)}</select>
            <select class="field-select" onchange="updateGoshoRecord('${rec.id}','waYear',this.value?parseInt(this.value):null)">${buildYearSelectOptions(rec.waYear)}</select>
            <select class="field-select" onchange="updateGoshoRecord('${rec.id}','month',this.value?parseInt(this.value):null)">${buildMonthSelectOptions(rec.month)}</select>
            <select class="field-select" onchange="updateGoshoRecord('${rec.id}','day',this.value?parseInt(this.value):null)">${buildDaySelectOptions(rec.day)}</select>
          </div>
        </div>
        <input class="field-input col-span-2 sm:col-span-1" placeholder="識別メモ（例：身延期）" value="${escapeHtml(rec.note||'')}" onchange="updateGoshoRecord('${rec.id}','note',this.value)">
        <button class="btn btn-danger text-xs" onclick="removeGoshoNameMaster('${rec.id}')"><i class="fa-solid fa-trash"></i>削除</button>
      </div>
      <p class="text-xs text-gray-400 mt-1">表示ラベル：${escapeHtml(goshoRecordLabel(rec))}</p>
    </div>`;
  }).join('');
}
function updateGoshoRecord(id, key, val){
  const rec = goshoRecordById(id);
  if(!rec) return;
  rec[key] = val;
  persistAll();
}
function addGoshoNameMaster(name){
  const val = (name!==undefined? name : (document.getElementById('newGoshoNameInput')||{}).value || '').trim();
  if(!val) return null;
  const rec = {id: uid(), name: val, era:null, waYear:null, month:null, day:null, recipient:'', author:'', note:''};
  STATE.goshoMaster.push(rec);
  const input = document.getElementById('newGoshoNameInput');
  if(input && name===undefined) input.value = '';
  persistAll();
  renderGoshoNameMaster();
  return rec;
}
function removeGoshoNameMaster(id){
  const rec = goshoRecordById(id);
  if(!rec) return;
  requestDelete(goshoRecordLabel(rec), ()=>{
    STATE.goshoMaster = STATE.goshoMaster.filter(g=>g.id!==id);
    STATE.documents.forEach(d=>{ if(d.goshoId===id) d.goshoId=''; });
    persistAll();
    renderGoshoNameMaster();
  });
}
// 御書名マスターの中から、タイトル文字列に一致するレコードを推定する（取り込み時の自動判定用）。
// 同名で執筆年代の異なる複数レコードが該当する場合は、誤って別の年代のものに紐付く事故を
// 避けるため自動選択せず、ユーザーに選んでもらう（空文字を返す）。
function matchGoshoRecord(title){
  if(!title) return '';
  const t = title.trim();
  const candidates = STATE.goshoMaster.filter(g=> g.name && (t.includes(g.name) || g.name.includes(t)));
  if(candidates.length===1) return candidates[0].id;
  const exact = candidates.filter(g=>g.name===t);
  if(exact.length===1) return exact[0].id;
  return '';
}

// ------------------------------------------------------------
// 移行：御書マスターが旧形式（文字列の配列）の場合、構造化レコードに変換する。
// 文書側の旧 goshoName（文字列）も、対応するレコードの goshoId に置き換える。
// データの形（文字列が残っているか等）で判定するため、専用フラグは不要（移行後は自動的に無処理となる）。
// ------------------------------------------------------------
function migrateGoshoMasterToRecords(){
  const isOldFormat = STATE.goshoMaster.some(g=> typeof g === 'string');
  const hasOldDocField = STATE.documents.some(d=> typeof d.goshoName === 'string' && d.goshoName && !d.goshoId);
  if(!isOldFormat && !hasOldDocField) return;
  try{
    downloadJsonBackup({goshoMaster: STATE.goshoMaster, documents: STATE.documents.map(toLightDoc)},
      'gosho_backup_before_master_migration_'+formatBackupTimestamp()+'.json');
  }catch(e){ /* バックアップに失敗しても移行自体は続行する（安全側の配慮は継続） */ }

  const nameToId = {};
  if(isOldFormat){
    const converted = [];
    STATE.goshoMaster.forEach(g=>{
      const name = typeof g==='string' ? g : g.name;
      if(!name) return;
      const rec = {id: uid(), name, era:null, waYear:null, month:null, day:null, recipient:'', author:'', note:''};
      converted.push(rec);
      nameToId[name] = rec.id;
    });
    STATE.goshoMaster = converted;
  } else {
    STATE.goshoMaster.forEach(rec=>{ nameToId[rec.name] = rec.id; });
  }
  STATE.documents.forEach(d=>{
    if(typeof d.goshoName === 'string' && d.goshoName && !d.goshoId){
      d.goshoId = nameToId[d.goshoName] || '';
    }
    delete d.goshoName;
  });
  persistAll();
}

/* ============================================================
   人物DB：カード型ブラウズUI（検索・50音インデックス・関係性/時代フィルタ・詳細モーダル）
   ============================================================ */
function onPersonCardSearch(){
  STATE.personBrowse.query = document.getElementById('personCardSearch').value;
  renderPersonCards();
}
function setPersonKanaFilter(k){ STATE.personBrowse.kana = k; renderPersonCards(); }
function setPersonRelationFilter(k){ STATE.personBrowse.relation = k; renderPersonCards(); }
function setPersonPeriodFilter(k){ STATE.personBrowse.period = k; renderPersonCards(); }

function renderPersonCards(){
  const gridEl = document.getElementById('personCardGrid');
  if(!gridEl) return;
  const b = STATE.personBrowse;

  const kanaEl = document.getElementById('personKanaIndex');
  if(kanaEl && !kanaEl.dataset.built){
    kanaEl.innerHTML = `<button type="button" class="filter-btn active" data-kana="all" onclick="setPersonKanaFilter('all')">すべて</button>` +
      KANA_ROWS.map(r=>`<button type="button" class="filter-btn" data-kana="${r.key}" onclick="setPersonKanaFilter('${r.key}')">${r.key}</button>`).join('');
    kanaEl.dataset.built = '1';
  }
  const relEl = document.getElementById('personRelationFilter');
  if(relEl){
    relEl.innerHTML = `<button type="button" class="filter-btn active" data-relation="all" onclick="setPersonRelationFilter('all')">すべて</button>` +
      STATE.relationTagsMaster.map(t=>`<button type="button" class="filter-btn" data-relation="${escapeHtml(t)}" onclick="setPersonRelationFilter(${escapeHtml(JSON.stringify(t))})">${escapeHtml(t)}</button>`).join('');
  }
  const perEl = document.getElementById('personPeriodFilter');
  if(perEl && !perEl.dataset.built){
    perEl.innerHTML = `<button type="button" class="filter-btn active" data-period="all" onclick="setPersonPeriodFilter('all')">すべて</button>` +
      PERIOD_TAGS.map(t=>`<button type="button" class="filter-btn" data-period="${t}" onclick="setPersonPeriodFilter('${t}')">${t}</button>`).join('');
    perEl.dataset.built = '1';
  }
  if(kanaEl) kanaEl.querySelectorAll('.filter-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.kana===b.kana));
  if(relEl) relEl.querySelectorAll('.filter-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.relation===b.relation));
  if(perEl) perEl.querySelectorAll('.filter-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.period===b.period));

  let list = STATE.persons.slice();
  if(b.kana!=='all') list = list.filter(p=>kanaRow(p.reading)===b.kana);
  if(b.relation!=='all') list = list.filter(p=>(p.relationshipTags||[]).includes(b.relation));
  if(b.period!=='all') list = list.filter(p=>(p.periodTags||[]).includes(b.period));
  if(b.query && b.query.trim()){
    const q = b.query.trim().toLowerCase();
    list = list.filter(p=> (p.name+' '+(p.alias||'')+' '+(p.summary||'')).toLowerCase().includes(q));
  }

  if(!list.length){
    gridEl.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center col-span-full">該当する人物がいません</p>';
    return;
  }
  gridEl.innerHTML = list.map(p=>{
    const badges = (p.relationshipTags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('');
    const activity = personActivityLabel(p);
    return `<div class="person-card" onclick="openPersonDetail('${p.id}')">
      <h4 class="font-display text-lg" style="color:var(--navy)">${escapeHtml(p.name)}</h4>
      ${p.alias? `<p class="text-xs text-gray-400">（${escapeHtml(p.alias)}）</p>` : ''}
      <div class="flex flex-wrap gap-1 mt-1">${badges}</div>
      ${activity? `<p class="text-xs mt-1" style="color:var(--gray)"><i class="fa-solid fa-clock mr-1"></i>${escapeHtml(activity)}</p>` : ''}
      ${p.summary? `<p class="text-sm mt-2 clamp2">${escapeHtml(p.summary)}</p>` : ''}
    </div>`;
  }).join('');
}

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
    <h5 class="font-display text-sm mt-4 mb-1" style="color:var(--navy)"><i class="fa-solid fa-note-sticky mr-1"></i>メモ・AI解説</h5>
    <textarea id="personDetailNotes" class="field-textarea" rows="4" placeholder="メモを入力…">${escapeHtml(p.notes||'')}</textarea>
    <div class="flex justify-end mt-2">
      <button class="btn btn-outline text-xs" onclick="savePersonDetailNotes('${p.id}')"><i class="fa-solid fa-check"></i>メモを保存</button>
    </div>
  `;
  openModal('personDetailModal');
}
function savePersonDetailNotes(id){
  const p = STATE.persons.find(x=>x.id===id);
  if(!p) return;
  p.notes = document.getElementById('personDetailNotes').value;
  persistAll();
}
function collectSyncPayload(){
  return {
    documents: STATE.documents, events: STATE.events, persons: STATE.persons, settings: STATE.settings,
    relationTagsMaster: STATE.relationTagsMaster, goshoMaster: STATE.goshoMaster,
    mergedGoshos: STATE.mergedGoshos, eraRanges: STATE.eraRanges,
    exportedAt: new Date().toISOString()
  };
}
// 通常の操作では、開いたことのない御書の本文（fullText）は端末上でまだ読み込まれていない（軽量版のまま）。
// バックアップ・同期・公開はいずれも「今メモリ上にある内容」をそのまま書き出すため、
// 先に全件の本文を読み込んでおかないと、開いていない御書の本文だけが空で保存されてしまう。
// バックアップ書き出し／Gist同期／公開ビューアへの反映は、必ずこちらを使うこと。
async function collectSyncPayloadFull(){
  await Promise.all(STATE.documents.map(d=>ensureDocFullLoaded(d.id)));
  return collectSyncPayload();
}
function applySyncPayload(payload){
  STATE.documents = payload.documents || [];
  STATE.events = payload.events || [];
  STATE.persons = payload.persons || DEFAULT_PERSONS;
  STATE.settings = payload.settings || {};
  // 旧バックアップには無い項目は、現在の値を残す（存在する場合のみ上書き）
  if(Array.isArray(payload.relationTagsMaster) && payload.relationTagsMaster.length) STATE.relationTagsMaster = payload.relationTagsMaster;
  if(Array.isArray(payload.goshoMaster)) STATE.goshoMaster = payload.goshoMaster;
  if(Array.isArray(payload.mergedGoshos)) STATE.mergedGoshos = payload.mergedGoshos;
  if(Array.isArray(payload.eraRanges)) STATE.eraRanges = payload.eraRanges;
  migrateGoshoMasterToRecords();
  persistAll();
  populateAuthorSelect();
  renderRelationTagMaster();
  renderGoshoNameMaster();
  renderEraRangeMaster();
  renderDocList();
  renderPersonTable();
  renderTimeline();
  renderTerms();
}

async function exportJson(){
  const blob = new Blob([JSON.stringify(await collectSyncPayloadFull(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gosho_database_backup_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('importJsonInput').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    try{
      const payload = JSON.parse(ev.target.result);
      if(!confirm('現在のデータを、このファイルの内容で上書きします。よろしいですか？')) return;
      applySyncPayload(payload);
      alert('読み込みました');
    }catch(err){
      alert('読み込みエラー：'+err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ---- GitHub Gistによる手動クラウド同期 ----
   トークン・Gist IDはこの端末のlocalStorageにのみ保存し、同期データ本体には含めない。
   保存・読み込みはユーザーの明示的なボタン操作でのみ行う（自動送信はしない）。 */
const SYNC_CONFIG_KEY = 'gosho_sync_config';
function getSyncConfig(){
  try{ return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)||'{}'); }catch(e){ return {}; }
}
function saveSyncConfig(){
  const cfg = {
    token: document.getElementById('sync_token').value.trim(),
    gistId: document.getElementById('sync_gistid').value.trim(),
    pubGistId: document.getElementById('pub_gistid') ? document.getElementById('pub_gistid').value.trim() : (getSyncConfig().pubGistId||'')
  };
  try{ localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg)); }catch(e){}
}
function loadSyncConfigIntoForm(){
  const cfg = getSyncConfig();
  document.getElementById('sync_token').value = cfg.token || '';
  document.getElementById('sync_gistid').value = cfg.gistId || '';
  if(document.getElementById('pub_gistid')) document.getElementById('pub_gistid').value = cfg.pubGistId || '';
}
const GIST_FILENAME = 'gosho_app_data.json';
const PUB_GIST_FILENAME = 'kakiokoshi_viewer_data.json'; // 閲覧専用ビューアが読みに行く公開用ファイル名

async function gistCreate(){
  const status = document.getElementById('syncStatus');
  const token = document.getElementById('sync_token').value.trim();
  if(!token){ status.innerHTML = '<span style="color:#c1473f">先にPersonal Access Tokenを入力してください</span>'; return; }
  status.textContent = 'Gistを作成中…';
  try{
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Authorization': 'token '+token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({
        description: '御書データベース＆統合年表 同期データ',
        public: false,
        files: { [GIST_FILENAME]: { content: JSON.stringify(await collectSyncPayloadFull(), null, 2) } }
      })
    });
    if(!res.ok) throw new Error('作成に失敗しました（HTTP '+res.status+'）。トークンの権限（gist）をご確認ください。');
    const data = await res.json();
    document.getElementById('sync_gistid').value = data.id;
    saveSyncConfig();
    status.innerHTML = '<span style="color:#2f9e6f">作成しました。このGist ID「'+escapeHtml(data.id)+'」を他の端末にも同じように入力してください。</span>';
  }catch(err){
    status.innerHTML = '<span style="color:#c1473f">'+escapeHtml(err.message)+'</span>';
  }
}

async function gistSaveUi(){
  const status = document.getElementById('syncStatus');
  const cfg = { token: document.getElementById('sync_token').value.trim(), gistId: document.getElementById('sync_gistid').value.trim() };
  saveSyncConfig();
  if(!cfg.token || !cfg.gistId){ status.innerHTML = '<span style="color:#c1473f">トークンとGist IDの両方を入力してください</span>'; return; }
  status.textContent = 'クラウドへ保存中…';
  try{
    const res = await fetch('https://api.github.com/gists/'+encodeURIComponent(cfg.gistId), {
      method: 'PATCH',
      headers: { 'Authorization': 'token '+cfg.token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(await collectSyncPayloadFull(), null, 2) } } })
    });
    if(!res.ok) throw new Error('保存に失敗しました（HTTP '+res.status+'）');
    status.innerHTML = '<span style="color:#2f9e6f"><i class="fa-solid fa-circle-check"></i> クラウドへ保存しました</span>';
  }catch(err){
    status.innerHTML = '<span style="color:#c1473f">'+escapeHtml(err.message)+'</span>';
  }
}

async function gistLoadUi(){
  const status = document.getElementById('syncStatus');
  const cfg = { token: document.getElementById('sync_token').value.trim(), gistId: document.getElementById('sync_gistid').value.trim() };
  saveSyncConfig();
  if(!cfg.token || !cfg.gistId){ status.innerHTML = '<span style="color:#c1473f">トークンとGist IDの両方を入力してください</span>'; return; }
  if(!confirm('クラウドの内容で、この端末のデータを上書きします。よろしいですか？')) return;
  status.textContent = 'クラウドから読み込み中…';
  try{
    const res = await fetch('https://api.github.com/gists/'+encodeURIComponent(cfg.gistId), {
      headers: { 'Authorization': 'token '+cfg.token, 'Accept': 'application/vnd.github+json' }
    });
    if(!res.ok) throw new Error('読み込みに失敗しました（HTTP '+res.status+'）');
    const data = await res.json();
    const file = data.files && data.files[GIST_FILENAME];
    if(!file) throw new Error('Gist内にデータファイルが見つかりません');
    const payload = JSON.parse(file.content);
    applySyncPayload(payload);
    status.innerHTML = '<span style="color:#2f9e6f"><i class="fa-solid fa-circle-check"></i> クラウドから読み込みました</span>';
  }catch(err){
    status.innerHTML = '<span style="color:#c1473f">'+escapeHtml(err.message)+'</span>';
  }
}

/* ---- 閲覧専用ビューアへの公開（公開Gist。上のクラウド同期用Gistとは別物） ----
   ビューア側はトークン無しで読みに行くため、このGistは「公開（Public）」で作成する。
   書き込み（作成・更新）にはトークンが要るが、閲覧専用ビューアは読み込むだけなので不要。 */
async function pubGistCreate(){
  const status = document.getElementById('pubSyncStatus');
  const token = document.getElementById('sync_token').value.trim();
  if(!token){ status.innerHTML = '<span style="color:#c1473f">先に上の「①GitHub Gist」欄にPersonal Access Tokenを入力してください</span>'; return; }
  status.textContent = '公開用Gistを作成中…';
  try{
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Authorization': 'token '+token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({
        description: '御書データベース＆統合年表 - 書き起こし一覧 公開用データ（閲覧専用ビューア用）',
        public: true,
        files: { [PUB_GIST_FILENAME]: { content: JSON.stringify(await collectSyncPayloadFull(), null, 2) } }
      })
    });
    if(!res.ok) throw new Error('作成に失敗しました（HTTP '+res.status+'）。トークンの権限（gist）をご確認ください。');
    const data = await res.json();
    document.getElementById('pub_gistid').value = data.id;
    saveSyncConfig();
    status.innerHTML = '<span style="color:#2f9e6f">公開しました。このGist ID「'+escapeHtml(data.id)+'」を、閲覧専用ビューアの設定に使ってください。以後は「公開する」ボタンだけで更新できます。</span>';
  }catch(err){
    status.innerHTML = '<span style="color:#c1473f">'+escapeHtml(err.message)+'</span>';
  }
}

async function pubGistPublish(){
  const status = document.getElementById('pubSyncStatus');
  const token = document.getElementById('sync_token').value.trim();
  const gistId = document.getElementById('pub_gistid').value.trim();
  saveSyncConfig();
  if(!token){ status.innerHTML = '<span style="color:#c1473f">先に上の「①GitHub Gist」欄にPersonal Access Tokenを入力してください</span>'; return; }
  if(!gistId){ status.innerHTML = '<span style="color:#c1473f">先に「初めて公開する」を実行してください</span>'; return; }
  status.textContent = '公開用ビューアへ反映中…';
  try{
    const res = await fetch('https://api.github.com/gists/'+encodeURIComponent(gistId), {
      method: 'PATCH',
      headers: { 'Authorization': 'token '+token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({ files: { [PUB_GIST_FILENAME]: { content: JSON.stringify(await collectSyncPayloadFull(), null, 2) } } })
    });
    if(!res.ok) throw new Error('反映に失敗しました（HTTP '+res.status+'）');
    status.innerHTML = '<span style="color:#2f9e6f"><i class="fa-solid fa-circle-check"></i> 公開ビューアに反映しました</span>';
  }catch(err){
    status.innerHTML = '<span style="color:#c1473f">'+escapeHtml(err.message)+'</span>';
  }
}

/* ============================================================
   INIT
   ============================================================ */
