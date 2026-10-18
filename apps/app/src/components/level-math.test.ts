import { describe, expect, it, vi } from 'vitest';
import {
  crossedTick,
  kelvinAfterKey,
  kelvinAt,
  kelvinShare,
  levelAfterAction,
  levelAfterKey,
  levelAt,
  levelLabel,
  LEVEL_SHAPE_RULES,
  percentString,
  thumbFormOf,
  thumbPlacement,
  THUMB_WIDTH,
  mixedBandOf,
  percentOf,
  swallowNextClick,
  valueAtPercent,
  whiteLabel,
  LEVEL_SLOP,
} from './level-math';

describe('level from drag position', () => {
  it('maps the pointer position across the surface to a level between 1 and 100', () => {
    expect(levelAt(150, 300)).toBe(50);
    expect(levelAt(-40, 300)).toBe(1);
    expect(levelAt(900, 300)).toBe(100);
  });

  it('keeps the 12 px slop the gesture needs before a drag begins', () => {
    expect(LEVEL_SLOP).toBe(12);
  });
});

describe('keyboard steps', () => {
  it('moves 5 % with the arrows and 25 % with Shift', () => {
    expect(levelAfterKey('ArrowRight', false, 60)).toBe(65);
    expect(levelAfterKey('ArrowLeft', false, 60)).toBe(55);
    expect(levelAfterKey('ArrowRight', true, 60)).toBe(85);
    expect(levelAfterKey('ArrowLeft', true, 60)).toBe(35);
  });

  it('jumps to 1 % on Home and 100 % on End and ignores other keys', () => {
    expect(levelAfterKey('Home', false, 60)).toBe(1);
    expect(levelAfterKey('End', false, 60)).toBe(100);
    expect(levelAfterKey('a', false, 60)).toBeNull();
  });

  it('never leaves 1 to 100', () => {
    expect(levelAfterKey('ArrowLeft', true, 10)).toBe(1);
    expect(levelAfterKey('ArrowRight', true, 90)).toBe(100);
  });

  it('moves 10 % for the screen reader increment and decrement', () => {
    expect(levelAfterAction('increment', 60)).toBe(70);
    expect(levelAfterAction('decrement', 5)).toBe(1);
  });

  it('steps the white temperature 100 K at a time inside the bar range', () => {
    expect(kelvinAfterKey('ArrowRight', false, 3000)).toBe(3100);
    expect(kelvinAfterKey('ArrowLeft', false, 2200)).toBe(2200);
    expect(kelvinAfterKey('End', false, 3000)).toBe(6500);
  });

  it('steps the white temperature 500 K with Shift and jumps to the range ends on Home and End', () => {
    expect(kelvinAfterKey('ArrowUp', true, 3000)).toBe(3500);
    expect(kelvinAfterKey('ArrowDown', true, 3000)).toBe(2500);
    expect(kelvinAfterKey('Home', false, 4000)).toBe(2200);
    expect(kelvinAfterKey('x', false, 4000)).toBeNull();
  });
});

describe('haptic buckets', () => {
  it('ticks once per 10 % crossed and not on the first reading', () => {
    expect(crossedTick(null, 40)).toBe(false);
    expect(crossedTick(41, 49)).toBe(false);
    expect(crossedTick(49, 51)).toBe(true);
    expect(crossedTick(51, 39)).toBe(true);
  });
});

describe('white temperature scale', () => {
  it('maps the position to a 100 K step between 2200 and 6500', () => {
    expect(kelvinAt(0, 200)).toBe(2200);
    expect(kelvinAt(200, 200)).toBe(6500);
    expect(kelvinAt(100, 200)).toBe(4400);
  });

  it('places a temperature as a share of the bar', () => {
    expect(kelvinShare(2200)).toBe(0);
    expect(kelvinShare(6500)).toBe(100);
    expect(kelvinShare(9000)).toBe(100);
  });
});

describe('mixed band', () => {
  const share = (value: number): number => value;

  it('spans the lowest to the highest lit member with a tick for each', () => {
    const band = mixedBandOf(
      {
        min: 40,
        max: 80,
        ticks: [
          { value: 40, colour: 'a' },
          { value: 80, colour: 'b' },
        ],
      },
      share,
    );
    expect(band.left).toBe(40);
    expect(band.width).toBe(40);
    expect(band.ticks).toEqual([
      { left: 40, colour: 'a' },
      { left: 80, colour: 'b' },
    ]);
  });

  it('keeps a visible band when every member has the same level', () => {
    expect(mixedBandOf({ min: 50, max: 50, ticks: [] }, share).width).toBe(1);
  });

  it('draws one tick for members that share a position and colour', () => {
    const band = mixedBandOf(
      {
        min: 12,
        max: 40,
        ticks: [
          { value: 12, colour: 'hsl(32, 100%, 72%)' },
          { value: 12, colour: 'hsl(32, 100%, 72%)' },
          { value: 12, colour: 'hsl(200, 100%, 72%)' },
          { value: 40, colour: 'hsl(32, 100%, 72%)' },
        ],
      },
      share,
    );
    const keys = band.ticks.map((tick) => `${String(tick.left)}-${tick.colour}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(band.ticks).toEqual([
      { left: 12, colour: 'hsl(32, 100%, 72%)' },
      { left: 12, colour: 'hsl(200, 100%, 72%)' },
      { left: 40, colour: 'hsl(32, 100%, 72%)' },
    ]);
  });

  it('drops the ticks beyond eight members', () => {
    const ticks = Array.from({ length: 9 }, (_, index) => ({ value: index, colour: 'x' }));
    expect(mixedBandOf({ min: 0, max: 8, ticks }, share).ticks).toEqual([]);
  });
});

describe('value labels', () => {
  it('reads Off, one level or a range', () => {
    expect(levelLabel(null, undefined)).toBe('Off');
    expect(levelLabel(60, undefined)).toBe('60 %');
    expect(levelLabel(60, { min: 40, max: 80, ticks: [] })).toBe('40–80 %');
    expect(levelLabel(60, { min: 60, max: 60, ticks: [] })).toBe('60 %');
  });

  it('reads the white temperature or a range of it', () => {
    expect(whiteLabel(3000, undefined)).toBe('3000 K');
    expect(whiteLabel(3000, { min: 2700, max: 4000, ticks: [] })).toBe('2700–4000 K');
    expect(whiteLabel(null, undefined)).toBe('No white light');
  });
});

describe('capability range', () => {
  it('converts between a capability value and a percentage', () => {
    expect(percentOf(127, 0, 254)).toBe(50);
    expect(valueAtPercent(50, 0, 254, 1)).toBe(127);
    expect(valueAtPercent(100, 1, 9, 2)).toBe(9);
  });
});

describe('click after a drag', () => {
  function clickOn(target: EventTarget): { readonly stop: number; readonly prevent: number } {
    const event = new Event('click', { cancelable: true });
    const stop = vi.spyOn(event, 'stopPropagation');
    const prevent = vi.spyOn(event, 'preventDefault');
    target.dispatchEvent(event);
    return { stop: stop.mock.calls.length, prevent: prevent.mock.calls.length };
  }

  it('swallows the click that follows a drag, once', () => {
    const target = new EventTarget();
    swallowNextClick(target);
    expect(clickOn(target)).toEqual({ stop: 1, prevent: 1 });
    expect(clickOn(target)).toEqual({ stop: 0, prevent: 0 });
  });

  it('lets the next press through when no click followed the drag', () => {
    const target = new EventTarget();
    swallowNextClick(target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(clickOn(target)).toEqual({ stop: 0, prevent: 0 });
  });
});

describe('thumb form', () => {
  const on = { off: false, disabled: false, dragging: false } as const;

  it('shows a full thumb on bars and slim bars, and only a notch on rows and chips at rest', () => {
    expect(thumbFormOf({ ...on, policy: 'full' })).toBe('bar');
    expect(thumbFormOf({ ...on, policy: 'notch' })).toBe('notch');
  });

  it('grows the row notch to the full thumb while dragging', () => {
    expect(thumbFormOf({ ...on, policy: 'notch', dragging: true })).toBe('bar');
  });

  it('keeps a dashed resting thumb on an off bar but none on an off row', () => {
    expect(thumbFormOf({ ...on, policy: 'full', off: true })).toBe('dashed');
    expect(thumbFormOf({ ...on, policy: 'notch', off: true })).toBe('none');
  });

  it('draws no thumb when the control is disabled, however it is shown', () => {
    expect(thumbFormOf({ policy: 'full', off: false, disabled: true, dragging: true })).toBe(
      'none',
    );
  });

  it('assigns the full thumb to bar and slim and the notch to every shape that carries text', () => {
    expect(LEVEL_SHAPE_RULES.bar.thumb).toBe('full');
    expect(LEVEL_SHAPE_RULES.slim.thumb).toBe('full');
    for (const shape of ['row', 'rowOpen', 'chip', 'fill'] as const) {
      expect(LEVEL_SHAPE_RULES[shape].thumb).toBe('notch');
    }
  });

  it('jumps to the tapped level only on bar and slim, so rows and chips keep tap for their own action', () => {
    expect(LEVEL_SHAPE_RULES.bar.jumpsOnTap).toBe(true);
    expect(LEVEL_SHAPE_RULES.slim.jumpsOnTap).toBe(true);
    for (const shape of ['row', 'rowOpen', 'chip', 'fill'] as const) {
      expect(LEVEL_SHAPE_RULES[shape].jumpsOnTap).toBe(false);
    }
  });
});

describe('thumb placement', () => {
  it('keeps the thumb fully inside the track at 1 %, 50 % and 100 %', () => {
    const width = 300;
    for (const percent of [0, 1, 50, 100]) {
      const placed = thumbPlacement(percent, THUMB_WIDTH.bar);
      const left = (parseFloat(placed.left) / 100) * width + placed.marginLeft;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + THUMB_WIDTH.bar).toBeLessThanOrEqual(width);
    }
  });

  it('centres the thumb on the level at the middle of the track', () => {
    expect(thumbPlacement(50, 8)).toEqual({ left: '50%', marginLeft: -4 });
  });

  it('clamps out-of-range levels to the track ends', () => {
    expect(thumbPlacement(140, 8)).toEqual({ left: '100%', marginLeft: -8 });
    expect(thumbPlacement(-5, 8)).toEqual({ left: '0%', marginLeft: -0 });
  });

  it('rejects a level that is not a number', () => {
    expect(() => percentString(Number.NaN)).toThrow(RangeError);
  });
});
