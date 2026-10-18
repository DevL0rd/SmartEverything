import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_DEFINITION, isTimedTrigger, nextOccurrence } from '../src/automations';
import { AUTOMATION_SEQUENCE_DEFINITION } from '../src/automation-sequences';
import { automationV2Of, sequenceV2Of } from '../src/automation-v2-convert';
import { timedTriggerOf } from '../src/automation-v2-eval';
import { AUTOMATION_V2 } from '../src/automation-v2-schema';
import { definition, sequenceDefinition } from './support/automation-v2-arbitraries';
import { contextV1, contextV2, readingsOf, world } from './support/dry-world';
import { dryRunV1, dryRunV2 } from './support/dry-run';
import { automationOutlineV1, sequenceOutlineV1 } from './support/outline-v1';
import { automationOutlineV2 } from './support/outline-v2';

const RUNS = { numRuns: 400 };
const PLACE = { timeZone: 'Europe/Berlin', location: { latitude: 52.52, longitude: 13.405 } };
const INSTANTS = ['2026-01-05T07:30:00Z', '2026-06-21T22:59:00Z', '2026-10-25T00:30:00Z'].map(
  (instant) => new Date(instant),
);

describe('equivalence oracle over generated v1 automations', () => {
  it('converts every automation and keeps its summary, triggers and run settings', () => {
    fc.assert(
      fc.property(definition, (raw) => {
        const v1 = AUTOMATION_DEFINITION.parse(raw);
        const converted = automationV2Of(v1);
        expect(converted).toHaveProperty('automation');
        if (!('automation' in converted)) return;
        expect(AUTOMATION_V2.parse(converted.automation)).toStrictEqual(converted.automation);
        expect(automationOutlineV2(converted.automation)).toStrictEqual(automationOutlineV1(v1));
        expect(converted.origin).toStrictEqual(v1.origin);
      }),
      RUNS,
    );
  });

  it('arms the same timers at the same instants', () => {
    fc.assert(
      fc.property(definition, (raw) => {
        const v1 = AUTOMATION_DEFINITION.parse(raw);
        const converted = automationV2Of(v1);
        if (!('automation' in converted)) return;
        const before = v1.triggers.filter(isTimedTrigger);
        const after = converted.automation.when.flatMap((trigger) => timedTriggerOf(trigger) ?? []);
        expect(after).toHaveLength(before.length);
        for (const [index, trigger] of before.entries()) {
          const armed = after[index];
          for (const instant of INSTANTS)
            expect(armed && nextOccurrence(armed, instant, PLACE)).toStrictEqual(
              nextOccurrence(trigger, instant, PLACE),
            );
        }
      }),
      RUNS,
    );
  });

  it('emits the same commands for the same home state', () => {
    fc.assert(
      fc.property(definition, world, (raw, sample) => {
        const v1 = AUTOMATION_DEFINITION.parse(raw);
        const converted = automationV2Of(v1);
        if (!('automation' in converted)) return;
        expect(dryRunV2(converted.automation, contextV2(readingsOf(sample)))).toStrictEqual(
          dryRunV1(v1, contextV1(readingsOf(sample))),
        );
      }),
      { numRuns: 600 },
    );
  });

  it('converts every sequence into an automation without triggers', () => {
    fc.assert(
      fc.property(sequenceDefinition, (raw) => {
        const v1 = AUTOMATION_SEQUENCE_DEFINITION.parse(raw);
        const converted = sequenceV2Of(v1);
        expect(converted).toHaveProperty('automation');
        if (!('automation' in converted)) return;
        expect(converted.automation.when).toStrictEqual([]);
        expect(automationOutlineV2(converted.automation)).toStrictEqual(sequenceOutlineV1(v1));
      }),
      RUNS,
    );
  });
});
