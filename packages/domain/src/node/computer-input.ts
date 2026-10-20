import { z } from 'zod';
import { keyComboError } from './computer-keys';

export const INPUT_TEXT_MAX = 10_000;
export const INPUT_SCROLL_MAX = 100;
const PICTURE_PIXEL_MAX = 100_000;

export const KEY_COMBO = z
  .string()
  .trim()
  .min(1)
  .check((context) => {
    const problem = keyComboError(context.value);
    if (problem !== null) {
      context.issues.push({ code: 'custom', message: problem, input: context.value });
    }
  })
  .describe(
    'One key or a combination: Return, Tab, Escape, ctrl+l, ctrl+shift+t, alt+Left, F5, a single character',
  );

const COORDINATE = z.int().min(0).max(PICTURE_PIXEL_MAX);

const X = COORDINATE.describe('Pixels from the left edge of the screen picture you last saw');

const Y = COORDINATE.describe('Pixels from the top edge of the screen picture you last saw');

const NOTCHES = z
  .int()
  .min(-INPUT_SCROLL_MAX)
  .max(INPUT_SCROLL_MAX)
  .default(0)
  .describe('Wheel notches; positive scrolls down or right, negative up or left');

const POINTER = { x: X, y: Y };

export const COMPUTER_INPUT = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('click'), ...POINTER }),
  z.strictObject({ action: z.literal('double_click'), ...POINTER }),
  z.strictObject({ action: z.literal('right_click'), ...POINTER }),
  z.strictObject({ action: z.literal('move'), ...POINTER }),
  z.strictObject({
    action: z.literal('drag'),
    ...POINTER,
    toX: X.describe('Where to drop, pixels from the left edge'),
    toY: Y.describe('Where to drop, pixels from the top edge'),
  }),
  z
    .strictObject({ action: z.literal('scroll'), ...POINTER, dx: NOTCHES, dy: NOTCHES })
    .refine((scroll) => scroll.dx !== 0 || scroll.dy !== 0, {
      message: 'scroll needs a nonzero dx or dy',
      path: ['dy'],
    }),
  z.strictObject({
    action: z.literal('type'),
    text: z.string().min(1).max(INPUT_TEXT_MAX).describe('The text to type into the focused field'),
  }),
  z.strictObject({ action: z.literal('keys'), keys: KEY_COMBO }),
]);

export type ComputerInput = z.infer<typeof COMPUTER_INPUT>;

export interface ScreenPicture {
  readonly width: number;
  readonly height: number;
}

export const MODEL_PICTURE_LONG_EDGE = 1568;

export function modelPictureSize(picture: ScreenPicture): ScreenPicture {
  const longest = Math.max(picture.width, picture.height);
  if (longest <= MODEL_PICTURE_LONG_EDGE) return picture;
  const scale = MODEL_PICTURE_LONG_EDGE / longest;
  return {
    width: Math.max(1, Math.round(picture.width * scale)),
    height: Math.max(1, Math.round(picture.height * scale)),
  };
}

export interface ScreenRegion {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MappedPoint {
  readonly region: ScreenRegion;
  readonly x: number;
  readonly y: number;
}

export class InputPointError extends Error {
  override readonly name = 'InputPointError';

  constructor(
    readonly x: number,
    readonly y: number,
    reason: string,
  ) {
    super(`The point (${String(x)}, ${String(y)}) ${reason}`);
  }
}

function bounds(regions: readonly ScreenRegion[]): ScreenRegion {
  const left = Math.min(...regions.map((region) => region.x));
  const top = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.width));
  const bottom = Math.max(...regions.map((region) => region.y + region.height));
  return { id: 0, x: left, y: top, width: right - left, height: bottom - top };
}

function contains(region: ScreenRegion, x: number, y: number): boolean {
  return (
    x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height
  );
}

export function mapPicturePoint(
  picture: ScreenPicture,
  regions: readonly ScreenRegion[],
  point: { readonly x: number; readonly y: number },
): MappedPoint {
  if (regions.length === 0) throw new InputPointError(point.x, point.y, 'has no screen to land on');
  if (point.x >= picture.width || point.y >= picture.height) {
    throw new InputPointError(
      point.x,
      point.y,
      `is outside the ${String(picture.width)}x${String(picture.height)} picture`,
    );
  }
  const box = bounds(regions);
  const x = box.x + (point.x / picture.width) * box.width;
  const y = box.y + (point.y / picture.height) * box.height;
  const region = regions.find((candidate) => contains(candidate, x, y));
  if (region === undefined) throw new InputPointError(point.x, point.y, 'falls between screens');
  return { region, x: x - region.x, y: y - region.y };
}
