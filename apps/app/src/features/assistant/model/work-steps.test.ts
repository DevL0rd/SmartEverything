import { describe, expect, it } from 'vitest';
import { CHAT_ACTIVITY_STATES } from '@smarteverything/domain';
import { statusIsLive, summaryOfSteps } from './work-steps';

describe('statusIsLive', () => {
  it('shows the status box before any turn data arrives', () => {
    expect(statusIsLive(null)).toBe(true);
  });

  it.each(CHAT_ACTIVITY_STATES)('shows the status box in the %s state', (state) => {
    expect(statusIsLive(state)).toBe(true);
  });

  it('summarises a live turn with no steps while the reply streams', () => {
    expect(summaryOfSteps([], statusIsLive('replying'), false)).toEqual({
      tone: 'live',
      title: 'Working',
      note: '',
    });
  });
});
