import { describe, expect, it } from 'vitest';
import { chromeBoxesOf, chromeInsetsOf } from './chrome-boxes';

describe('stage chrome boxes', () => {
  it('places each shown piece in stage coordinates from its bar and skips unmeasured ones', () => {
    const measured = {
      bars: {
        top: { x: 12, y: 12, width: 356, height: 48 },
        bottom: { x: 12, y: 225, width: 356, height: 48 },
      },
      pieces: {
        switcher: { x: 134, y: 0, width: 222, height: 48 },
        tools: { x: 260, y: 0, width: 96, height: 48 },
        notes: { x: 0, y: 4, width: 140, height: 40 },
      },
    };
    expect(chromeBoxesOf(measured, ['switcher', 'tools', 'pill'])).toEqual([
      { x: 146, y: 12, w: 222, h: 48 },
      { x: 272, y: 225, w: 96, h: 48 },
    ]);
  });
});

describe('floor switcher box', () => {
  it('measures the floor switcher in the top bar', () => {
    const measured = {
      bars: { top: { x: 12, y: 12, width: 356, height: 48 } },
      pieces: { floors: { x: 0, y: 0, width: 120, height: 44 } },
    };
    expect(chromeBoxesOf(measured, ['floors'])).toEqual([{ x: 12, y: 12, w: 120, h: 44 }]);
  });
});

describe('chrome insets', () => {
  it('reach to the lowest top bar piece and up to the highest bottom bar piece', () => {
    const measured = {
      origin: { x: 0, y: 0, width: 380, height: 300 },
      bars: {
        top: { x: 12, y: 12, width: 356, height: 104 },
        bottom: { x: 12, y: 232, width: 356, height: 56 },
      },
      pieces: {
        switcher: { x: 134, y: 0, width: 222, height: 48 },
        floors: { x: 0, y: 56, width: 120, height: 44 },
        pill: { x: 0, y: 12, width: 160, height: 44 },
        tools: { x: 260, y: 0, width: 96, height: 56 },
      },
    };
    expect(chromeInsetsOf(measured, ['switcher', 'floors', 'pill', 'tools'])).toEqual({
      top: 112,
      bottom: 68,
    });
    expect(chromeInsetsOf(measured, ['switcher'])).toEqual({ top: 60, bottom: 0 });
  });

  it('are zero until the chrome frame is measured', () => {
    expect(chromeInsetsOf({ bars: {}, pieces: {} }, ['switcher'])).toEqual({ top: 0, bottom: 0 });
  });
});

describe('chrome frame origin', () => {
  it('shifts every box by the frame that centres the chrome in the page content width', () => {
    const measured = {
      origin: { x: 180, y: 0, width: 1440, height: 456 },
      bars: { top: { x: 12, y: 12, width: 1416, height: 48 } },
      pieces: { switcher: { x: 1280, y: 0, width: 136, height: 48 } },
    };
    expect(chromeBoxesOf(measured, ['switcher'])).toEqual([{ x: 1472, y: 12, w: 136, h: 48 }]);
  });
});
