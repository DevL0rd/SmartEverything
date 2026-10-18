const START_DEGREES = -180;
const SWEEP_DEGREES = 180;

export const ARC_WIDTH = 220;
export const ARC_HEIGHT = 120;
const CENTRE_X = 110;
const CENTRE_Y = 108;
const INNER = 70;
const OUTER = 96;

export interface Tick {
  readonly key: string;
  readonly lit: boolean;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function ticksOf(levels: readonly string[], index: number): readonly Tick[] {
  return levels.map((level, step) => {
    const degrees =
      START_DEGREES +
      (levels.length < 2 ? SWEEP_DEGREES : (step * SWEEP_DEGREES) / (levels.length - 1));
    const angle = (degrees * Math.PI) / 180;
    return {
      key: level,
      lit: step <= index,
      x1: CENTRE_X + INNER * Math.cos(angle),
      y1: CENTRE_Y + INNER * Math.sin(angle),
      x2: CENTRE_X + OUTER * Math.cos(angle),
      y2: CENTRE_Y + OUTER * Math.sin(angle),
    };
  });
}

export function stepped(index: number, delta: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index + delta));
}
