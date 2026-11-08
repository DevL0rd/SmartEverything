import { MODEL_SPEC, identityScore } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '@smarteverything/models';
import { entryFromSpec, admitEntry } from '../../src/models/contributions';
import {
  AIBI_MODEL_MATCH,
  AIBI_MODELS,
  AIBI_POCKET_MODEL as AIBI,
} from '../../src/plugins/builtin/aibi/models';

function enumTable(id: string): Readonly<Record<string, unknown>> {
  const found = AIBI.channels?.find((entry) => entry.id === id);
  if (found?.map.type !== 'enum') throw new Error(`${id} is not an enum channel`);
  return found.map.table;
}

describe('the AIBI Pocket model', () => {
  it('parses strictly and passes every authoring check', () => {
    expect(AIBI_MODELS).toStrictEqual([AIBI]);
    expect(MODEL_SPEC.safeParse(AIBI).success).toBe(true);
    expect(checkAuthoring(AIBI).problems).toStrictEqual([]);
  });

  it('keeps the published 48.8 by 66.7 by 35.5 mm size', () => {
    expect(AIBI.footprint).toStrictEqual({ width: 0.0488, depth: 0.0355, height: 0.0667 });
  });

  it('shows every robot mood on the eyes and the head', () => {
    const moods = ['awake', 'listening', 'speaking', 'worried', 'asleep'];
    expect(Object.keys(enumTable('eyeLeftTint')).sort()).toStrictEqual([...moods].sort());
    expect(Object.keys(enumTable('eyeRightLid')).sort()).toStrictEqual([...moods].sort());
    expect(Object.keys(enumTable('headNod')).sort()).toStrictEqual([...moods].sort());
    expect(enumTable('eyeLeftLid')['asleep']).toBeLessThan(0.5);
  });

  it('frames the face while it talks or listens and is still otherwise', () => {
    const shot = AIBI.shots?.[0];
    expect(shot?.focus).toBe('face');
    const phases = shot?.when.anyOf.map((group) => group.allOf[1]?.value);
    expect(phases).toStrictEqual(['speaking', 'listening']);
    expect(AIBI.states?.['off']).toStrictEqual({ online: false });
  });

  it('is admitted for the live AIBI robot row', () => {
    const entry = entryFromSpec(AIBI, { match: AIBI_MODEL_MATCH, brands: ['AIBI'] });
    expect('admitted' in admitEntry('plugin:aibi', entry)).toBe(true);
    const subject = { brand: 'AIBI', model: 'AIBI robot', family: 'robot' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
  });
});
