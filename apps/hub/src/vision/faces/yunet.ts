import { sampleBilinear, type Point, type RgbImage } from './image';

export const YUNET_INPUT = 640;
export const YUNET_SCORE_THRESHOLD = 0.9;
export const YUNET_NMS_IOU = 0.3;
export const YUNET_STRIDES = [8, 16, 32] as const;
export const YUNET_OUTPUTS = {
  cls: ['cls_8', 'cls_16', 'cls_32'],
  obj: ['obj_8', 'obj_16', 'obj_32'],
  bbox: ['bbox_8', 'bbox_16', 'bbox_32'],
  kps: ['kps_8', 'kps_16', 'kps_32'],
} as const;

export interface FaceCandidate {
  readonly score: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly landmarks: readonly [Point, Point, Point, Point, Point];
}

export interface YunetOutputs {
  readonly cls: readonly Float32Array[];
  readonly obj: readonly Float32Array[];
  readonly bbox: readonly Float32Array[];
  readonly kps: readonly Float32Array[];
}

export interface Letterbox {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

export function letterboxOf(image: { readonly width: number; readonly height: number }): Letterbox {
  const scale = Math.min(YUNET_INPUT / image.width, YUNET_INPUT / image.height);
  return { scale, width: image.width, height: image.height };
}

export function yunetInput(image: RgbImage, box: Letterbox): Float32Array {
  const plane = YUNET_INPUT * YUNET_INPUT;
  const tensor = new Float32Array(3 * plane);
  const fitWidth = Math.min(YUNET_INPUT, Math.round(image.width * box.scale));
  const fitHeight = Math.min(YUNET_INPUT, Math.round(image.height * box.scale));
  for (let row = 0; row < fitHeight; row += 1) {
    const sourceY = (row + 0.5) / box.scale - 0.5;
    for (let column = 0; column < fitWidth; column += 1) {
      const sourceX = (column + 0.5) / box.scale - 0.5;
      const offset = row * YUNET_INPUT + column;
      tensor[offset] = sampleBilinear(image, sourceX, sourceY, 2);
      tensor[plane + offset] = sampleBilinear(image, sourceX, sourceY, 1);
      tensor[2 * plane + offset] = sampleBilinear(image, sourceX, sourceY, 0);
    }
  }
  return tensor;
}

function iou(a: FaceCandidate, b: FaceCandidate): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

export function suppress(
  candidates: readonly FaceCandidate[],
  threshold: number = YUNET_NMS_IOU,
): FaceCandidate[] {
  const kept: FaceCandidate[] = [];
  for (const candidate of candidates.toSorted((a, b) => b.score - a.score))
    if (kept.every((other) => iou(candidate, other) <= threshold)) kept.push(candidate);
  return kept;
}

interface Cell {
  readonly level: number;
  readonly index: number;
  readonly stride: number;
}

function valueAt(values: Float32Array | undefined, index: number): number {
  return values?.[index] ?? 0;
}

function unit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function landmarkAt(marks: Float32Array | undefined, cell: Cell, n: number, scale: number): Point {
  const columns = YUNET_INPUT / cell.stride;
  return {
    x: ((valueAt(marks, cell.index * 10 + n * 2) + (cell.index % columns)) * cell.stride) / scale,
    y:
      ((valueAt(marks, cell.index * 10 + n * 2 + 1) + Math.floor(cell.index / columns)) *
        cell.stride) /
      scale,
  };
}

function candidateAt(outputs: YunetOutputs, cell: Cell, scale: number): FaceCandidate | null {
  const { level, index, stride } = cell;
  const score = Math.sqrt(
    unit(valueAt(outputs.cls[level], index)) * unit(valueAt(outputs.obj[level], index)),
  );
  if (score < YUNET_SCORE_THRESHOLD) return null;
  const columns = YUNET_INPUT / stride;
  const box = outputs.bbox[level];
  const cx = (valueAt(box, index * 4) + (index % columns)) * stride;
  const cy = (valueAt(box, index * 4 + 1) + Math.floor(index / columns)) * stride;
  const w = Math.exp(valueAt(box, index * 4 + 2)) * stride;
  const h = Math.exp(valueAt(box, index * 4 + 3)) * stride;
  const marks = outputs.kps[level];
  return {
    score,
    x: (cx - w / 2) / scale,
    y: (cy - h / 2) / scale,
    w: w / scale,
    h: h / scale,
    landmarks: [
      landmarkAt(marks, cell, 0, scale),
      landmarkAt(marks, cell, 1, scale),
      landmarkAt(marks, cell, 2, scale),
      landmarkAt(marks, cell, 3, scale),
      landmarkAt(marks, cell, 4, scale),
    ],
  };
}

export function decodeYunet(outputs: YunetOutputs, box: Letterbox): FaceCandidate[] {
  const found: FaceCandidate[] = [];
  YUNET_STRIDES.forEach((stride, level) => {
    const cells = (YUNET_INPUT / stride) ** 2;
    for (let index = 0; index < cells; index += 1) {
      const candidate = candidateAt(outputs, { level, index, stride }, box.scale);
      if (candidate !== null) found.push(candidate);
    }
  });
  return suppress(found);
}
