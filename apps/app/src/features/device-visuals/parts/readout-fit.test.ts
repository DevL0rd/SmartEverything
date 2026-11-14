import { describe, expect, it } from 'vitest';
import { fitScale } from './readout-fit';

const SCREEN = { width: 40, height: 30 };

describe('fitScale', () => {
  it('keeps a reading at full size while it fits the screen', () => {
    expect(fitScale(SCREEN, { width: 30, height: 20 })).toBe(1);
  });

  it('shrinks a reading that is wider than the screen to the screen width', () => {
    expect(fitScale(SCREEN, { width: 80, height: 20 })).toBe(0.5);
  });

  it('shrinks by the tighter of the two sides', () => {
    expect(fitScale(SCREEN, { width: 60, height: 60 })).toBe(0.5);
  });

  it('leaves the scale alone until the reading has been measured', () => {
    expect(fitScale(SCREEN, null)).toBe(1);
    expect(fitScale(SCREEN, { width: 0, height: 0 })).toBe(1);
  });
});
