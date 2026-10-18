import { describe, expect, it } from 'vitest';
import { trayKeyStep } from '../src/overlay/overlay-keys.js';

describe('tray keys', () => {
  it('closes on Escape whatever has focus', () => {
    expect(trayKeyStep('Escape', false, 5, 2)).toEqual({ kind: 'close' });
    expect(trayKeyStep('Escape', false, 0, -1)).toEqual({ kind: 'close' });
  });

  it('cycles Tab forward and Shift+Tab backward around the tray controls', () => {
    expect(trayKeyStep('Tab', false, 5, 1)).toEqual({ kind: 'focus', index: 2 });
    expect(trayKeyStep('Tab', false, 5, 4)).toEqual({ kind: 'focus', index: 0 });
    expect(trayKeyStep('Tab', true, 5, 0)).toEqual({ kind: 'focus', index: 4 });
    expect(trayKeyStep('Tab', true, 5, 3)).toEqual({ kind: 'focus', index: 2 });
  });

  it('starts at the first control going forward and at the last going backward', () => {
    expect(trayKeyStep('Tab', false, 5, -1)).toEqual({ kind: 'focus', index: 0 });
    expect(trayKeyStep('Tab', true, 5, -1)).toEqual({ kind: 'focus', index: 4 });
  });

  it('leaves every other key and an empty tray alone', () => {
    expect(trayKeyStep('a', false, 5, 1)).toEqual({ kind: 'none' });
    expect(trayKeyStep('Tab', false, 0, -1)).toEqual({ kind: 'none' });
  });
});
