import { describe, expect, it } from 'vitest';
import { STICK_PX, pinTransition, shouldFollowContent, stuckAfterScroll } from './thread-stick';

const AT_END = { offset: 0, contentHeight: 1000 };

describe('stuckAfterScroll', () => {
  it('sticks within the threshold and releases beyond it', () => {
    expect(stuckAfterScroll(false, AT_END, { offset: STICK_PX, contentHeight: 1000 })).toBe(true);
    expect(stuckAfterScroll(true, AT_END, { offset: STICK_PX + 1, contentHeight: 1000 })).toBe(
      false,
    );
  });

  it('keeps the previous state when the offset moved because content resized', () => {
    expect(stuckAfterScroll(true, AT_END, { offset: 400, contentHeight: 1400 })).toBe(true);
    expect(stuckAfterScroll(false, AT_END, { offset: 0, contentHeight: 1400 })).toBe(false);
  });

  it('decides from the offset on the first sample', () => {
    expect(stuckAfterScroll(true, null, { offset: 500, contentHeight: 1000 })).toBe(false);
  });
});

describe('shouldFollowContent', () => {
  it('stays pinned across repeated content growth while stuck', () => {
    expect(shouldFollowContent(true, 1000, 1200)).toBe(true);
    expect(shouldFollowContent(true, 1200, 1500)).toBe(true);
  });

  it('never moves a reader who scrolled up', () => {
    expect(shouldFollowContent(false, 1000, 1200)).toBe(false);
  });

  it('does nothing when the height is unchanged', () => {
    expect(shouldFollowContent(true, 1000, 1000)).toBe(false);
  });
});

describe('pinTransition', () => {
  const coordinator = { key: 'coordinator', at: '2026-11-06T10:00:00.000Z', streaming: true, reply: true };
  const helper = { key: 'helper', at: '2026-11-06T10:01:00.000Z', streaming: false, reply: true };

  it('follows a newer helper reply when the Coordinator held the pin', () => {
    expect(pinTransition(coordinator, helper)).toBe('follow');
    expect(pinTransition(null, helper)).toBe('keep');
  });

  it('releases the pin without following an older row or a settled update', () => {
    expect(pinTransition(coordinator, { ...helper, at: '2026-11-06T09:59:00.000Z' })).toBe('release');
    expect(pinTransition(coordinator, { ...coordinator, streaming: false })).toBe('release');
    expect(pinTransition(coordinator, coordinator)).toBe('keep');
  });
});

describe('resize reflow', () => {
  it('keeps a reader away from the bottom when a resize reflows the content', () => {
    const reading = { offset: 900, contentHeight: 3000 };
    const reflowed = { offset: 1100, contentHeight: 3600 };
    const stuck = stuckAfterScroll(false, reading, reflowed);
    expect(stuck).toBe(false);
    expect(shouldFollowContent(stuck, 3000, 3600)).toBe(false);
  });

  it('keeps a reader pinned at the bottom when a resize reflows the content', () => {
    const stuck = stuckAfterScroll(true, AT_END, { offset: 0, contentHeight: 1500 });
    expect(shouldFollowContent(stuck, 1000, 1500)).toBe(true);
  });
});
