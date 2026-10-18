import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  anchorOf,
  boundsOf,
  freeToken,
  verticalOf,
  captionOf,
  chooseDisplay,
  outputToken,
  glowSize,
  insetOf,
  SIDE_GAP,
  TRAY_GAP,
  type DisplayInfo,
} from '../src/overlay/overlay-placement.js';

const AREA = { x: 0, y: 0, width: 5120, height: 1400 };
const SIZE = { width: 500, height: 112 };

function display(id: number, x: number, primary = false): DisplayInfo {
  return {
    id,
    origin: { x, y: 0 },
    workArea: { x, y: 0, width: 1920, height: 1040 },
    scale: 1,
    primary,
  };
}

describe('overlay anchors', () => {
  it('puts compact below the top edge and every other mode on the bottom edge', () => {
    expect(anchorOf('compact', 'centre')).toBe('top-centre');
    expect(anchorOf('full', 'left')).toBe('bottom-left');
    expect(anchorOf('share', 'right')).toBe('bottom-right');
  });

  it('keeps the glow on the bottom edge, full width and centred, whatever the bar does', () => {
    expect(anchorFor('glow', 'top-centre')).toBe('bottom-centre');
    expect(anchorFor('glow', 'bottom-left')).toBe('bottom-centre');
    expect(anchorFor('pill', 'top-centre')).toBe('top-centre');
  });
});

describe('overlay insets', () => {
  it('lifts the full pill 72 above the work area', () => {
    expect(insetOf('pill', 'full')).toBe(72);
  });

  it('lifts the calm bars 8 from their edge', () => {
    expect(insetOf('pill', 'share')).toBe(8);
    expect(insetOf('pill', 'compact')).toBe(8);
  });

  it('stacks the tray 10 px beyond the pill', () => {
    expect(insetOf('tray', 'full')).toBe(72 + 64 + 10);
    expect(insetOf('tray', 'share')).toBe(8 + 44 + 10);
    expect(insetOf('tray', 'compact')).toBe(8 + 44 + 10);
    expect(insetOf('glow', 'full')).toBe(0);
  });
});

describe('overlay bounds', () => {
  it('centres, and keeps left and right 12 px from the edge of the work area', () => {
    expect(boundsOf('bottom-centre', SIZE, AREA, 48)).toEqual({
      x: 2310,
      y: 1400 - 112 - 48,
      width: 500,
      height: 112,
    });
    expect(boundsOf('bottom-left', SIZE, AREA, 0).x).toBe(12);
    expect(boundsOf('bottom-right', SIZE, AREA, 0).x).toBe(4620 - 12);
  });

  it('measures top anchors from the top of the work area', () => {
    expect(boundsOf('top-centre', SIZE, { ...AREA, y: 30 }, 0).y).toBe(30);
    expect(boundsOf('top-centre', SIZE, { ...AREA, y: 30 }, 38).y).toBe(68);
  });

  it('sizes the glow to the exact work-area width', () => {
    expect(glowSize(AREA)).toEqual({ width: 5120, height: 140 });
  });
});

describe('overlay caption', () => {
  it('writes the format the KWin script reads', () => {
    expect(
      captionOf({
        role: 'pill',
        anchor: 'bottom-centre',
        output: 'HDMI-A-1',
        focus: false,
        inset: 48,
      }),
    ).toBe('SmartEverything voice pill bottom-centre HDMI-A-1 0 48');
    expect(
      captionOf({ role: 'tray', anchor: 'top-left', output: 'active', focus: true, inset: 38 }),
    ).toBe('SmartEverything voice tray top-left active 1 38');
  });
});

describe('display choice', () => {
  const displays = [display(1, 0, true), display(2, 1920)];
  const none = { cursor: null, appWindow: null };

  it('follows the cursor for the active screen and falls back to the primary display', () => {
    expect(chooseDisplay('active', displays, { ...none, cursor: { x: 2000, y: 10 } })?.id).toBe(2);
    expect(chooseDisplay('active', displays, none)?.id).toBe(1);
  });

  it('takes the primary screen or the screen holding the app window', () => {
    expect(chooseDisplay('primary', displays, { ...none, cursor: { x: 2000, y: 10 } })?.id).toBe(1);
    const appWindow = { x: 2000, y: 100, width: 800, height: 600 };
    expect(chooseDisplay('app', displays, { ...none, appWindow })?.id).toBe(2);
    expect(chooseDisplay('app', displays, none)?.id).toBe(1);
  });

  it('has no display when none exist', () => {
    expect(chooseDisplay('active', [], none)).toBeNull();
  });
});

describe('overlay output token', () => {
  const second = display(2, 1920);

  it('leaves the active screen to the KWin script', () => {
    expect(outputToken('active', second)).toBe('active');
    expect(outputToken('primary', null)).toBe('active');
  });

  it('names any other choice by the origin of its display', () => {
    expect(outputToken('primary', second)).toBe('1920,0');
    expect(outputToken('app', second)).toBe('1920,0');
  });
});

describe('overlay bar away from the bottom edge', () => {
  it('moves a full bar to the top while an app is fullscreen and keeps bars that are already on top', () => {
    expect(anchorOf('full', 'centre', true)).toBe('top-centre');
    expect(anchorOf('share', 'left', true)).toBe('top-left');
    expect(anchorOf('full', 'centre', false)).toBe('bottom-centre');
  });

  it('hangs the pill 12 px under the top edge and the tray under the pill', () => {
    expect(insetOf('pill', 'full', verticalOf('top-centre'))).toBe(12);
    expect(insetOf('tray', 'full', 'top')).toBe(12 + 64 + 10);
    expect(insetOf('tray', 'share', 'top')).toBe(8 + 44 + 10);
    expect(insetOf('tray', 'full', 'bottom')).toBe(72 + 64 + 10);
  });

  it('names a dragged position as a token without spaces', () => {
    expect(freeToken({ cx: 0.5, cy: 0.12345 })).toBe('free@0.5000,0.1235');
  });
});

describe('overlay KWin script spacing', () => {
  const script = readFileSync(
    path.join(import.meta.dirname, '../src/overlay/kwin/overlay.js'),
    'utf8',
  );
  const constant = (name: string): number =>
    Number(new RegExp(`const ${name} = (\\d+);`).exec(script)?.[1]);

  it('uses the same side gap and tray gap as the app', () => {
    expect(constant('SIDE_GAP')).toBe(SIDE_GAP);
    expect(constant('TRAY_GAP')).toBe(TRAY_GAP);
  });
});
