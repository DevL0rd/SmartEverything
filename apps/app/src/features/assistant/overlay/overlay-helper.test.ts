import { describe, expect, it } from 'vitest';
import { helperText } from './overlay-helper';

describe('overlay helper text', () => {
  it('says nothing before the answer arrives', () => {
    expect(helperText(null, false)).toBe('');
  });

  it('names each state of the KWin helper', () => {
    expect(helperText({ kind: 'unused' }, false)).toBe('Starts with the first call');
    expect(helperText({ kind: 'ready' }, false)).toBe('Ready');
    expect(helperText({ kind: 'absent' }, false)).toBe(
      'Only used on KDE. On this desktop the app places the bar',
    );
  });

  it('says the bar cannot be placed on a Wayland desktop without KDE', () => {
    expect(helperText({ kind: 'absent' }, true)).toBe(
      'Placement needs KDE. On this desktop the system decides where the bar appears',
    );
  });

  it('shows why the helper did not load', () => {
    expect(helperText({ kind: 'failed', reason: 'KWin refused the overlay script' }, false)).toBe(
      'Not loaded: KWin refused the overlay script',
    );
  });
});
