import type { SightSampling } from '@smarteverything/domain';

const THUMB_WIDTH = 32;
const THUMB_HEIGHT = 18;
const QUALITY_STEPS = [1, 0.8, 0.6, 0.4] as const;
const GREY = { red: 0.299, green: 0.587, blue: 0.114 } as const;
const CHANNELS = 4;
const FULL_SCALE = 255;

export class SightRenderError extends Error {
  override readonly name = 'SightRenderError';
}

function contextOf(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    throw new SightRenderError('This browser gave no 2D canvas to prepare a picture');
  }
  return context;
}

export function fitted(
  width: number,
  height: number,
  longEdge: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export class FrameRenderer {
  private readonly picture = new OffscreenCanvas(1, 1);
  private readonly thumb = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT);
  private previous: Uint8Array | null = null;

  forget(): void {
    this.previous = null;
  }

  glance(frame: VideoFrame): Uint8Array {
    const context = contextOf(this.thumb);
    context.drawImage(frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    const pixels = context.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT).data;
    const grey = new Uint8Array(THUMB_WIDTH * THUMB_HEIGHT);
    for (let index = 0; index < grey.length; index += 1) {
      const at = index * CHANNELS;
      grey[index] =
        (pixels[at] ?? 0) * GREY.red +
        (pixels[at + 1] ?? 0) * GREY.green +
        (pixels[at + 2] ?? 0) * GREY.blue;
    }
    return grey;
  }

  differs(glance: Uint8Array, threshold: number): boolean {
    const previous = this.previous;
    if (previous === null) {
      return true;
    }
    let sum = 0;
    for (let index = 0; index < glance.length; index += 1) {
      sum += Math.abs((glance[index] ?? 0) - (previous[index] ?? 0));
    }
    return sum / glance.length / FULL_SCALE > threshold;
  }

  remember(glance: Uint8Array): void {
    this.previous = glance;
  }

  async jpeg(frame: VideoFrame, sampling: SightSampling, maxBytes: number): Promise<Uint8Array> {
    const size = fitted(frame.displayWidth, frame.displayHeight, sampling.longEdge);
    this.picture.width = size.width;
    this.picture.height = size.height;
    contextOf(this.picture).drawImage(frame, 0, 0, size.width, size.height);
    for (const step of QUALITY_STEPS) {
      const blob = await this.picture.convertToBlob({
        type: 'image/jpeg',
        quality: sampling.quality * step,
      });
      if (blob.size <= maxBytes) {
        return new Uint8Array(await blob.arrayBuffer());
      }
    }
    throw new SightRenderError(
      `A picture of ${String(size.width)}x${String(size.height)} stayed over ${String(maxBytes)} bytes at the lowest quality`,
    );
  }
}
