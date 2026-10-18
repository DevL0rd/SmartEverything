import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { WakeHandoff } from '../src/wake-name/wake-handoff';

const VECTOR = z.strictObject({
  samplesPerMs: z.number(),
  floorDbfs: z.number(),
  cases: z.array(
    z.strictObject({
      name: z.string(),
      chunks: z.array(z.array(z.number())),
      tailMs: z.number(),
      dbfs: z.number(),
    }),
  ),
});

const vector = VECTOR.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../packages/domain/test/fixtures/wake-level-vector.json', import.meta.url),
      'utf8',
    ),
  ),
);

describe('the wake-word loudness shared with the phone ear', () => {
  it.each(vector.cases)('$name', ({ chunks, tailMs, dbfs }) => {
    const handoff = new WakeHandoff();
    for (const chunk of chunks) {
      handoff.keep(Int16Array.from(chunk));
    }
    expect(handoff.level(tailMs)).toBeCloseTo(dbfs, 9);
  });
});
