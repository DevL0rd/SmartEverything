import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadResult,
  type ReadScope,
} from './read-port';

const DRAW_BITS = 48;

const DRAW_BYTES = 6;

type Draw = () => number;

export interface RandomPort {
  readonly draw: (scope: ReadScope) => Draw;
}

export function seededDraw(seed: string): Draw {
  let counter = 0;
  return () => {
    const digest = createHash('sha256')
      .update(`${seed}:${String(counter)}`)
      .digest();
    counter += 1;
    return digest.readUIntBE(0, DRAW_BYTES) / 2 ** DRAW_BITS;
  };
}

export const seededRandom: RandomPort = {
  draw: (scope) => seededDraw(`${String(scope.seed)}:${scope.nodeKey}:${scope.activation}`),
};

const RANDOM_NUMBER = z.object({
  min: z.number(),
  max: z.number(),
  integer: z.boolean(),
});

const RANDOM_CHOICE = z.object({
  list: z.array(JSON_VALUE).min(1),
  weights: z.array(z.number().nonnegative()).optional(),
  noRepeat: z.boolean(),
});

const RANDOM_CHANCE = z.object({ probability: z.number().min(0).max(1) });

const RANDOM_DURATION = z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() });

const CHOICE_MEMORY = z.strictObject({
  size: z.int().nonnegative(),
  used: z.array(z.int().nonnegative()),
});

function numberBetween(request: z.output<typeof RANDOM_NUMBER>, draw: Draw): number {
  if (request.min > request.max) {
    throw new ReadFailure(
      'Invalid',
      `The lowest number ${String(request.min)} is above the highest ${String(request.max)}`,
    );
  }
  if (!request.integer) return request.min + draw() * (request.max - request.min);
  const low = Math.ceil(request.min);
  const high = Math.floor(request.max);
  if (low > high) {
    throw new ReadFailure(
      'Invalid',
      `There is no whole number from ${String(request.min)} to ${String(request.max)}`,
    );
  }
  return low + Math.floor(draw() * (high - low + 1));
}

function remembered(scope: ReadScope, size: number): readonly number[] {
  const memory = CHOICE_MEMORY.safeParse(scope.memory);
  return memory.success && memory.data.size === size ? memory.data.used : [];
}

function weightedIndex(
  candidates: readonly number[],
  weights: readonly number[],
  point: number,
): number {
  const chances = candidates.filter((index) => (weights[index] ?? 0) > 0);
  const last = chances.at(-1);
  if (last === undefined) {
    throw new ReadFailure('Invalid', 'The weights give no item a chance to be picked');
  }
  const total = chances.reduce((sum, index) => sum + (weights[index] ?? 0), 0);
  let remaining = point * total;
  for (const index of chances.slice(0, -1)) {
    remaining -= weights[index] ?? 0;
    if (remaining < 0) return index;
  }
  return last;
}

interface Chosen {
  readonly index: number;
  readonly memory: JsonValue | undefined;
}

function chooseFrom(request: z.output<typeof RANDOM_CHOICE>, scope: ReadScope, draw: Draw): Chosen {
  const size = request.list.length;
  const weights = request.weights ?? request.list.map(() => 1);
  if (weights.length !== size) {
    throw new ReadFailure(
      'Invalid',
      `There are ${String(weights.length)} weights for ${String(size)} items`,
    );
  }
  const all = request.list.map((_item, index) => index);
  const used = request.noRepeat ? remembered(scope, size) : [];
  const unused = all.filter((index) => !used.includes(index));
  const fresh = unused.length === 0;
  const index = weightedIndex(fresh ? all : unused, weights, draw());
  const memory = request.noRepeat ? { size, used: fresh ? [index] : [...used, index] } : undefined;
  return { index, memory };
}

export function randomHandlers(random: RandomPort): ReadHandlers {
  return {
    'random.number': (inputs, scope): ReadResult => {
      const request = parseInputs('random.number', RANDOM_NUMBER, inputs);
      return outputsOf({ value: numberBetween(request, random.draw(scope)) });
    },
    'random.chance': (inputs, scope): ReadResult => {
      const request = parseInputs('random.chance', RANDOM_CHANCE, inputs);
      return outputsOf({ result: random.draw(scope)() < request.probability });
    },
    'random.duration': (inputs, scope): ReadResult => {
      const request = parseInputs('random.duration', RANDOM_DURATION, inputs);
      if (request.min > request.max) {
        throw new ReadFailure(
          'Invalid',
          `The shortest delay ${String(request.min)} is above the longest ${String(request.max)}`,
        );
      }
      const span = request.max - request.min;
      return outputsOf({ duration: request.min + Math.floor(random.draw(scope)() * (span + 1)) });
    },
    'random.choice': (inputs, scope): ReadResult => {
      const request = parseInputs('random.choice', RANDOM_CHOICE, inputs);
      const { index, memory } = chooseFrom(request, scope, random.draw(scope));
      const item = request.list[index];
      const result = outputsOf({ item, index });
      return memory === undefined ? result : { ...result, memory };
    },
  };
}
