import { describe, expect, it } from 'vitest';
import { summaryOfSteps } from './work-steps';

describe('summaryOfSteps', () => {
  it('summarises a live turn with no steps while the reply streams', () => {
    expect(summaryOfSteps([], true, false)).toEqual({
      tone: 'live',
      title: 'Working',
      note: '',
    });
  });
});
