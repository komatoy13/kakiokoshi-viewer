/* ============================================================
   db.js — データ層（編集アプリとビューアで共通）
   STATE・和暦/仏紀変換・保存（localStorage／クラウドの読み書き）・人物DBのカード表示 など、
   「データを持つ・読む」ために両方で必要な部分だけを置く。
   編集アプリ専用の処理（データの書き込み・同期・バックアップ・人物／御書マスターの編集画面など）は、
   db-editor.js に分けてある（ビューアには含めない）。
   ※ 他の全JSファイルより先に読み込むこと
   ============================================================ */

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

/* 仏紀（仏滅後の年数）。0年は無い：釈尊の入滅の年（紀元前949年）が仏紀1年、その前の年が仏紀-1年。
   西暦にも0年が無い（紀元前1年の次が西暦1年）ので、その境目も数が飛ばないように数える。
     西暦1年以降           ：仏紀＝西暦＋949        （例：西暦1253年＝仏紀2202年）
     紀元前949年〜紀元前1年：仏紀＝西暦＋950        （紀元前949年＝仏紀1年、紀元前1年＝仏紀949年。西暦1年＝仏紀950年）
     紀元前950年より前      ：仏紀＝西暦＋949        （紀元前950年＝仏紀-1年）
   ※西暦は、紀元前を負の数で持つ（紀元前949年＝-949）。西暦0年は無い。 */
function butsukiFromSeireki(y){
  if(y===null||y===undefined||isNaN(y)||y===0) return null;
  y = Number(y);
  return (y<0 && y>=-949) ? y+950 : y+949;
}

// Parse free text like "弘安元年十一月二十九日" -> {era,waYear,month,day,seirekiYear,...}
function parseWarekiText(text){
  if(!text) return null;
  for(const era of ERA_NAMES_SORTED){
    const idx = text.indexOf(era);
    if(idx===-1) continue;
    const rest = text.slice(idx+era.length);
    // 「閏十月」のような閏月表記にも対応（「月」の直前の「閏」は年月日の数値パターンとしては
    // 読み取れないため、無視して月数自体は通常どおり取得し、閏月だったことは isLeapMonth に残す）
    const m = rest.match(/^([0-9０-９〇一二三四五六七八九十百千元]{1,4})年(?:\s*(閏)?([0-9０-９一二三四五六七八九十]{1,3})月)?(?:\s*([0-9０-９一二三四五六七八九十]{1,3})日)?/);
    if(!m) continue;
    const waYear = kanjiToInt(m[1]);
    const isLeapMonth = !!m[2];
    const month = m[3]? kanjiToInt(m[3]) : null;
    const day = m[4]? kanjiToInt(m[4]) : null;
    const seirekiYear = seirekiFromWareki(era, waYear);
    return {era, waYear, month, day, isLeapMonth, seirekiYear, butsuki: butsukiFromSeireki(seirekiYear)};
  }
  // fallback: 西暦○○年 pattern
  const m2 = text.match(/西暦\s*([0-9]{3,4})年/);
  if(m2) return {era:null, waYear:null, month:null, day:null, seirekiYear:parseInt(m2[1]), butsuki: butsukiFromSeireki(parseInt(m2[1]))};
  return null;
}

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
  // 元号が200以上あるため、時代ごとにグループ分けして選びやすくする
  const groups = [
    {label:'奈良・平安時代', to:1184}, {label:'鎌倉時代', to:1333}, {label:'南北朝・室町時代', to:1572},
    {label:'安土桃山・江戸時代', to:1867}, {label:'明治以降', to:Infinity}
  ];
  const eras = eraNamesChronological();
  let gi = 0, open = false;
  eras.forEach(era=>{
    const y = ERA_TABLE[era];
    while(gi < groups.length && y > groups[gi].to){ if(open){ opts.push('</optgroup>'); open=false; } gi++; }
    if(!open){ opts.push('<optgroup label="'+groups[gi].label+'">'); open = true; }
    opts.push(`<option value="${escapeHtml(era)}" ${selectedEra===era?'selected':''}>${escapeHtml(era)}（${y}〜）</option>`);
  });
  if(open) opts.push('</optgroup>');
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

function composeWarekiText(era, year, month, day, isLeap){
  if(!era || !year) return '';
  let t = era + year + '年';
  if(month) t += (isLeap? '閏' : '') + month + '月';   // 閏月（例：閏十月）は月の前に「閏」を付ける
  if(day) t += day + '日';
  return t;
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

/* ------------------------------------------------------------
   全元号表（大宝701年〜令和）：西暦→和暦の計算用。元号名 → 元年（西暦）。
   ・年単位の表。年の途中で改元があった年は「新しい元号」を採用する（例：1264年→文永元年）。
   ・南北朝期（1336〜1392）は北朝の元号で統一している。
   ・既に ERA_TABLE にある元号は上書きしない。
   ------------------------------------------------------------ */
const ERA_TABLE_EXTRA = {
  '大宝':701,'慶雲':704,'和銅':708,'霊亀':715,'養老':717,'神亀':724,'天平':729,'天平勝宝':749,'天平宝字':757,
  '天平神護':765,'神護景雲':767,'宝亀':770,'天応':781,'延暦':782,'大同':806,'弘仁':810,'天長':824,'承和':834,
  '嘉祥':848,'仁寿':851,'斉衡':854,'天安':857,'貞観':859,'元慶':877,'仁和':885,'寛平':889,'昌泰':898,
  '延喜':901,'延長':923,'承平':931,'天慶':938,'天暦':947,'天徳':957,'応和':961,'康保':964,'安和':968,
  '天禄':970,'天延':973,'貞元':976,'天元':978,'永観':983,'寛和':985,'永延':987,'永祚':989,'正暦':990,
  '長徳':995,'長保':999,'寛弘':1004,'長和':1012,'寛仁':1017,'治安':1021,'万寿':1024,'長元':1028,
  '長暦':1037,'長久':1040,'寛徳':1044,'永承':1046,'天喜':1053,'康平':1058,'治暦':1065,'延久':1069,
  '承保':1074,'承暦':1077,'永保':1081,'応徳':1084,'寛治':1087,'嘉保':1094,'永長':1096,'承徳':1097,
  '康和':1099,'長治':1104,'嘉承':1106,'天仁':1108,'天永':1110,'永久':1113,'元永':1118,'保安':1120,
  '天治':1124,'大治':1126,'天承':1131,'長承':1132,'保延':1135,'永治':1141,'康治':1142,'天養':1144,
  '久安':1145,'仁平':1151,'久寿':1154,'保元':1156,'平治':1159,'永暦':1160,'応保':1161,'長寛':1163,
  '永万':1165,'仁安':1166,'嘉応':1169,'承安':1171,'安元':1175,'治承':1177,'養和':1181,'寿永':1182,
  '元暦':1184,'文治':1185,'建久':1190,'正治':1199,'建仁':1201,'元久':1204,'建永':1206,'承元':1207,
  '建暦':1211,'建保':1213,'承久':1219,
  '暦応':1338,'康永':1342,'貞和':1345,'観応':1350,'文和':1352,'延文':1356,'康安':1361,'貞治':1362,
  '応安':1368,'永和':1375,'康暦':1379,'永徳':1381,'至徳':1384,'嘉慶':1387,'康応':1389,'明徳':1390,
  '応永':1394,'正長':1428,'永享':1429,'嘉吉':1441,'文安':1444,'宝徳':1449,'享徳':1452,'康正':1455,
  '長禄':1457,'寛正':1460,'文正':1466,'応仁':1467,'文明':1469,'長享':1487,'延徳':1489,'明応':1492,
  '文亀':1501,'永正':1504,'大永':1521,'享禄':1528,'天文':1532,'弘治':1555,'永禄':1558,'元亀':1570,
  '天正':1573,'文禄':1593,'慶長':1596,'元和':1615,'寛永':1624,'正保':1645,'慶安':1648,'承応':1652,
  '明暦':1655,'万治':1658,'寛文':1661,'延宝':1673,'天和':1681,'貞享':1684,'元禄':1688,'宝永':1704,
  '正徳':1711,'享保':1716,'元文':1736,'寛保':1741,'延享':1744,'寛延':1748,'宝暦':1751,'明和':1764,
  '安永':1772,'天明':1781,'寛政':1789,'享和':1801,'文化':1804,'文政':1818,'天保':1830,'弘化':1844,
  '嘉永':1848,'安政':1854,'万延':1860,'文久':1861,'元治':1864,'慶応':1865
};
Object.keys(ERA_TABLE_EXTRA).forEach(k=>{ if(!(k in ERA_TABLE)) ERA_TABLE[k] = ERA_TABLE_EXTRA[k]; });
ERA_NAMES_SORTED.length=0; Object.keys(ERA_TABLE).sort((a,b)=>b.length-a.length).forEach(e=>ERA_NAMES_SORTED.push(e));

/* ------------------------------------------------------------
   西暦・仏紀・和暦の相互計算（年単位）
   仏紀の数え方は、下の butsukiFromSeireki を参照（仏紀に0年は無い。釈尊の入滅の年が仏紀1年）。
   ------------------------------------------------------------ */
// 仏紀 → 西暦。仏紀に0年は無いので、0（や空）は null を返す
function seirekiFromButsuki(b){
  if(b===null||b===undefined||isNaN(b)||Number(b)===0) return null;
  b = Number(b);
  return (b>=1 && b<=949) ? b-950 : b-949;
}

// 西暦年 → {era, waYear, alt}。大宝元年（701）より前は null。
// alt は、その年に改元があった場合の「改元前の元号」（例：1264年 → 文永元年／alt=弘長4年）。
function warekiFromSeireki(y){
  y = Number(y);
  if(!isFinite(y)) return null;
  const list = Object.keys(ERA_TABLE).map(n=>({era:n, start:ERA_TABLE[n]})).sort((a,b)=>a.start-b.start);
  let idx = -1;
  for(let i=0;i<list.length;i++){ if(list[i].start<=y) idx=i; else break; }
  if(idx<0) return null;
  const cur = list[idx];
  const out = {era:cur.era, waYear:y-cur.start+1, alt:null};
  if(cur.start===y && idx>0){ const pv = list[idx-1]; out.alt = {era:pv.era, waYear:y-pv.start+1}; }
  return out;
}

function warekiYearLabel(era, waYear){ return era + (waYear===1? '元' : waYear) + '年'; }

// 年の説明文（フォームの案内表示用）例：「西暦1253年＝仏紀2202年＝建長5年」
function describeYearAll(y){
  if(y===null||y===undefined||isNaN(y)) return '';
  const w = warekiFromSeireki(y);
  const bu = butsukiFromSeireki(y);
  let t = (y<0 ? '紀元前'+(-y)+'年' : '西暦'+y+'年') + '＝' + (bu===null ? '' : (bu<0 ? '仏滅前'+(-bu)+'年' : '仏紀'+bu+'年'));
  if(w){
    t += '＝'+warekiYearLabel(w.era, w.waYear);
    if(w.alt) t += '（この年に改元があり、改元前は'+warekiYearLabel(w.alt.era, w.alt.waYear)+'。新しい元号で表示）';
  } else {
    t += '（大宝元年〔701年〕より前のため、和暦はありません）';
  }
  return t;
}

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
    citations: STATE.citations,
    eraRanges: STATE.eraRanges,
    themeTags: STATE.themeTags
  };
  await storageSet(INDEX_KEY, JSON.stringify(payload));
}

// 文書一覧・人物・設定など「軽いデータ」の保存（デバウンス経由）
function persistAll(){ debounce('index', persistIndexNow, 500); }

let STATE = {
  documents: [],
  events: [],
  persons: DEFAULT_PERSONS,
  settings: {},
  calendarMode: 'wareki', // 年表の日付は和暦表示に固定
  eraRanges: null, // 時代区分（null＝未設定→初期値を使う）。eras.js で管理
  themeTags: null, // テーマタグ {id, name, color, order} の配列（null＝未設定。編集アプリで初期の4つを作る）。themes.js で使う
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
  goshoMaster: [], // {id, name, kind(gosho/nikko/shoshi/sutra/ronshaku/bunsho_sho/bunsho_matsu/other), aliases[], era, waYear, month, day, recipient, author, note} の配列
  mergedGoshos: [],
  citations: [], // 解説書から取り込んだ御文（引用）の断片 {id, goshoId, sourceName, category, text, status:'ok'|'hold', book, chapter, section, batch, createdAt}
  mergeSelectedGoshoId: '',
  mergeCompare: null, // {leftBlockId, rightBlockId, preset, editedManually} 統合比較モーダルの状態
  mergeSelectedFragmentIds: []
};

function personSeireki(p, which){
  const era = which==='birth'? p.birthEra : p.deathEra;
  const wy = which==='birth'? p.birthWaYear : p.deathWaYear;
  if(era && wy!==null && wy!==undefined) return seirekiFromWareki(era, wy);
  // 和暦に当てはまらない年（大宝より前など）は、西暦で直接入力した値を使う
  const fy = which==='birth'? p.birthSeireki : p.deathSeireki;
  if(fy!==null && fy!==undefined && fy!=='' && !isNaN(fy)) return Number(fy);
  return null;
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
  const has = v => v!==null && v!==undefined && !isNaN(v);
  const lab = v => v<0 ? '紀元前'+(-v)+'年' : '西暦'+v+'年';
  if(has(by) && has(dy)) return (by>=0 && dy>=0) ? `西暦${by}〜${dy}年` : `${lab(by)}〜${lab(dy)}`;
  if(has(by)) return `${lab(by)}〜`;
  if(has(dy)) return `〜${lab(dy)}`;
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

let pendingConflictResolve = null;

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
    + (rec.month? (rec.isLeapMonth?'閏':'')+rec.month+'月':'') + (rec.day? rec.day+'日':'')) : '';
  let label = rec.name || '（無題）';
  if(eraLabel) label += `（${eraLabel}）`;
  if(rec.note) label += `［${rec.note}］`;
  return label;
}

function goshoRecordById(id){ return STATE.goshoMaster.find(g=>g.id===id); }

// 御書マスターの種類：御書／日寛上人の文段・御指南／経文・論釈／御本尊（未設定は御書）
// 御書マスターの「種類」。御文の取り込み先を分けるためのもの。
const GOSHO_KIND_LABEL = {
  gosho:'御書', nikko:'日興上人・日目上人', nichikan:'日寛上人', shoshi:'正師御文', sutra:'経文', ronshaku:'論釈',
  bunsho_sho:'文証(邪義/正像)',
  ikeda:'池田大作', hosoi:'細井日達', abe:'阿部日顕(信雄)', hayase:'早瀬日如',   // 発言の書（大日蓮○○年○月号など）を、人ごとの分類に登録する
  other:'他'
};

// 人ごとの分類 → 人の名前
const PERSON_KIND_NAMES = {ikeda:'池田大作', hosoi:'細井日達', abe:'阿部日顕(信雄)', hayase:'早瀬日如'};

// 名前（呼び方の違いを含む）から、人ごとの分類を調べる。当てはまらなければ ''
function personKindOfName(n){
  const t = String(n||'');
  if(/池田大作|^池田$/.test(t)) return 'ikeda';
  if(/細井日達|^日達$/.test(t)) return 'hosoi';
  if(/阿部日顕|阿部信雄|^日顕$/.test(t)) return 'abe';
  if(/早瀬日如|^日如$/.test(t)) return 'hayase';
  return '';
}

// 以前の版の名前 → 現在の名前（以前の版で保存したデータを、読み込み時に自動で移し替える）
const GOSHO_KIND_LEGACY = {nikkan:'nichikan', honzon:'gosho'};

function migrateKindNames(){
  let changed = false;
  const isNichikanName = n => /文段$/.test(n||'') || (typeof QX_NIKKAN_NAMES!=='undefined' && QX_NIKKAN_NAMES.includes(n));
  (STATE.goshoMaster||[]).forEach(g=>{
    if(!g) return;
    if(GOSHO_KIND_LEGACY[g.kind]){ g.kind = GOSHO_KIND_LEGACY[g.kind]; changed = true; }
    // 前の版で「正師御文」に入っていた日寛上人の文段・御指南は「日寛上人」へ、御本尊は「御書」へ
    if(g.kind==='shoshi' && (g.author==='日寛上人' || isNichikanName(g.name))){ g.kind = 'nichikan'; changed = true; }
    if(g.kind==='other' && /御本尊$/.test(g.name||'')){ g.kind = 'gosho'; changed = true; }
  });
  // 前の版の「文証(邪義/末法)」は、人ごとの分類に分ける
  const seeded = (g)=> HERESY_SEED_OLD.some(sd=> sd.name===g.name && JSON.stringify(sd.aliases)===JSON.stringify(g.aliases||[]))
    && !g.recipient && !g.author && !g.note && !g.era;
  const used = (g)=> (STATE.citations||[]).some(c=>c.goshoId===g.id) || (STATE.documents||[]).some(d=>d.goshoId===g.id);
  const keep = [];
  (STATE.goshoMaster||[]).forEach(g=>{
    if(g && g.kind==='bunsho_matsu'){
      changed = true;
      if(seeded(g) && !used(g)) return;          // 自動で入れた人物名のマスターで、何も紐づいていなければ、削除する
      g.kind = personKindOfName(g.name) || 'other';
    }
    keep.push(g);
  });
  if(keep.length !== (STATE.goshoMaster||[]).length) STATE.goshoMaster = keep;
  (STATE.citations||[]).forEach(c=>{
    if(!c) return;
    if(GOSHO_KIND_LEGACY[c.category]){ c.category = GOSHO_KIND_LEGACY[c.category]; changed = true; }
    if(c.category==='shoshi' && isNichikanName(c.sourceName)){ c.category = 'nichikan'; changed = true; }
    if(c.category==='other' && /御本尊$/.test(c.sourceName||'')){ c.category = 'gosho'; changed = true; }
    if(c.category==='bunsho_matsu'){ c.category = personKindOfName(c.sourceName) || 'other'; changed = true; }
  });
  return changed;
}

// 前の版で自動登録した4名（この名前・別名のまま、何も入力されていないものだけを、移行時に削除する目印）
const HERESY_SEED_OLD = [
  {name:'池田大作', aliases:['池田']},
  {name:'細井日達', aliases:['日達']},
  {name:'阿部日顕(信雄)', aliases:['阿部日顕','阿部信雄','日顕','阿部日顕（信雄）']},
  {name:'早瀬日如', aliases:['日如']}
];

function goshoKindOf(rec){
  if(!rec) return 'gosho';
  if(GOSHO_KIND_LABEL[rec.kind]) return rec.kind;
  return GOSHO_KIND_LEGACY[rec.kind] || 'gosho';
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
  if(typeof renderThemeBars==='function') renderThemeBars();
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
  if(typeof themeFilterActive==='function' && themeFilterActive()) list = list.filter(personPassesTheme);
  if(b.query && b.query.trim()){
    const q = b.query.trim().toLowerCase();
    list = list.filter(p=> (p.name+' '+(p.alias||'')+' '+(p.summary||'')).toLowerCase().includes(q));
  }

  if(!list.length){
    gridEl.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center col-span-full">該当する人物がいません</p>';
    return;
  }
  gridEl.innerHTML = list.map(p=>{
    const badges = (p.relationshipTags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('') + (typeof themeIdsOf==='function' ? themeIdsOf(p).map(themeTagById).filter(Boolean).map(themeChipHtml).join('') : '');
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
  const badges = [...(p.relationshipTags||[]), ...(p.periodTags||[])].map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('') + (typeof themeIdsOf==='function' ? themeIdsOf(p).map(themeTagById).filter(Boolean).map(themeChipHtml).join('') : '');
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

/* ---- GitHub Gistによる手動クラウド同期 ----
   トークン・Gist IDはこの端末のlocalStorageにのみ保存し、同期データ本体には含めない。
   保存・読み込みはユーザーの明示的なボタン操作でのみ行う（自動送信はしない）。 */
const SYNC_CONFIG_KEY = 'gosho_sync_config';

const GIST_FILENAME = 'gosho_app_data.json';

const PUB_GIST_FILENAME = 'kakiokoshi_viewer_data.json'; // 閲覧専用ビューアが読みに行く公開用ファイル名

// 「この端末が最後にクラウドと同期した時点」の印（保存した／読み込んだ内容の exportedAt）
const LAST_SYNC_KEY = 'gosho_last_sync_exported_at';

/* ---- 保存と公開の統合ボタン ----
   ペイロードは1回だけ作り、非公開Gist → 公開Gist の順に同じ内容を書く。結果は別々に表示する。
   ・「公開ビューアにも反映する」チェック（既定ON。端末に記憶）。OFFなら非公開Gistへの保存だけ。
   ・公開用Gist IDが未設定なら公開はスキップし、案内を出す（公開Gistを自動では作らない）。
   ・初めて公開も一緒に行う時だけ、確認ダイアログを1回出す。
   ・クラウド側が、この端末の最後の同期より新しい場合は、上書き前に警告する。 */
const ALSO_PUBLISH_KEY = 'gosho_save_also_publish';

const PUBLISH_CONFIRMED_KEY = 'gosho_publish_confirmed';
