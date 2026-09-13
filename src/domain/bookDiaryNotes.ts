/** Editorial notes derived from the local Pera diary; not reviewed manufacturing instructions. */
export interface DiaryNote {
  id: string;
  stage: string;
  tag: string;
  title: string;
  date: string;
  postedAt: string;
  messageId: string;
  observation: string;
  action: string;
}
export const DIARY_NOTES: DiaryNote[] = [
  {
    id: 'materials',
    stage: 'mold',
    tag: '準備',
    title: '主剤と硬化剤を、両方そろえてから始める',
    date: '2025-09-15',
    postedAt: '2025-09-15',
    messageId: '1417107025141432413',
    observation: '保護樹脂とパテの作業日に、主剤・硬化剤の不足が記録されています。',
    action: '使う材料の主剤と硬化剤を別々に確認し、必要量を担当者と照合してから作業を始めます。',
  },
  {
    id: 'winter-putty',
    stage: 'mold',
    tag: '硬化',
    title: '冬用パテは、一度に扱う量を確認する',
    date: '2025-12-17',
    postedAt: '2025-12-18',
    messageId: '1451038664007356620',
    observation: '冬用パテの硬化が早く、一度に少量しか扱えなかったと記録されています。',
    action:
      '製品名と当日の条件を確かめ、作業できる時間と一度に扱う量を担当者と決めます。日記には配合や可使時間の数値はありません。',
  },
  {
    id: 'spray-overlap',
    stage: 'skin',
    tag: '材料の配置',
    title: 'スプレーのりの量と、材料の重なりを確認する',
    date: '2025-10-19',
    postedAt: '2025-10-20',
    messageId: '1429709832545370173',
    observation:
      '練習型用の45°カーボンクロスづくりで、スプレーのりを吹きすぎたことと、重なりをもう少し取ってもよかったという振り返りがあります。',
    action:
      '貼る前に、のりの使い方と重ねる幅を製作手順で確認します。この記録だけから、適切な量や幅は決められません。',
  },
  {
    id: 'core-shift',
    stage: 'skin',
    tag: '積層後',
    title: '前縁のよれと、芯材の位置ずれを見る',
    date: '2025-10-25',
    postedAt: '2025-10-26',
    messageId: '1431697155306946560',
    observation: 'under側を型から外したところ、前縁側のよれと芯材の位置ずれが見つかっています。',
    action:
      '前縁（ブレードの前側の縁）と芯材の位置を、積層時と脱型後に確認します。ずれがあれば写真と位置を記録して担当者に見せます。',
  },
  {
    id: 'root-peeling',
    stage: 'skin',
    tag: '脱型後',
    title: '根元の剥離を見落とさない',
    date: '2026-02-18',
    postedAt: '2026-02-19',
    messageId: '1473863626229285028',
    observation: 'under外皮の根元が突っ張って剥離し、作り直しになっています。',
    action:
      '根元まで確認し、層が離れた箇所があれば次の工程へ進めるか担当者に判断を求めます。表面全体の見栄えだけで判断しません。',
  },
  {
    id: 'weight-cause',
    stage: 'skin',
    tag: '記録の読み方',
    title: '軽くなった理由は、まだ仮説',
    date: '2026-02-24',
    postedAt: '2026-02-25',
    messageId: '1476013271982145556',
    observation:
      '外皮の重量差について、気温による樹脂の粘りの違いとピール材の吸収量が原因の候補として挙げられています。',
    action:
      '重量と一緒に材料・気温・作業条件を記録します。日記中の原因候補を、確定した原因や軽量化の推奨手順として使わないでください。',
  },
  {
    id: 'leading-peeling',
    stage: 'skin',
    tag: '脱型後',
    title: 'きれいに見えても、前縁の層を確認する',
    date: '2026-03-15',
    postedAt: '2026-03-17',
    messageId: '1483394570757738606',
    observation: '外皮は一見よくできていても、前縁のカーボン繊維の層同士に剥離がありました。',
    action:
      '前縁を含む確認範囲と検査方法を担当者と合わせます。外観がきれいなことだけを、合格の根拠にしないでください。',
  },
  {
    id: 'flange-offset',
    stage: 'flange',
    tag: '位置合わせ',
    title: 'フランジとウェブの位置を仮組みで確かめる',
    date: '2026-03-23',
    postedAt: '2026-03-24',
    messageId: '1485933501076340826',
    observation:
      'ウェブを立てる予行で、フランジが後縁側へずれていることが判明しました。治具の位置補正を取っていなかったことが原因として疑われています。',
    action:
      '接着前に仮組みし、上下のフランジとウェブ（内部の縦板）が図面どおりにつながるか確認します。ずれを見つけたら補修方法を自己判断で決めず、設計担当者に相談します。',
  },
  {
    id: 'urethane-cure',
    stage: 'web',
    tag: '芯材',
    title: 'ウレタンの硬化を、先端側まで確認する',
    date: '2026-03-20',
    postedAt: '2026-03-21',
    messageId: '1484737584604385451',
    observation: '中央から先端側にウレタンの硬化不良があり、除去して流し直した記録があります。',
    action:
      '担当者と決めた硬化条件・確認方法で、中央から先端側まで確認します。日記に原因や判定値は記載されていません。',
  },
  {
    id: 'before-spar-weight',
    stage: 'web',
    tag: '重量記録',
    title: '桁を固定する前に、重量を残す',
    date: '2026-03-24',
    postedAt: '2026-03-24',
    messageId: '1485942134883483841',
    observation:
      '桁を固定する前のupper外皮の重量を記録し忘れ、追加部材から増加分を見積もっています。',
    action:
      '接着前の部材名・重量・測定段階を記録してから組みます。後から推定した重量は、実測値と区別して残します。',
  },
  {
    id: 'join-time',
    stage: 'join',
    tag: '段取り',
    title: '混ぜる前に、貼り合わせの段取りを済ませる',
    date: '2026-05-30',
    postedAt: '2026-06-01',
    messageId: '1510981510063460362',
    observation:
      '貼り合わせ中にエポキシパテが急速に硬化し、作業を急いだ記録があります。気温の影響は書き手の推測です。',
    action:
      '仮合わせ・治具・道具・役割分担を先に確認し、材料の可使時間内に作業できる段取りを組みます。配合や温度条件は材料の仕様と担当者の指示で確認します。',
  },
  {
    id: 'tip-length',
    stage: 'finish',
    tag: '先端',
    title: '長さの基準を決めてから積層する',
    date: '2026-06-11',
    postedAt: '2026-06-12',
    messageId: '1514855974756810822',
    observation: 'ペラ端の積層で、長さがばらばらのまま進めたことが反省点として記録されています。',
    action:
      'どの部分の長さをそろえるのか、基準と仕上がり寸法を図面で確認してから積層します。日記には、そろえる長さの数値はありません。',
  },
  {
    id: 'hub-fasteners',
    stage: 'finish',
    tag: '回転試験前',
    title: 'ブレードとハブのねじを、一つずつ確認する',
    date: '2026-07-02',
    postedAt: '2026-07-03',
    messageId: '1522453941088948314',
    observation:
      '回転試験時に、ブレードとハブをつなぐねじの取り付けが不十分で、外れかけたと記録されています。',
    action:
      '回転させる前に、ハブ（ブレードを取り付ける中心部）との締結を担当者と一つずつ確認します。規定トルク・緩み止め・検査手順が不明な状態では試験を始めません。',
  },
];
export const diarySourceUrl = (note: DiaryNote) =>
  `https://discord.com/channels/1384740821034729567/1391736630737633290/${note.messageId}`;
export const diaryNotesFor = (stage: string) =>
  stage === 'overview'
    ? DIARY_NOTES
    : DIARY_NOTES.filter(
        (note) => note.stage === stage || (stage === 'web' && note.id === 'flange-offset'),
      );
