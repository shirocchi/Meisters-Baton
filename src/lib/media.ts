import { Capacitor } from '@capacitor/core';
import type { Frame } from '../domain/types';
export const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
export async function inspectVideo(
  file: Blob,
  onProgress?: (value: number) => void,
): Promise<{ duration: number; frames: Frame[] }> {
  if (file.size > MAX_MEDIA_BYTES)
    throw new Error('動画は250MB以内にしてください。長い動画は短く分けて取り込めます。');
  if (!file.type.startsWith('video/'))
    throw new Error('動画ファイルを選んでください。MP4またはWebMをおすすめします。');
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const event = (name: string, timeout = 15000) =>
    new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(name, done);
        video.removeEventListener('error', fail);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(
          new Error('この端末で動画を読み取れません。MP4またはWebMに変換して再度お試しください。'),
        );
      };
      video.addEventListener(name, done, { once: true });
      video.addEventListener('error', fail, { once: true });
      timer = setTimeout(fail, timeout);
    });
  try {
    const loaded = event('loadeddata');
    video.src = url;
    await loaded;
    // MediaRecorder WebM can omit duration metadata. Seeking resolves the duration in Chromium.
    if (!Number.isFinite(video.duration)) {
      const sought = event('seeked');
      video.currentTime = 1e10;
      await sought;
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('動画の長さを読み取れません。端末のカメラで保存した動画を選んでください。');
    if (duration > 3600)
      throw new Error(
        '1時間以内の動画を選んでください。工程ごとに分けると判断を残しやすくなります。',
      );
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(720, video.videoWidth);
    canvas.height = Math.round((video.videoHeight * canvas.width) / video.videoWidth);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像の読み取りを開始できません。');
    const count = Math.min(12, Math.max(3, Math.ceil(duration / 8)));
    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      const time = Math.max(0.01, Math.min(duration - 0.03, ((i + 0.3) * duration) / count));
      const seeked = event('seeked');
      video.currentTime = time;
      await seeked;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        id: crypto.randomUUID(),
        time: Math.round(time * 100) / 100,
        dataUrl: canvas.toDataURL('image/jpeg', 0.72),
      });
      onProgress?.((i + 1) / count);
    }
    return { duration, frames };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
export async function downloadFile(
  contents: string,
  name: string,
  type = 'application/json',
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
    const result = await Filesystem.writeFile({
      path: `exports/${Date.now()}-${safeName}`,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    await Share.share({
      title: safeName,
      files: [result.uri],
      dialogTitle: '引き継ぎを保存・共有',
    });
    return;
  }
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
