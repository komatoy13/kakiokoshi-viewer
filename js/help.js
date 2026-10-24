/* ============================================================
   help.js — ビューア専用：使い方ガイド（説明文はこのファイルだけで管理）
   ① 使い方ガイド（メニュー最上部の「使い方ガイド」から開くポップアップ）
   ② 各画面の先頭の「この画面の使い方」（開閉式）
   ③ 初めて開いたときだけ出る案内カード
   説明文を直すときは、下の HELP_TABS と HELP_TOPICS だけを編集してください。
   ※ 編集アプリと共通のファイルではありません（ビューア専用）
   ============================================================ */

/* ---------- 説明文（ここだけ直せば、ガイドと各画面の両方に反映される） ---------- */

// 各画面の説明。tab＝画面の名前（index.html の view-○○ と同じ）
const HELP_TABS = {
  archive: {
    icon: 'fa-boxes-stacked', title: '書き起こし', lead: '御書・御指導の書き起こしを、年表か一覧で見る画面です。',
    points: [
      '開くと、まず<b>年表</b>が出ます。項目をタップすると、詳しい内容が開きます。',
      '年表の上の<b>時代のボタン</b>を押すと、その時代まで一気に移動できます。',
      '<b>表示対象</b>のボタンで、見たい種類（御書・御指導／一般出来事／門下出来事）を選べます。もう一度押すと外れます。',
      '<b>人物</b>の選び箱で、その人に関係する項目だけに絞れます。',
      '検索欄に言葉を入れると、年表の中から探せます。',
      '右下の丸いボタン（<b>一覧モードへ</b>）を押すと、<b>一覧</b>に切り替わります。一覧では、カテゴリを選んでから題名を選びます。年表に出ていない書き起こしも、一覧なら必ず見つかります。',
      '詳しい内容の画面で<b>「本文全文」</b>を押すと、本文をすべて読めます。'
    ]
  },
  terms: {
    icon: 'fa-book-open', title: 'AI解説（用語辞典）', lead: '書き起こしに出てくる人物・語句・出来事の説明を、50音順に見る画面です。',
    points: [
      '上の<b>カテゴリ</b>で、人物・語句・出来事を絞れます。',
      '検索欄に、語句か読みを入れて探せます。',
      '長い説明は、<b>「続きを読む」</b>で全部開きます。',
      '丸いA・B・Cは、<b>出典の確かさの目安</b>です（Aがいちばん確か）。くわしくは<b>「出典」</b>ボタンで確かめてください。',
      '<b>「他での使用」</b>を押すと、同じ言葉が出てくるほかの書き起こしが見られます。'
    ]
  },
  persons: {
    icon: 'fa-users', title: '人物データベース', lead: '人物の紹介と、その人に関係する御書・年表の出来事を見る画面です。',
    points: [
      '検索欄に、氏名・別称・説明の言葉を入れて探せます。',
      '<b>50音</b>・<b>関係性</b>・<b>時代</b>のボタンで絞り込めます。',
      'カードをタップすると、くわしい紹介と、<b>関連する御書</b>・<b>関連する年表の出来事</b>が出ます。「詳細」を押すと、その御書に移動します。'
    ]
  },
  mergedlist: {
    icon: 'fa-layer-group', title: '結合した御書', lead: 'いろいろな書き起こしや解説書に引かれている御文を、御書ごとに1つにまとめた画面です。',
    points: [
      '御書ごとに、<b>「結合済み」</b>（まとめた文面がある）か<b>「未結合」</b>（まだ並べただけ）かが表示されます。',
      '<b>「結合した文面を開く」</b>で、まとめた文面を読めます。未結合のものは<b>「御文を開く」</b>で、集めた御文を順に読めます。',
      '<b>「▼元の御文の出典」</b>を押すと、どの書き起こし・解説書から集めたかが分かります。',
      '検索欄と、<b>種類</b>・<b>結合状態</b>の選び箱で絞り込めます。'
    ]
  },
  search: {
    icon: 'fa-magnifying-glass', title: '横断検索', lead: '御書・講義録・年表・人物を、まとめて探す画面です。',
    points: [
      '検索欄に言葉を入れると、すべてから探します。',
      '結果の上の<b>「すべて／御書／講義録／年表／人物DB」</b>のボタンで、見る範囲を選べます。数字は見つかった件数です。',
      '結果を押すと<b>プレビュー</b>が開き、<b>「詳細を見る」</b>で元の項目に移動します。'
    ]
  }
};

// 使い方ガイド本体（メニューの「使い方ガイド」）。goto＝「この画面を開く」の行き先（画面名）
const HELP_TOPICS = [
  { id:'menu', icon:'fa-bars', title:'画面の動かし方（メニュー）',
    body:[
      '画面を切り替えるには<b>メニュー</b>を使います。',
      'スマホ・タブレットでは、画面の左上の<b>☰</b>を押すとメニューが開きます。パソコンの広い画面では、左側にいつも出ています（☰で閉じられます）。',
      'ページを下に進めると、右下に<b>▲</b>が出ます。押すと先頭に戻れます。'
    ] },
  { id:'timeline', icon:'fa-timeline', title:'年表の見方', goto:'archive',
    body:[
      '年表は、古い順に並んでいます。左の列が年、右が項目です。日付は<b>和暦</b>で表示されます（閏月は「閏」と付きます）。',
      '項目をタップすると、詳しい内容が開きます。',
      '上の<b>時代のボタン</b>で、その時代へ移動できます。画面を動かすと、今いる時代の名前が右下に出ます。'
    ] },
  { id:'listmode', icon:'fa-list', title:'年表と一覧の切り替え', goto:'archive',
    body:[
      '「書き起こし」の画面の右下に、丸い大きなボタンがあります。<b>「一覧モードへ」</b>を押すと一覧に、<b>「年表モードへ」</b>を押すと年表に戻ります。',
      '一覧では、<b>カテゴリ → 題名</b>の順に選びます。総幹部会など、年表に出ていないものも、一覧なら見つかります。'
    ] },
  { id:'fulltext', icon:'fa-file-lines', title:'本文を読む・ふりがな', goto:'archive',
    body:[
      '項目の詳しい画面で<b>「本文全文」</b>を押すと、本文がすべて出ます。',
      '本文の下の<b>「ふりがな」</b>で、表示の仕方を選べます。<b>ルビ</b>は漢字の上に小さく、<b>括弧書き</b>は「寂光(じゃっこう)」のように並べて表示します。',
      '選んだ表示は、このスマホ・パソコンに覚えられます。'
    ] },
  { id:'pdf', icon:'fa-file-pdf', title:'PDFにして保存・印刷する', goto:'archive',
    body:[
      '本文全文の画面の<b>「PDF出力」</b>を押すと、印刷用の画面が開きます。そこから、PDFとして保存したり、印刷したりできます。',
      '<b>PDFフォント</b>（明朝体・ゴシック体など）と<b>文字サイズ</b>は、PDF出力の前に選べます。長い文章は<b>明朝体</b>が読みやすいです。',
      '書体は、お使いの端末に入っているものだけが使えます。入っていない書体を選ぶと、近い書体に自動で置きかわります。'
    ] },
  { id:'terms', icon:'fa-book-open', title:'AI解説の見方（A・B・C）', goto:'terms',
    body:[
      '人物・語句・出来事の説明が、50音順に並んでいます。',
      '丸いA・B・Cは、<b>出典の確かさの目安</b>です。Aがいちばん確かで、B、Cの順に下がります。',
      'AI解説は、読む助けとなる参考の説明です。大切な点は、<b>「出典」</b>ボタンで元の資料を確かめてください。'
    ] },
  { id:'persons', icon:'fa-users', title:'人物を調べる', goto:'persons',
    body:[
      '氏名で探すか、<b>50音・関係性・時代</b>のボタンで絞り込みます。カードを押すと、その人に関係する御書と年表の出来事が見られます。'
    ] },
  { id:'merged', icon:'fa-layer-group', title:'結合した御書の見方', goto:'mergedlist',
    body:[
      '同じ御書の御文が、いくつもの書き起こしや解説書に引かれていることがあります。それを御書ごとに集め、1つにまとめたものが「結合した御書」です。',
      '<b>結合済み</b>はまとめた文面を、<b>未結合</b>は集めた御文を、出所つきで読めます。出所は<b>「▼元の御文の出典」</b>で確かめられます。'
    ] },
  { id:'search', icon:'fa-magnifying-glass', title:'言葉で探す（横断検索）', goto:'search',
    body:[
      '知っている言葉で、御書・講義録・年表・人物をまとめて探せます。結果の数字は件数です。ボタンで見る範囲を選べます。',
      '各画面の上にも、その画面だけの検索欄があります。'
    ] },
  { id:'trouble', icon:'fa-circle-question', title:'うまくいかないとき',
    body:[
      '<b>「データを読み込み中…」のまま変わらない</b>：通信が不安定かもしれません。ページを再読み込み（更新）してください。',
      '<b>内容が古い気がする</b>：画面上部の<b>「最終更新」</b>の日時を見てください。再読み込みすると最新になります。',
      'このサイトは<b>見るだけ</b>の画面です。内容の修正・追加はできません。'
    ] }
];

/* ---------- ① 使い方ガイド（ポップアップ） ---------- */
function helpEsc(s){ return (typeof escapeHtml==='function')? escapeHtml(s) : String(s); }

function buildHelpGuideHtml(){
  const tabs = Object.keys(HELP_TABS).map(k=>{
    const t = HELP_TABS[k];
    return `<button type="button" class="help-jump" onclick="helpGoTab('${k}')">
      <i class="fa-solid ${t.icon}"></i><span class="hj-title">${helpEsc(t.title)}</span><span class="hj-lead">${helpEsc(t.lead)}</span></button>`;
  }).join('');
  const topics = HELP_TOPICS.map(t=>{
    const go = t.goto ? `<button type="button" class="btn btn-outline text-xs mt-2" onclick="helpGoTab('${t.goto}')"><i class="fa-solid fa-arrow-right"></i>この画面を開く</button>` : '';
    return `<details class="help-topic">
      <summary><i class="fa-solid ${t.icon}"></i>${helpEsc(t.title)}</summary>
      <div class="help-topic-body">${t.body.map(p=>`<p>${p}</p>`).join('')}${go}</div></details>`;
  }).join('');
  return `<p class="text-sm mb-3" style="color:var(--gray)">見たい画面を選ぶか、下の「困ったときの説明」を開いてください。</p>
    <h4 class="help-h">見たいものから探す</h4><div class="help-jump-grid">${tabs}</div>
    <h4 class="help-h">使い方の説明</h4>${topics}`;
}

function openHelpGuide(){
  if(typeof closeSidebar==='function' && !isWideScreen()) closeSidebar();
  const body = document.getElementById('helpGuideBody');
  if(body && !body.dataset.built){ body.innerHTML = buildHelpGuideHtml(); body.dataset.built = '1'; }
  closeHelpWelcome(true);
  openModal('helpGuideModal');
  if(body) body.scrollTop = 0;
}
function helpGoTab(tab){
  closeModal('helpGuideModal');
  switchTab(tab);
}

/* ---------- ② 各画面の先頭の「この画面の使い方」（開閉式） ---------- */
function initHelpPanels(){
  Object.keys(HELP_TABS).forEach(k=>{
    const view = document.getElementById('view-'+k);
    if(!view || view.querySelector('.help-inline')) return;
    const t = HELP_TABS[k];
    const d = document.createElement('details');
    d.className = 'help-inline';
    d.innerHTML = `<summary><i class="fa-solid fa-circle-question"></i>この画面の使い方</summary>
      <div class="help-inline-body"><p class="mb-2">${helpEsc(t.lead)}</p>
      <ul>${t.points.map(p=>`<li>${p}</li>`).join('')}</ul>
      <button type="button" class="help-more" onclick="openHelpGuide()">使い方ガイドをすべて見る</button></div>`;
    view.insertBefore(d, view.firstChild);
  });
}

/* ---------- ③ 初めて開いたときだけの案内カード ---------- */
const HELP_SEEN_KEY = 'kakiokoshi_viewer_help_seen';
function helpSeen(){ try{ return localStorage.getItem(HELP_SEEN_KEY)==='1'; }catch(e){ return false; } }
function helpMarkSeen(){ try{ localStorage.setItem(HELP_SEEN_KEY,'1'); }catch(e){} }

function showHelpWelcomeIfFirst(){
  if(helpSeen()) return;
  const card = document.getElementById('helpWelcome');
  if(!card) return;
  card.classList.add('show');
  const t = document.getElementById('sidebarToggle');
  if(t) t.classList.add('pulse');
}
function closeHelpWelcome(markSeen){
  const card = document.getElementById('helpWelcome');
  if(card) card.classList.remove('show');
  const t = document.getElementById('sidebarToggle');
  if(t) t.classList.remove('pulse');
  if(markSeen) helpMarkSeen();
}
function helpWelcomeOpenGuide(){ closeHelpWelcome(true); openHelpGuide(); }

document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closeModal('helpGuideModal');
});
initHelpPanels();
