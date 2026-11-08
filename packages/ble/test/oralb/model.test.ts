import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ORALB_IO9_MODEL as BRUSH } from '../../src/oralb/model';

describe('Oral-B iO9 model', () => {
  it('is a valid spec whose channels and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(BRUSH).success).toBe(true);
    expect(specSignalProblems(BRUSH)).toEqual([]);
  });

  it('frames the head with the handle collar while brushing', () => {
    expect(BRUSH.shots?.find((shot) => shot.id === 'brush')).toMatchObject({
      focus: 'neck',
      zoom: 1.45,
    });
  });

  it('gives the handle a satin sheen', () => {
    expect(BRUSH.materials['body']?.sheen).toBe(0.35);
  });
});
