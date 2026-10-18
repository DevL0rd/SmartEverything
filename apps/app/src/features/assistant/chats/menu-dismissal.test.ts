import { describe, expect, it } from 'vitest';
import { returnsFocus } from './menu-dismissal';

describe('closing a composer menu', () => {
  it('returns focus to its trigger when the user dismisses an open menu', () => {
    expect(returnsFocus('user', true)).toBe(true);
  });

  it('leaves focus in the composer when the command or mention panel opens over it', () => {
    expect(returnsFocus('composer-panel', true)).toBe(false);
  });

  it('never moves focus when the menu was not open, as on a chat or session change reset', () => {
    expect(returnsFocus('user', false)).toBe(false);
    expect(returnsFocus('composer-panel', false)).toBe(false);
  });
});
