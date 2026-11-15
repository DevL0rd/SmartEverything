import type { LocalMediaShape } from './desktop-metadata';

const THUMB_QUALITY = 0.8;

export interface DesktopFrame {
  readonly url: string;
  readonly shape: LocalMediaShape;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

export function frameSize(width: number, height: number, px: number): Size {
  const scale = Math.min(1, px / Math.min(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encoded(
  size: Size,
  draw: (context: CanvasRenderingContext2D) => void,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The thumbnail canvas is unavailable');
  context.imageSmoothingQuality = 'high';
  draw(context);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('The thumbnail could not be encoded'));
        else resolve(URL.createObjectURL(blob));
      },
      'image/jpeg',
      THUMB_QUALITY,
    );
  });
}

async function shrunk(full: ImageBitmap, size: Size): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(full, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: 'high',
    });
  } finally {
    full.close();
  }
}

async function photoFrame(uri: string, px: number): Promise<DesktopFrame> {
  const response = await fetch(uri);
  if (!response.ok)
    throw new Error(`The local photo could not be read (status ${String(response.status)})`);
  const full = await createImageBitmap(await response.blob());
  const shape = { width: full.width, height: full.height, durationMs: null };
  const size = frameSize(full.width, full.height, px);
  const small = await shrunk(full, size);
  try {
    const url = await encoded(size, (context) => {
      context.drawImage(small, 0, 0);
    });
    return { url, shape };
  } finally {
    small.close();
  }
}

function firstFrame(uri: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.addEventListener(
      'loadeddata',
      () => {
        resolve(video);
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        unload(video);
        reject(new Error('The local video poster could not be decoded'));
      },
      { once: true },
    );
    video.src = uri;
  });
}

function unload(video: HTMLVideoElement): void {
  video.removeAttribute('src');
  video.load();
}

async function videoFrame(uri: string, px: number): Promise<DesktopFrame> {
  const video = await firstFrame(uri);
  const shape = {
    width: video.videoWidth,
    height: video.videoHeight,
    durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : null,
  };
  const size = frameSize(shape.width, shape.height, px);
  let small: ImageBitmap;
  try {
    small = await createImageBitmap(video, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: 'high',
    });
  } finally {
    unload(video);
  }
  try {
    const url = await encoded(size, (context) => {
      context.drawImage(small, 0, 0);
    });
    return { url, shape };
  } finally {
    small.close();
  }
}

export function desktopFrame(uri: string, video: boolean, px: number): Promise<DesktopFrame> {
  return video ? videoFrame(uri, px) : photoFrame(uri, px);
}
