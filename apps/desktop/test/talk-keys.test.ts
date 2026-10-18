import { describe, expect, it } from 'vitest';
import { TALK_SHORTCUTS, talkShortcutStatus } from '../src/talk/talk-keys.js';

describe('walkie-talkie shortcut status', () => {
  it('labels each key from the accelerator that was registered', () => {
    expect(talkShortcutStatus(TALK_SHORTCUTS)).toEqual({
      backend: 'electron',
      hold: false,
      talk: 'Ctrl Alt Space',
      next: 'Ctrl Alt N',
      assistant: 'Ctrl Alt A',
      assistantMute: 'Ctrl Alt M',
      problem: null,
    });
  });

  it('follows a changed accelerator instead of a retyped label', () => {
    const [talk, next, assistant, assistantMute] = TALK_SHORTCUTS;
    if (
      talk === undefined ||
      next === undefined ||
      assistant === undefined ||
      assistantMute === undefined
    ) {
      throw new Error('four talk shortcuts expected');
    }
    const status = talkShortcutStatus([
      { ...talk, accelerator: 'Control+Shift+T' },
      next,
      assistant,
      assistantMute,
    ]);
    expect(status.talk).toBe('Ctrl Shift T');
    expect(status.next).toBe('Ctrl Alt N');
  });

  it('names the keys another app already holds', () => {
    const [talk] = TALK_SHORTCUTS;
    if (talk === undefined) throw new Error('a talk shortcut expected');
    expect(talkShortcutStatus([talk])).toMatchObject({
      talk: 'Ctrl Alt Space',
      next: null,
      assistant: null,
      assistantMute: null,
      problem: 'Another app already uses Ctrl Alt N and Ctrl Alt A and Ctrl Alt M',
    });
    expect(talkShortcutStatus([])).toMatchObject({
      talk: null,
      next: null,
      assistant: null,
      assistantMute: null,
      problem:
        'Another app already uses Ctrl Alt Space and Ctrl Alt N and Ctrl Alt A and Ctrl Alt M',
    });
  });
});
