import { describe, expect, it } from 'vitest';
import { keyboardLift } from './keyboard-lift';

const window = { pageY: 0, height: 914 };
const keyboard = 336;

describe('keyboardLift', () => {
  it('lifts a full-height viewport by the whole keyboard', () => {
    expect(keyboardLift(keyboard, { pageY: 0, height: 914 }, window)).toBe(336);
  });

  it('lifts a viewport above a bottom bar only by the part the keyboard covers', () => {
    expect(keyboardLift(keyboard, { pageY: 0, height: 801 }, window)).toBe(223);
  });

  it('follows the layout measured now, not the one from before the bottom bar went away', () => {
    const withBar = { pageY: 0, height: 801 };
    const withoutBar = { pageY: 0, height: 914 };
    expect(keyboardLift(keyboard, withBar, window)).toBe(223);
    expect(keyboardLift(keyboard, withoutBar, window)).toBe(336);
  });

  it('follows a window that changed size, such as a fold or a rotation', () => {
    const unfolded = { pageY: 0, height: 832 };
    expect(keyboardLift(keyboard, { pageY: 0, height: 832 }, unfolded)).toBe(336);
    expect(keyboardLift(280, { pageY: 0, height: 750 }, { pageY: 0, height: 750 })).toBe(280);
  });

  it('measures against the window root, wherever that root sits on the screen', () => {
    const splitWindow = { pageY: 400, height: 500 };
    expect(keyboardLift(200, { pageY: 400, height: 500 }, splitWindow)).toBe(200);
    expect(keyboardLift(200, { pageY: 450, height: 300 }, splitWindow)).toBe(50);
  });

  it('does not lift a viewport that ends above the keyboard', () => {
    expect(keyboardLift(keyboard, { pageY: 0, height: 400 }, window)).toBe(0);
  });

  it('lifts by the keyboard height of this frame, so a keyboard that grows or shrinks is followed', () => {
    const full = { pageY: 0, height: 914 };
    expect(keyboardLift(120, full, window)).toBe(120);
    expect(keyboardLift(420, full, window)).toBe(420);
    expect(keyboardLift(0, full, window)).toBe(0);
  });

  it('does not lift a viewport that cannot be measured', () => {
    expect(keyboardLift(keyboard, null, window)).toBe(0);
    expect(keyboardLift(keyboard, { pageY: 0, height: 914 }, null)).toBe(0);
  });
});
