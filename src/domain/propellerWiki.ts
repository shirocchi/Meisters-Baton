/** Public information architecture. Never put Discord text or attachment URLs in this file. */
export type PropellerScene =
  'overview' | 'mould' | 'laminate' | 'vacuum' | 'core' | 'bond' | 'finish' | 'inspect' | 'spinner';
export interface PropellerStep {
  id: string;
  title: string;
  description: string;
  focus: string;
  scene: PropellerScene;
  labels: [string, string, string];
}
export interface PropellerPage {
  slug: string;
  group: string;
  title: string;
  summary: string;
  steps: PropellerStep[];
}
export const propellerPages: PropellerPage[] = [
  {
    slug: 'process-map',
    group: 'プロペラ製作',
    title: '製作の全体像',
    summary:
      '型からブレードへ、ブレードから一組のプロペラへ。工程のつながりと、各工程で残す知識をたどる入口です。',
    steps: [
      {
        id: 'shape',
        title: '形をつくる',
        description:
          '設計形状、雄型、雌型を一つの階層にまとめます。形を決める資料と、形を写し取る作業の記録を結びます。',
        focus: '形状の基準と、その形を写す型の関係',
        scene: 'mould',
        labels: ['設計形状', '雄型', '雌型'],
      },
      {
        id: 'structure',
        title: '外皮と内部構造をつくる',
        description:
          '外皮、コア材、スパー・ウェブをそれぞれのページに整理します。部品単体の工程から、組み合わせた構造へ読み進められます。',
        focus: '外皮に対して内部部材が入る位置',
        scene: 'core',
        labels: ['下側外皮', '内部部材', '上側外皮'],
      },
      {
        id: 'assembly',
        title: '貼り合わせ、仕上げる',
        description:
          '上下の位置合わせ、接着、外形の仕上げ、塗装へつながります。作業条件や合否基準は、各工程の一次資料と確認済みの手順で確かめます。',
        focus: '別々につくった部品が一体になる流れ',
        scene: 'bond',
        labels: ['上下位置', '接合面', '一体化'],
      },
      {
        id: 'verification',
        title: '確認して、次の製作へつなぐ',
        description:
          '完成時の記録と試験記録を分けて残します。設計値、実測値、確認者と判断理由を各ページの根拠へ結びます。',
        focus: 'ブレード・ハブ・確認記録のつながり',
        scene: 'inspect',
        labels: ['ブレード', 'ハブ', '確認記録'],
      },
    ],
  },
  {
    slug: 'mould-finishing',
    group: '01 / 型製作',
    title: '雄型・雌型と表面仕上げ',
    summary: '製品の形を写し取るための型。雄型の形状、表面、雌型、脱型の記録を整理します。',
    steps: [
      {
        id: 'master',
        title: '雄型の形状と基準面',
        description:
          '図面と雄型の対応、前縁・後縁、基準となる位置をこの節にまとめます。変更した箇所をあとから追える入口です。',
        focus: '型の輪郭と製品の形状',
        scene: 'mould',
        labels: ['基準面', '雄型の輪郭', '形状の確認'],
      },
      {
        id: 'surface',
        title: '表面を仕上げる',
        description:
          '表面処理の記録と仕上がりの観察をつなぎます。材料、研磨条件、処理の回数は製作ごとの根拠と一緒に管理します。',
        focus: '表面を整える範囲を順に見る',
        scene: 'finish',
        labels: ['対象面', '表面の処理', '仕上がり'],
      },
      {
        id: 'release',
        title: '雌型をつくり、脱型する',
        description:
          '雄型から雌型へ形を写す工程です。型同士の関係、脱型前後の状態、傷や変形の観察をこの節へまとめます。',
        focus: '接していた二つの面が分かれる動き',
        scene: 'mould',
        labels: ['雄型', '形を写す面', '雌型'],
      },
    ],
  },
  {
    slug: 'skin-lamination',
    group: '02 / ブレード製作',
    title: '外皮積層・真空引き',
    summary: '型の上に外皮を構成する層が重なり、バッグで覆われる関係をたどります。',
    steps: [
      {
        id: 'layers',
        title: '外皮の積層構成',
        description:
          '型、繊維、樹脂がどこに位置するかを整理する節です。実際の繊維方向・層数・材料条件は、対象機の設計資料に対応付けます。',
        focus: '型の上に層が重なる位置関係',
        scene: 'laminate',
        labels: ['雌型', '外皮の層', '積層面'],
      },
      {
        id: 'bagging',
        title: 'バギングと真空引き',
        description:
          'バッグ、外皮、型の位置関係を可視化します。真空条件、漏れの確認結果、修正の記録は一次資料へまとめます。',
        focus: 'バッグが積層面を覆う形',
        scene: 'vacuum',
        labels: ['積層面', 'バッグ', '配管'],
      },
      {
        id: 'inspection',
        title: '脱型後の外皮を確認する',
        description:
          '表面と端部、変形の有無、内部部材との位置関係を整理する節です。観察と原因の仮説を分けて記録します。',
        focus: '外皮全体から確認箇所へ視点を移す',
        scene: 'inspect',
        labels: ['全体', '端部', '観察記録'],
      },
    ],
  },
  {
    slug: 'core-fitting',
    group: '02 / ブレード製作',
    title: 'コア材・スパー・ウェブ',
    summary: '外皮の内側に収まる部材を、単体と組立状態の両方から見渡します。',
    steps: [
      {
        id: 'fitting',
        title: 'コア材と型の関係',
        description:
          'コア材が外皮の形状にどう対応するかを整理します。部位ごとの形状、分割、相貫の記録へつながる節です。',
        focus: '外皮の内側へ収まるコア材',
        scene: 'core',
        labels: ['外皮', 'コア材', '位置の対応'],
      },
      {
        id: 'members',
        title: 'スパー・ウェブの配置',
        description:
          '内部部材の位置、外皮との接合部、組立前の確認記録をまとめます。模式図は位置関係のみを示し、実機の寸法や構造仕様は表しません。',
        focus: '内部部材と接合面の関係',
        scene: 'core',
        labels: ['外皮', '内部部材', '接合部'],
      },
    ],
  },
  {
    slug: 'blade-bonding',
    group: '02 / ブレード製作',
    title: '上下外皮の貼り合わせ',
    summary: '別々につくった上下外皮と内部部材を、一つのブレードへつなぐ工程です。',
    steps: [
      {
        id: 'alignment',
        title: '上下の位置を合わせる',
        description:
          '上下外皮の基準、対応する位置、仮合わせの記録をまとめます。貼り合わせ後には見えなくなる場所を先に記録へ残すための節です。',
        focus: '上下の輪郭と基準位置',
        scene: 'bond',
        labels: ['下側外皮', '基準位置', '上側外皮'],
      },
      {
        id: 'joining',
        title: '接合部をつなぐ',
        description:
          '外皮同士と内部部材の接合を区別して整理します。接着材料・量・条件と、接合後の状態は個別の根拠で確認します。',
        focus: '上下と内部部材が一体になる様子',
        scene: 'bond',
        labels: ['接合面', '内部部材', 'ブレード'],
      },
    ],
  },
  {
    slug: 'paint-masking',
    group: '03 / 仕上げ',
    title: '外形仕上げ・塗装',
    summary: '接合後の外形と表面を整え、塗装へつなぐ工程の記録をまとめます。',
    steps: [
      {
        id: 'edges',
        title: '前縁・後縁と表面',
        description:
          '貼り合わせ後の外形と、仕上げ前後の状態を対応付けます。修正箇所と確認結果を別々に残すための節です。',
        focus: '輪郭に沿って確認範囲を移す',
        scene: 'finish',
        labels: ['前縁', '表面', '後縁'],
      },
      {
        id: 'masking',
        title: 'マスキングと塗装',
        description:
          'デザインの基準、マスキングの位置、塗装後の見え方を整理します。実際の材料と作業条件は製作記録を参照します。',
        focus: '表面の領域が順に覆われる様子',
        scene: 'finish',
        labels: ['位置合わせ', 'マスキング', '仕上がり'],
      },
    ],
  },
  {
    slug: 'rotation-safety',
    group: '04 / 組立・試験',
    title: 'ハブとの組立・試験記録',
    summary:
      'ブレードとハブの対応、締結の確認、試験結果を結びます。このページは試験実施の指示書ではありません。',
    steps: [
      {
        id: 'hub',
        title: 'ブレードとハブの対応',
        description:
          '組立位置と締結箇所の記録をまとめます。寸法、締結条件、二者確認などの正式な基準は、設計・安全責任者が確認した資料で管理します。',
        focus: '中央のハブに対する部品の位置',
        scene: 'inspect',
        labels: ['ブレード', 'ハブ', '締結箇所'],
      },
      {
        id: 'test-record',
        title: '試験の条件と結果を残す',
        description:
          '試験の承認、条件、観察結果、中止判断を一つずつ根拠へ対応付ける節です。解説モニターは構造の概念図で、回転速度や合否判定を示しません。',
        focus: '確認記録から対象部位へ戻る',
        scene: 'inspect',
        labels: ['対象部位', '観察', '確認記録'],
      },
    ],
  },
  {
    slug: 'spinner',
    group: '04 / 組立・試験',
    title: 'スピナーの製作',
    summary: 'スピナーの型、積層、貼り合わせを、ブレード本体の製作と分けて整理します。',
    steps: [
      {
        id: 'spinner-mould',
        title: 'スピナー型と積層',
        description:
          '曲面の型に沿って外皮をつくる工程です。型の表面、積層構成、部位ごとの記録をこの節からたどります。',
        focus: '型に沿って重なる曲面の層',
        scene: 'spinner',
        labels: ['スピナー型', '外皮', '曲面'],
      },
      {
        id: 'spinner-join',
        title: '脱型・貼り合わせ',
        description:
          '脱型後の各部分がどこでつながるかを整理します。接合方法や仕上がりは、対応する製作記録とあわせて確認します。',
        focus: '分かれた部品がつながる位置',
        scene: 'spinner',
        labels: ['各部分', '接合面', 'スピナー'],
      },
    ],
  },
];
export function getPropellerPage(slug?: string) {
  return propellerPages.find((page) => page.slug === slug);
}
export function searchPropellerPages(query: string) {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return propellerPages.filter((page) => {
    const text = [
      page.group,
      page.title,
      page.summary,
      ...page.steps.flatMap((step) => [step.title, step.description]),
    ]
      .join(' ')
      .normalize('NFKC')
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
export function getReadingStep(tops: number[], readingLine: number) {
  let selected = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= readingLine) selected = i;
  return selected;
}
export function clampMonitor(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    x: Math.max(8, Math.min(x, viewportWidth - width - 8)),
    y: Math.max(8, Math.min(y, viewportHeight - height - (viewportWidth <= 760 ? 88 : 12))),
  };
}
