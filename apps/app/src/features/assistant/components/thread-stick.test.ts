import { describe, expect, it } from 'vitest';
import { STICK_PX, finishedStreaming, shouldFollowContent, stuckAfterScroll } from './thread-stick';

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

describe('finishedStreaming', () => {
  it('is true only when the same message stops streaming', () => {
    const live = { key: 'a', streaming: true };
    expect(finishedStreaming(live, { key: 'a', streaming: false })).toBe(true);
    expect(finishedStreaming(live, { key: 'b', streaming: false })).toBe(false);
    expect(finishedStreaming(live, live)).toBe(false);
    expect(finishedStreaming(null, live)).toBe(false);
  });
});
