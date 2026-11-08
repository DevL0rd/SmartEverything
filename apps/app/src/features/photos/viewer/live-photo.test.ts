import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../../../design/keyboard';
import { LivePhoto, clipLength, holdChangeOf, isSpace, liveBadgeText } from './live-photo';

function press(key: string, patch: Partial<KeyPress> = {}): KeyPress {
  return { key, command: false, alt: false, shift: false, typing: false, ...patch };
}

describe('live photo', () => {
  it('loads the component the stage shows', () => {
    expect(typeof LivePhoto).toBe('function');
  });

  it('plays while Space is held and stops on release', () => {
    expect(holdChangeOf('keydown', press(' '), false)).toBe('start');
    expect(holdChangeOf('keydown', press(' '), true)).toBeNull();
    expect(holdChangeOf('keyup', press(' '), false)).toBe('stop');
    expect(holdChangeOf('keydown', press(' ', { typing: true }), false)).toBeNull();
    expect(holdChangeOf('keydown', press('f'), false)).toBeNull();
  });

  it('names the hold on each platform and the clip length while it plays', () => {
    expect(liveBadgeText(false, 0, false)).toBe('LIVE · hold to play');
    expect(liveBadgeText(false, 0, true)).toBe('LIVE · press and hold');
    expect(liveBadgeText(true, 2.38, true)).toBe('PLAYING LIVE · 2.4 s');
    expect(liveBadgeText(true, 0, false)).toBe('PLAYING LIVE');
    expect(clipLength(3)).toBe('3.0 s');
  });

  it('plays and pauses on Space outside text fields and shortcuts', () => {
    expect(isSpace(press(' '))).toBe(true);
    expect(isSpace(press(' ', { typing: true }))).toBe(false);
    expect(isSpace(press(' ', { command: true }))).toBe(false);
    expect(isSpace(press(' ', { alt: true }))).toBe(false);
    expect(isSpace(press('k'))).toBe(false);
  });
});
