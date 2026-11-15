import type { PhotoBox, PhotoRecipe } from '@smarteverything/domain';

export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const IDENTITY_MAT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function cell(a: Mat3, b: Mat3, row: number, col: number): number {
  const r = row * 3;
  return (
    (a[r] ?? 0) * (b[col] ?? 0) +
    (a[r + 1] ?? 0) * (b[3 + col] ?? 0) +
    (a[r + 2] ?? 0) * (b[6 + col] ?? 0)
  );
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    cell(a, b, 0, 0),
    cell(a, b, 0, 1),
    cell(a, b, 0, 2),
    cell(a, b, 1, 0),
    cell(a, b, 1, 1),
    cell(a, b, 1, 2),
    cell(a, b, 2, 0),
    cell(a, b, 2, 1),
    cell(a, b, 2, 2),
  ];
}

export function apply(m: Mat3, x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: m[0] * x + m[1] * y + m[2], y: m[3] * x + m[4] * y + m[5] };
}

function translate(x: number, y: number): Mat3 {
  return [1, 0, x, 0, 1, y, 0, 0, 1];
}

function scale(x: number, y: number): Mat3 {
  return [x, 0, 0, 0, y, 0, 0, 0, 1];
}

function turn(radians: number): Mat3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
}

export function inscribed(size: Size, degrees: number): Size {
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { width, height } = size;
  const fit = Math.min(width / (width * cos + height * sin), height / (width * sin + height * cos));
  return { width: width * fit, height: height * fit };
}

function turnedSize(size: Size, quarterTurns: number): Size {
  return quarterTurns % 2 === 1 ? { width: size.height, height: size.width } : size;
}

interface Stage {
  readonly toSource: Mat3;
  readonly size: Size;
}

function flipBack(recipe: PhotoRecipe, size: Size): Mat3 {
  const x: Mat3 = recipe.flipHorizontal ? [-1, 0, size.width, 0, 1, 0, 0, 0, 1] : IDENTITY_MAT;
  const y: Mat3 = recipe.flipVertical ? [1, 0, 0, 0, -1, size.height, 0, 0, 1] : IDENTITY_MAT;
  return multiply(x, y);
}

function turnBack(quarterTurns: number, size: Size): Mat3 {
  let toSource = IDENTITY_MAT;
  let current = size;
  for (let step = 0; step < quarterTurns; step += 1) {
    const back: Mat3 = [0, 1, 0, -1, 0, current.width, 0, 0, 1];
    toSource = multiply(back, toSource);
    current = { width: current.height, height: current.width };
  }
  return toSource;
}

function straightenBack(degrees: number, turned: Size): Stage {
  const size = inscribed(turned, degrees);
  const radians = (-degrees * Math.PI) / 180;
  const toTurned = multiply(
    translate(turned.width / 2, turned.height / 2),
    multiply(turn(radians), translate(-size.width / 2, -size.height / 2)),
  );
  return { toSource: toTurned, size };
}

function cropBack(box: PhotoBox | null, size: Size): Stage {
  if (box === null) return { toSource: IDENTITY_MAT, size };
  return {
    toSource: translate(box.x * size.width, box.y * size.height),
    size: { width: box.w * size.width, height: box.h * size.height },
  };
}

export interface ShownGeometry {
  readonly toSourceUv: Mat3;
  readonly size: Size;
}

export function shownGeometry(recipe: PhotoRecipe, source: Size): ShownGeometry {
  const flips = flipBack(recipe, source);
  const turned = turnedSize(source, recipe.quarterTurns);
  const turns = turnBack(recipe.quarterTurns, turned);
  const straight = straightenBack(recipe.straighten, turned);
  const crop = cropBack(recipe.crop, straight.size);
  const toSourcePx = multiply(flips, multiply(turns, multiply(straight.toSource, crop.toSource)));
  const toSourceUv = multiply(
    scale(1 / source.width, 1 / source.height),
    multiply(toSourcePx, scale(crop.size.width, crop.size.height)),
  );
  return { toSourceUv, size: crop.size };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function fitRect(frame: Size, content: Size): Rect {
  if (frame.width <= 0 || frame.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const fit = Math.min(frame.width / content.width, frame.height / content.height);
  const width = content.width * fit;
  const height = content.height * fit;
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height };
}

export function insetFit(frame: Size, content: Size, pad: number): Rect {
  const inner = fitRect({ width: frame.width - 2 * pad, height: frame.height - 2 * pad }, content);
  return { ...inner, left: inner.left + pad, top: inner.top + pad };
}
