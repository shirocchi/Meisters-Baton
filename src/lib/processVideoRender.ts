import type { ProcessVideoPlan } from '../domain/processVideo';

type Vec = { x: number; y: number; z: number };
const colors = {
  teal: [55, 148, 146],
  sand: [210, 185, 142],
  slate: [123, 142, 163],
  orange: [227, 148, 84],
};
export const MP4_MIME = 'video/mp4;codecs=avc1.42001f';
export function canRenderMp4() {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MP4_MIME);
}
const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const corners = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
function mesh(model: ProcessVideoPlan['models'][number]): Vec[][] {
  const { x, y, z } = model.size;
  if (model.shape === 'box') {
    const points = corners.map(([a, b, c]) => ({ x: (a * x) / 2, y: (b * y) / 2, z: (c * z) / 2 }));
    return [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ].map((face) => face.map((i) => points[i]));
  }
  const rows = model.shape === 'ellipsoid' ? 12 : model.shape === 'blade' ? 16 : 1;
  const segments = 24;
  const ring = (r: number, n: number): Vec => {
    const t = r / rows,
      angle = (n / segments) * Math.PI * 2;
    const radius =
      model.shape === 'ellipsoid'
        ? Math.sin(t * Math.PI)
        : model.shape === 'blade'
          ? 0.25 + 0.75 * Math.sin(Math.PI * (0.15 + 0.8 * t))
          : 1;
    return {
      x: (t - 0.5) * x,
      y: ((Math.cos(angle) * y) / 2) * radius,
      z: ((Math.sin(angle) * z) / 2) * radius,
    };
  };
  const faces: Vec[][] = [];
  for (let r = 0; r < rows; r++)
    for (let n = 0; n < segments; n++)
      faces.push([ring(r, n), ring(r, n + 1), ring(r + 1, n + 1), ring(r + 1, n)]);
  faces.push(
    Array.from({ length: segments }, (_, i) => ring(0, i)).reverse(),
    Array.from({ length: segments }, (_, i) => ring(rows, i)),
  );
  return faces;
}
function transform(v: Vec, rotation: Vec, position: Vec): Vec {
  let { x, y, z } = v;
  [y, z] = [
    y * Math.cos(rotation.x) - z * Math.sin(rotation.x),
    y * Math.sin(rotation.x) + z * Math.cos(rotation.x),
  ];
  [x, z] = [
    x * Math.cos(rotation.y) + z * Math.sin(rotation.y),
    -x * Math.sin(rotation.y) + z * Math.cos(rotation.y),
  ];
  [x, y] = [
    x * Math.cos(rotation.z) - y * Math.sin(rotation.z),
    x * Math.sin(rotation.z) + y * Math.cos(rotation.z),
  ];
  return { x: x + position.x, y: y + position.y, z: z + position.z };
}
function project(v: Vec) {
  return {
    x: 795 + (v.x - v.y) * 130,
    y: 495 + (v.x + v.y) * 52 - v.z * 140,
    depth: v.x + v.y + v.z,
  };
}
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines: number,
) {
  let line = '',
    row = 0;
  for (const char of text) {
    if (ctx.measureText(line + char).width > width || char === '\n') {
      ctx.fillText(row === maxLines - 1 ? line.slice(0, -1) + '…' : line, x, y + row * lineHeight);
      if (++row >= maxLines) return;
      line = char === '\n' ? '' : char;
    } else line += char;
  }
  ctx.fillText(line, x, y + row * lineHeight);
}
export function drawProcessFrame(
  canvas: HTMLCanvasElement,
  plan: ProcessVideoPlan,
  sceneIndex: number,
  progress: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('描画領域を利用できません。');
  const scene = plan.scenes[sceneIndex];
  ctx.fillStyle = '#101b29';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#61ccc3';
  ctx.font = '500 25px "Noto Sans JP Variable", sans-serif';
  ctx.fillText(
    `MEISTER’S BATON   /   ${String(sceneIndex + 1).padStart(2, '0')} — ${plan.scenes.length}`,
    72,
    65,
  );
  ctx.fillStyle = '#f2f5f7';
  ctx.font = '600 46px "Noto Sans JP Variable", sans-serif';
  wrap(ctx, scene.title, 72, 140, 1700, 56, 2);
  ctx.strokeStyle = '#2a3949';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    for (const pair of [
      [
        { x: i, y: -4, z: -1.5 },
        { x: i, y: 4, z: -1.5 },
      ],
      [
        { x: -4, y: i, z: -1.5 },
        { x: 4, y: i, z: -1.5 },
      ],
    ]) {
      const [a, b] = pair.map(project);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  const t = progress < 0.15 ? 0 : progress > 0.85 ? 1 : (progress - 0.15) / 0.7;
  const ease = t * t * (3 - 2 * t);
  const faces: {
    points: ReturnType<typeof project>[];
    color: number[];
    depth: number;
    shade: number;
  }[] = [];
  for (const model of plan.models) {
    const from = scene.start.find((p) => p.modelId === model.id)!;
    const to = scene.end.find((p) => p.modelId === model.id)!;
    const position = lerp(from.position, to.position, ease),
      rotation = lerp(from.rotation, to.rotation, ease);
    for (const face of mesh(model)) {
      const points = face.map((v) => project(transform(v, rotation, position)));
      const shade = 0.62 + 0.32 * Math.abs(Math.sin(points[0].x * 0.004 + points[0].y * 0.002));
      faces.push({
        points,
        color: colors[model.color],
        depth: points.reduce((sum, v) => sum + v.depth, 0) / points.length,
        shade,
      });
    }
  }
  for (const face of faces.sort((a, b) => a.depth - b.depth)) {
    ctx.beginPath();
    face.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = `rgb(${face.color.map((c) => Math.round(c * face.shade)).join(',')})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,245,255,0.1)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  ctx.font = '500 27px "Noto Sans JP Variable", sans-serif';
  plan.models.forEach((m, i) => {
    ctx.fillStyle = `rgb(${colors[m.color].join(',')})`;
    ctx.fillRect(1490, 280 + i * 58, 12, 30);
    ctx.fillStyle = '#dce4ee';
    wrap(ctx, m.label, 1520, 305 + i * 58, 320, 34, 1);
  });
  ctx.fillStyle = '#1a2b3a';
  ctx.fillRect(48, 795, 1824, 217);
  ctx.fillStyle = '#f2f5f7';
  ctx.font = '500 36px "Noto Sans JP Variable", sans-serif';
  wrap(ctx, scene.caption, 78, 849, 1750, 48, 2);
  ctx.fillStyle = '#b6c5d3';
  ctx.font = '400 23px "Noto Sans JP Variable", sans-serif';
  wrap(ctx, scene.uncertainty, 78, 955, 1750, 30, 1);
  ctx.fillStyle = '#9bacbd';
  ctx.font = '400 21px "Noto Sans JP Variable", sans-serif';
  ctx.fillText('概念図・製法確認前 / 寸法は縮尺を表さない / 出典は同梱の制作データ参照', 72, 1050);
  ctx.fillStyle = '#61ccc3';
  ctx.fillRect(48, 1005, 1824 * ((sceneIndex + progress) / plan.scenes.length), 7);
}
export async function renderProcessMp4(
  plan: ProcessVideoPlan,
  canvas: HTMLCanvasElement,
  onProgress: (value: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!canRenderMp4())
    throw Error(
      'このブラウザーはMP4の書き出しに対応していません。ChromeまたはEdgeで開いてください。',
    );
  if (document.hidden) throw Error('この画面を表示した状態で書き出してください。');
  await document.fonts.ready;
  canvas.width = 1920;
  canvas.height = 1080;
  drawProcessFrame(canvas, plan, 0, 0);
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType: MP4_MIME, videoBitsPerSecond: 2500000 });
  const chunks: Blob[] = [];
  const duration = plan.scenes.reduce((n, s) => n + s.seconds, 0);
  let animation = 0,
    fail: Error | undefined;
  const stop = (error?: Error) => {
    fail = error;
    cancelAnimationFrame(animation);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const visibility = () => {
    if (document.hidden)
      stop(Error('画面が非表示になったため中断しました。表示したまま再試行してください。'));
  };
  const abort = () => stop(Error('書き出しを中断しました。'));
  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => stop(Error('MP4への変換に失敗しました。'));
    recorder.onstop = async () => {
      document.removeEventListener('visibilitychange', visibility);
      signal?.removeEventListener('abort', abort);
      stream.getTracks().forEach((track) => track.stop());
      if (fail) {
        reject(fail);
        return;
      }
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      if (String.fromCharCode(...head.slice(4, 8)) !== 'ftyp') {
        reject(Error('出力がMP4形式ではありません。'));
        return;
      }
      onProgress(1);
      resolve(blob);
    };
    document.addEventListener('visibilitychange', visibility);
    signal?.addEventListener('abort', abort, { once: true });
    recorder.start(1000);
    if (signal?.aborted) {
      abort();
      return;
    }
    const started = performance.now();
    const frame = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= duration) {
        stop();
        return;
      }
      let offset = elapsed,
        index = 0;
      while (index < plan.scenes.length - 1 && offset >= plan.scenes[index].seconds)
        offset -= plan.scenes[index++].seconds;
      drawProcessFrame(canvas, plan, index, offset / plan.scenes[index].seconds);
      onProgress(elapsed / duration);
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
  });
}
