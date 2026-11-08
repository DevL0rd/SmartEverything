import { describe, expect, it } from 'vitest';
import {
  advance,
  photoLine,
  playableTotal,
  playerKeyOf,
  positionText,
  segmentFillOf,
  segmentsFit,
  START,
  stepTo,
  toggle,
} from './player-model';

describe('memory player steps', () => {
  it('advances one photo at a time and pauses on the last one', () => {
    const second = advance(START, 3);
    expect(second).toEqual({ index: 1, previous: 0, paused: false, ended: false });
    const last = advance(second, 3);
    expect(last.index).toBe(2);
    expect(advance(last, 3)).toEqual({ index: 2, previous: 1, paused: true, ended: true });
  });

  it('keeps manual steps inside the memory', () => {
    expect(stepTo(START, -1, 5)).toBe(START);
    expect(stepTo(START, 9, 5).index).toBe(4);
    expect(stepTo({ ...START, paused: true }, 1, 5).paused).toBe(true);
  });

  it('pauses, resumes and starts over after the end', () => {
    expect(toggle(START).paused).toBe(true);
    expect(toggle(toggle(START)).paused).toBe(false);
    expect(toggle({ index: 4, previous: 3, paused: true, ended: true })).toEqual(START);
  });

  it('counts the photos still to load until the last page arrives', () => {
    expect(playableTotal(40, 20, true)).toBe(40);
    expect(playableTotal(40, 38, false)).toBe(38);
  });
});

describe('memory player keys and progress', () => {
  it('maps Space and the arrows', () => {
    expect(playerKeyOf(' ')).toBe('toggle');
    expect(playerKeyOf('ArrowRight')).toBe('next');
    expect(playerKeyOf('ArrowLeft')).toBe('previous');
    expect(playerKeyOf('a')).toBeNull();
  });

  it('draws one segment per photo while each stays wide enough to see', () => {
    expect(segmentsFit(14, 1560)).toBe(true);
    expect(segmentsFit(905, 1560)).toBe(false);
    expect(segmentsFit(0, 1560)).toBe(false);
    expect([0, 1, 2].map((segment) => segmentFillOf(segment, 1))).toEqual([
      'done',
      'current',
      'left',
    ]);
  });

  it('says where the slideshow is', () => {
    expect(positionText(5, 14)).toBe('6 of 14');
  });

  it('names the photo time, and its day only when the memory spans several days', () => {
    const when = { day: '5 November 2026', time: '16:20' };
    expect(photoLine(when, true, 5, 14)).toBe('16:20 · 6 of 14');
    expect(photoLine(when, false, 5, 14)).toBe('5 November 2026, 16:20 · 6 of 14');
    expect(photoLine(null, true, 0, 3)).toBe('1 of 3');
  });
});
