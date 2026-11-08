export interface LocalMediaShape {
  readonly width: number;
  readonly height: number;
  readonly durationMs: number | null;
}

function imageShape(uri: string): Promise<LocalMediaShape> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => {
      image.onload = null;
      image.onerror = null;
      resolve({ width: image.naturalWidth, height: image.naturalHeight, durationMs: null });
    };
    image.onerror = (): void => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('The local image metadata could not be read.'));
    };
    image.src = uri;
  });
}

function videoShape(uri: string): Promise<LocalMediaShape> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const dispose = (): void => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = (): void => {
      const shape = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : null,
      };
      dispose();
      resolve(shape);
    };
    video.onerror = (): void => {
      dispose();
      reject(new Error('The local video metadata could not be read.'));
    };
    video.src = uri;
  });
}

export function desktopMediaShape(uri: string, video: boolean): Promise<LocalMediaShape> {
  return video ? videoShape(uri) : imageShape(uri);
}
