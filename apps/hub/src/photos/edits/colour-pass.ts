import { z } from 'zod';
import type { CompiledRecipe } from '@smarteverything/domain';

type ColourMatrix = CompiledRecipe['matrix'];

const LEVELS = 255;

const CURVE = z.array(z.int().min(0).max(LEVELS)).length(LEVELS + 1);

export const COLOUR_PLAN = z.strictObject({
  matrix: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
  curves: z.strictObject({ red: CURVE, green: CURVE, blue: CURVE }),
});

export interface ColourPlan {
  readonly matrix: ColourMatrix;
  readonly curves: {
    readonly red: readonly number[];
    readonly green: readonly number[];
    readonly blue: readonly number[];
  };
}

const IDENTITY: ColourMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export function isIdentityPlan(plan: ColourPlan): boolean {
  return (
    plan.matrix.every((value, index) => value === IDENTITY[index]) &&
    [plan.curves.red, plan.curves.green, plan.curves.blue].every((curve) =>
      curve.every((value, index) => value === index),
    )
  );
}

function lookup(curve: readonly number[]): Uint8Array {
  return Uint8Array.from(curve);
}

export function applyColour(pixels: Uint8Array, channels: number, plan: ColourPlan): Uint8Array {
  const out = Uint8Array.from(pixels);
  const red = lookup(plan.curves.red);
  const green = lookup(plan.curves.green);
  const blue = lookup(plan.curves.blue);
  const [a, b, c, d, e, f, g, h, i, j, k, l] = plan.matrix;
  const scale = LEVELS;
  for (let at = 0; at + 2 < pixels.length; at += channels) {
    const r = (red[pixels[at] ?? 0] ?? 0) / scale;
    const gr = (green[pixels[at + 1] ?? 0] ?? 0) / scale;
    const bl = (blue[pixels[at + 2] ?? 0] ?? 0) / scale;
    out[at] = Math.round((a * r + b * gr + c * bl + d) * scale);
    out[at + 1] = Math.round((e * r + f * gr + g * bl + h) * scale);
    out[at + 2] = Math.round((i * r + j * gr + k * bl + l) * scale);
  }
  return out;
}
