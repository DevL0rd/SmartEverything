import { describe, expect, it } from 'vitest';
import {
  announcementOf,
  isAllowChord,
  isLongDetail,
  newRequestIds,
  pagerLabel,
  requestCopy,
  requestNav,
  resolveIndex,
  settleCursor,
} from './needs-you-model';

const IDS = ['a', 'b', 'c'];

describe('resolveIndex', () => {
  it('keeps the request the person is on', () => {
    expect(resolveIndex(IDS, 'b', 0)).toBe(1);
  });

  it('starts on the first request when nothing was chosen', () => {
    expect(resolveIndex(IDS, null, 0)).toBe(0);
  });

  it('moves to the neighbour that took its place when the active request is answered', () => {
    expect(resolveIndex(['a', 'c'], 'b', 1)).toBe(1);
  });

  it('falls back to the last request when the last one is answered', () => {
    expect(resolveIndex(['a', 'b'], 'c', 2)).toBe(1);
  });

  it('settles on zero when no request is left', () => {
    expect(resolveIndex([], 'a', 0)).toBe(0);
  });
});

describe('settleCursor', () => {
  it('lands on the neighbour of the answered request after earlier ones closed', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const onC = settleCursor(ids, { id: 'c', index: 2 });
    const afterClose = settleCursor(['c', 'd', 'e'], onC);
    expect(afterClose).toEqual({ id: 'c', index: 0 });
    expect(settleCursor(['d', 'e'], afterClose)).toEqual({ id: 'd', index: 0 });
  });

  it('has no active request when none is left', () => {
    expect(settleCursor([], { id: 'a', index: 0 })).toEqual({ id: null, index: 0 });
  });
});

describe('requestNav', () => {
  it('has no previous request at the start and a next one', () => {
    expect(requestNav(IDS, 0)).toEqual({ index: 0, count: 3, previous: null, next: 'b' });
  });

  it('has a previous request in the middle and a next one', () => {
    expect(requestNav(IDS, 1)).toEqual({ index: 1, count: 3, previous: 'a', next: 'c' });
  });

  it('has no next request at the end', () => {
    expect(requestNav(IDS, 2).next).toBeNull();
  });

  it('labels the position one-based', () => {
    expect(pagerLabel(requestNav(IDS, 1))).toBe('2 of 3');
  });
});

describe('newRequestIds', () => {
  it('lists only requests not announced before, in order', () => {
    expect(newRequestIds(new Set(['a']), IDS)).toEqual(['b', 'c']);
  });
});

describe('isLongDetail', () => {
  it('keeps a short one-line command whole', () => {
    expect(isLongDetail('rm -rf build/')).toBe(false);
  });

  it('offers Show all for a command over three lines', () => {
    expect(isLongDetail('a\nb\nc\nd')).toBe(true);
  });

  it('offers Show all for a very long single line', () => {
    expect(isLongDetail('x'.repeat(201))).toBe(true);
  });
});

describe('request copy', () => {
  it('names the machine and the tool for an approval', () => {
    expect(requestCopy('permission', 'Workstation', 'shell')).toEqual({
      title: 'Workstation wants to use shell',
      needs: 'Workstation needs your approval to use shell',
    });
  });

  it('announces how to reach the dock with a keyboard or by touch', () => {
    expect(announcementOf('Workstation has a question for you', false)).toBe(
      'Workstation has a question for you. Alt+R to review.',
    );
    expect(announcementOf('Workstation has a question for you', true)).toBe(
      'Workstation has a question for you. Swipe to the approval card.',
    );
  });
});

describe('isAllowChord', () => {
  const chord = { key: 'Enter', command: true, typing: false };

  it('allows once on the command chord', () => {
    expect(isAllowChord(chord, false)).toBe(true);
  });

  it('never allows while the person is typing in a field', () => {
    expect(isAllowChord({ ...chord, typing: true }, false)).toBe(false);
  });

  it('does nothing while the answer is being sent or without the command key', () => {
    expect(isAllowChord(chord, true)).toBe(false);
    expect(isAllowChord({ ...chord, command: false }, false)).toBe(false);
    expect(isAllowChord({ ...chord, key: 'a' }, false)).toBe(false);
  });
});
