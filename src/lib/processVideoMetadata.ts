/** Inspect bytes with the browser decoder before publishing a rendered MP4. */
export async function readProcessVideoMetadata(blob: Blob) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ duration: number; width: number; height: number }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('動画の読み出しが時間内に完了しませんでした。')),
          15000,
        );
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0 ||
            !video.videoWidth ||
            !video.videoHeight
          )
            reject(Error('動画の長さ・大きさを確認できませんでした。'));
          else
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            });
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(Error('MP4を読み出せませんでした。書き出し直してください。'));
        };
        video.preload = 'metadata';
        video.src = url;
      },
    );
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
