import { wikiAssetFor, wikiLink, type WikiPage } from './growiWiki';
import { wikiSections } from './wikiWorkshop';
import { propellerPages, type PropellerStep, type PropellerScene } from './propellerWiki';

/** Display-only illustrations, selected from explicit source links in each manual section. */
export function illustratedManual(page: WikiPage, pages: WikiPage[]) {
  if (page.id !== 'home') return page.body;
  const used = new Set<string>();
  const assets = pages.flatMap((p) => p.attachments);
  for (const match of page.body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const asset = wikiAssetFor(match[1], assets);
    if (asset?.sha256) used.add(asset.sha256);
  }
  const sections = wikiSections(page.body);
  let body = page.body.slice(0, sections[0]?.start ?? page.body.length);
  for (const section of sections) {
    const text = page.body.slice(section.start, section.end);
    body += text;
    for (const match of text.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const route = wikiLink(match[1], page, pages).split('?')[0];
      const source = pages.find((p) => `#library/wiki/${encodeURIComponent(p.id)}` === route);
      const asset = source?.attachments
        .filter((a) => a.sha256 && !used.has(a.sha256) && a.contentType.startsWith('image/'))
        .sort((a, b) => a.bytes - b.bytes)[0];
      if (!asset || !source) continue;
      used.add(asset.sha256!);
      body += `\n\n![${asset.name.replace(/[\[\]]/g, '')}](${asset.url})\n\n[写真の出典：${source.title.replace(/[\[\]]/g, '')}](${match[1]})\n\n`;
      break;
    }
  }
  return body;
}

const contexts: [RegExp, PropellerScene, string, [string, string, string], string][] = [
  [
    /真空|バッグ|漏れ|脱泡/,
    'vacuum',
    '真空引き',
    ['バッグを覆う', '配管から排気', '密着を確認'],
    'バッグが積層面に沿って密着し、配管へ空気が抜ける様子。',
  ],
  [
    /接着|貼り合わせ|フランジ|圧締/,
    'bond',
    '貼り合わせ',
    ['上下を合わせる', '接合面を確認', '部材を一体化'],
    '上下の外皮と内部部材が、接合面で重なる位置関係。',
  ],
  [
    /スピナー/,
    'spinner',
    'スピナー',
    ['型と外皮', '曲面を写す', '型から分離'],
    'スピナーの曲面を型から外皮へ写す位置関係。',
  ],
  [
    /コア|ロハセル|バルサ|ウェブ|スパー|相貫/,
    'core',
    '内部部材の配置',
    ['外皮の内側', '内部部材を配置', '上下の対応'],
    '外皮の内側にコア材と内部部材が収まる位置関係。',
  ],
  [
    /積層|外皮|プリプレグ|クロス|樹脂/,
    'laminate',
    '積層',
    ['型の表面', '層を重ねる', '積層面を確認'],
    '型の表面に繊維の層を順に重ねる様子。',
  ],
  [
    /研磨|パテ|サフ|塗装|表面処理|仕上げ/,
    'finish',
    '表面の仕上げ',
    ['対象面', '道具を動かす', '表面を確認'],
    '道具を動かす範囲と、前縁・後縁・表面の位置関係。',
  ],
  [
    /雄型|雌型|型製作|脱型/,
    'mould',
    '型と脱型',
    ['雄型の形', '面を写し取る', '型を分離'],
    '雄型と雌型の接する面と、脱型で面が分かれる様子。',
  ],
  [
    /ハブ|締結|回転|試験|セットアップ/,
    'inspect',
    '組立・確認',
    ['ブレード', 'ハブ', '締結箇所'],
    'ハブを中心に、組立位置と確認箇所を順に示す。',
  ],
];
export function readingStep(chapter: string, parent = ''): PropellerStep {
  const match =
    contexts.find(([pattern]) => pattern.test(chapter)) ??
    contexts.find(([pattern]) => pattern.test(parent));
  if (!match)
    return {
      ...propellerPages[0].steps[0],
      id: `reading:${chapter}`,
      title: chapter,
      scene: 'overview',
      labels: ['型', '外皮・内部', '組立'],
      focus: '製作全体の位置関係',
    };
  const [, scene, title, labels, focus] = match;
  return {
    id: `reading:${chapter}`,
    title: chapter || title,
    scene,
    labels,
    focus,
    description: focus,
  };
}
