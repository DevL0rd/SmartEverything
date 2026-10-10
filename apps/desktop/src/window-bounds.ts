import { z } from 'zod';

export const MINIMUM_WINDOW_SIZE = { width: 480, height: 360 } as const;
const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 } as const;
const MINIMUM_VISIBLE_EDGE = 64;

const rectangleSchema = z.strictObject({
  x: z.int(),
  y: z.int(),
  width: z.int().min(MINIMUM_WINDOW_SIZE.width),
  height: z.int().min(MINIMUM_WINDOW_SIZE.height),
});

export const windowStateSchema = z.strictObject({
  bounds: rectangleSchema,
  maximized: z.boolean(),
});

export type WindowState = z.infer<typeof windowStateSchema>;

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function overlap(start: number, length: number, areaStart: number, areaLength: number): number {
  return Math.min(start + length, areaStart + areaLength) - Math.max(start, areaStart);
}

export function isVisibleOn(bounds: Rectangle, area: Rectangle): boolean {
  return (
    overlap(bounds.x, bounds.width, area.x, area.width) >= MINIMUM_VISIBLE_EDGE &&
    overlap(bounds.y, bounds.height, area.y, area.height) >= MINIMUM_VISIBLE_EDGE
  );
}

export function centredOn(area: Rectangle): Rectangle {
  const width = Math.max(
    MINIMUM_WINDOW_SIZE.width,
    Math.min(DEFAULT_WINDOW_SIZE.width, area.width),
  );
  const height = Math.max(
    MINIMUM_WINDOW_SIZE.height,
    Math.min(DEFAULT_WINDOW_SIZE.height, area.height),
  );
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

export interface Placement {
  readonly saved: WindowState | undefined;
  readonly workAreas: readonly Rectangle[];
  readonly primaryWorkArea: Rectangle;
}

export function placeWindow(placement: Placement): WindowState {
  const { saved, workAreas, primaryWorkArea } = placement;
  if (saved !== undefined && workAreas.some((area) => isVisibleOn(saved.bounds, area))) {
    return saved;
  }
  return { bounds: centredOn(primaryWorkArea), maximized: saved?.maximized ?? false };
}
