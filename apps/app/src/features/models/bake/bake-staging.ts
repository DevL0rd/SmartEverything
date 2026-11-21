import type { PixelRect } from './bake-bounds';

interface StagingDraw<S> {
  readonly copy: (image: S, from: PixelRect, to: PixelRect) => void;
}

export interface StagingCanvas<S> {
  readonly canvas: S;
  readonly draw: StagingDraw<S> | null;
}

export type MakeCanvas<S> = (width: number, height: number) => StagingCanvas<S>;

export type BakeSurface = HTMLCanvasElement | OffscreenCanvas;

export type StagedImage = ImageBitmap | BakeSurface;

export type Snapshot<S> = (source: S, rect: PixelRect) => Promise<S>;

export interface BakeStaging {
  readonly make: MakeCanvas<StagedImage>;
  readonly snapshot: Snapshot<StagedImage>;
  readonly encode: (image: StagedImage) => Promise<string>;
}

type Paint = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function staged(canvas: BakeSurface, context: Paint | null): StagingCanvas<StagedImage> {
  if (context === null) return { canvas, draw: null };
  const copy = (image: StagedImage, from: PixelRect, to: PixelRect): void => {
    context.drawImage(
      image,
      from.x,
      from.y,
      from.width,
      from.height,
      to.x,
      to.y,
      to.width,
      to.height,
    );
  };
  return { canvas, draw: { copy } };
}

function offscreenCanvas(width: number, height: number): StagingCanvas<StagedImage> {
  const canvas = new OffscreenCanvas(width, height);
  return staged(canvas, canvas.getContext('2d'));
}

function documentCanvas(width: number, height: number): StagingCanvas<StagedImage> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return staged(canvas, canvas.getContext('2d'));
}

function snapshot(source: StagedImage, rect: PixelRect): Promise<StagedImage> {
  return createImageBitmap(source, rect.x, rect.y, rect.width, rect.height);
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('the PNG did not read as a data URL'));
    };
    reader.onerror = (): void => {
      reject(new Error('the PNG could not be read', { cause: reader.error }));
    };
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('the canvas could not encode a PNG'));
      else resolve(blob);
    }, 'image/png');
  });
}

function surfaceBlob(canvas: BakeSurface): Promise<Blob> {
  return canvas instanceof HTMLCanvasElement
    ? canvasBlob(canvas)
    : canvas.convertToBlob({ type: 'image/png' });
}

function encoderOf(make: MakeCanvas<StagedImage>): (image: StagedImage) => Promise<string> {
  return async (image) => {
    if (!(image instanceof ImageBitmap)) return dataUrl(await surfaceBlob(image));
    const { width, height } = image;
    const target = make(width, height);
    const whole = { x: 0, y: 0, width, height };
    target.draw?.copy(image, whole, whole);
    image.close();
    if (target.canvas instanceof ImageBitmap) throw new Error('a staging canvas is a bitmap');
    return dataUrl(await surfaceBlob(target.canvas));
  };
}

export function offscreenStaging(): BakeStaging {
  return { make: offscreenCanvas, snapshot, encode: encoderOf(offscreenCanvas) };
}

export function documentStaging(): BakeStaging {
  return { make: documentCanvas, snapshot, encode: encoderOf(documentCanvas) };
}

export function releaseImage(held: { readonly canvas: StagedImage }): void {
  const { canvas } = held;
  if (canvas instanceof ImageBitmap) {
    canvas.close();
    return;
  }
  canvas.width = 0;
  canvas.height = 0;
}
