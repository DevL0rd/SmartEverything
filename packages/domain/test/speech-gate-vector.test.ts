import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ECHO_POLICY, TalkGate } from '../src';

const VECTOR = z.strictObject({
  description: z.string(),
  frameMs: z.number(),
  cases: z.array(
    z.strictObject({
      name: z.string(),
      settings: z.strictObject({
        echoTailMs: z.number(),
        sustainMs: z.number(),
        bargeInLevel: z.number(),
        ignoreAssistantAudible: z.boolean(),
        interruptible: z.boolean(),
        minSpeechMs: z.number(),
      }),
      frames: z.array(
        z.strictObject({
          count: z.number(),
          voiced: z.boolean(),
          level: z.number(),
          audible: z.boolean(),
        }),
      ),
      events: z.array(z.strictObject({ frame: z.number(), event: z.enum(['open', 'close']) })),
    }),
  ),
});

type Case = z.infer<typeof VECTOR>['cases'][number];

const vector = VECTOR.parse(
  JSON.parse(readFileSync(new URL('fixtures/speech-gate-vector.json', import.meta.url), 'utf8')),
);

function eventsOf(vectorCase: Case): Case['events'] {
  const { settings } = vectorCase;
  const events: { frame: number; event: 'open' | 'close' }[] = [];
  let index = 0;
  const gate = new TalkGate(
    {
      open: (): void => {
        events.push({ frame: index, event: 'open' });
      },
      close: (): void => {
        events.push({ frame: index, event: 'close' });
      },
    },
    settings.bargeInLevel,
    { ...ECHO_POLICY.normal, ...settings },
  );
  const confirmAt = settings.minSpeechMs / vector.frameMs;
  let voicedRun = 0;
  for (const spec of vectorCase.frames) {
    for (let step = 0; step < spec.count; step++) {
      gate.frame({
        probability: spec.voiced ? 1 : 0,
        level: spec.level,
        durationMs: vector.frameMs,
        assistantAudible: spec.audible,
        at: index * vector.frameMs,
      });
      if (!spec.voiced) {
        gate.speechEnded();
        voicedRun = 0;
      } else {
        if (voicedRun === confirmAt) {
          gate.speechConfirmed();
        }
        voicedRun += 1;
      }
      index += 1;
    }
  }
  return events;
}

describe('TalkGate against the shared speech gate vector', () => {
  it.each(vector.cases)('$name', (vectorCase) => {
    expect(eventsOf(vectorCase)).toEqual(vectorCase.events);
  });
});
