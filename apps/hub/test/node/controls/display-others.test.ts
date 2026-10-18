import { describe, expect, it } from 'vitest';
import {
  changeArguments as wlrArguments,
  parseWlr,
  restoreArguments as wlrRestore,
  toDisplayOutputs as wlrOutputs,
  WlrDisplays,
} from '../../../src/node/controls/linux/wlr-displays';
import {
  changeArguments as xrandrArguments,
  parseXrandr,
  restoreArguments as xrandrRestore,
  toDisplayOutputs as xrandrOutputs,
  XrandrDisplays,
} from '../../../src/node/controls/linux/xrandr-displays';
import { recorder } from './support';

const WLR = JSON.stringify([
  {
    name: 'DP-1',
    enabled: true,
    modes: [
      { width: 1920, height: 1080, refresh: 60.0, preferred: true, current: true },
      { width: 1280, height: 720, refresh: 59.94, preferred: false, current: false },
    ],
    position: { x: 0, y: 0 },
    transform: 'normal',
    scale: 1.5,
  },
  {
    name: 'eDP-1',
    enabled: false,
    modes: [{ width: 2560, height: 1600, refresh: 60, preferred: true, current: false }],
    position: { x: 1920, y: 0 },
    transform: 'flipped-90',
    scale: 1,
  },
]);

const XRANDR = `Screen 0: minimum 16 x 16, current 4480 x 1440, maximum 32767 x 32767
DP-3 connected primary 2560x1440+0+0 left (normal left inverted right x axis y axis) 597mm x 336mm
   2560x1440    164.96*+ 143.97   59.95  
   1920x1080    60.00  
HDMI-1 connected (normal left inverted right x axis y axis)
   1920x1080    60.00 +
DP-4 disconnected (normal left inverted right x axis y axis)
`;

describe('wlr-randr backend', () => {
  const raws = parseWlr(WLR);

  it('maps outputs, current mode, scale and transform', () => {
    const [on, off] = wlrOutputs(raws);
    expect(on).toMatchObject({
      id: 'DP-1',
      enabled: true,
      scalePercent: 150,
      mode: { width: 1920, height: 1080, refreshHz: 60, preferred: true },
      primary: false,
    });
    expect(off).toMatchObject({ enabled: false, mode: null, rotation: 90, builtIn: true });
  });

  it('builds commands and refuses what wlroots cannot do', () => {
    expect(wlrArguments({ kind: 'enabled', output: 'DP-1', enabled: false })).toEqual([
      '--output',
      'DP-1',
      '--off',
    ]);
    expect(wlrArguments({ kind: 'scale', output: 'DP-1', percent: 125 })).toEqual([
      '--output',
      'DP-1',
      '--scale',
      '1.25',
    ]);
    expect(wlrArguments({ kind: 'rotation', output: 'DP-1', degrees: 0 })).toEqual([
      '--output',
      'DP-1',
      '--transform',
      'normal',
    ]);
    expect(() => wlrArguments({ kind: 'primary', output: 'DP-1' })).toThrow(
      /cannot change primary/,
    );
  });

  it('restores every output as it was', () => {
    expect(wlrRestore(raws)).toEqual([
      '--output',
      'DP-1',
      '--on',
      '--mode',
      '1920x1080@60',
      '--pos',
      '0,0',
      '--transform',
      'normal',
      '--scale',
      '1.5',
      '--output',
      'eDP-1',
      '--off',
    ]);
  });

  it('reads through --json', async () => {
    const system = recorder({ 'wlr-randr': WLR });
    await expect(new WlrDisplays(system.run).read()).resolves.toHaveLength(2);
    expect(system.calls).toEqual(['wlr-randr --json']);
  });

  it('names output it cannot read', () => {
    expect(() => parseWlr('x')).toThrow(/wlr-randr returned text that is not JSON/);
  });
});

describe('xrandr backend', () => {
  const raws = parseXrandr(XRANDR);

  it('reads connected outputs, modes, current mode, rotation and primary', () => {
    expect(raws.map((raw) => raw.name)).toEqual(['DP-3', 'HDMI-1']);
    const [on, off] = xrandrOutputs(raws);
    expect(on).toMatchObject({
      primary: true,
      rotation: 90,
      enabled: true,
      mode: { width: 2560, height: 1440, refreshHz: 164.96, preferred: true },
    });
    expect(on?.modes).toHaveLength(4);
    expect(off).toMatchObject({ enabled: false, mode: null });
  });

  it('builds commands and refuses scale, hdr and brightness', () => {
    const mode = { width: 1920, height: 1080, refreshHz: 60, preferred: false };
    expect(xrandrArguments({ kind: 'mode', output: 'DP-3', mode })).toEqual([
      '--output',
      'DP-3',
      '--mode',
      '1920x1080',
      '--rate',
      '60',
    ]);
    expect(xrandrArguments({ kind: 'enabled', output: 'DP-3', enabled: true })).toEqual([
      '--output',
      'DP-3',
      '--auto',
    ]);
    expect(xrandrArguments({ kind: 'rotation', output: 'DP-3', degrees: 180 })).toEqual([
      '--output',
      'DP-3',
      '--rotate',
      'inverted',
    ]);
    expect(xrandrArguments({ kind: 'position', output: 'DP-3', x: 10, y: -5 })).toEqual([
      '--output',
      'DP-3',
      '--pos',
      '10x-5',
    ]);
    expect(xrandrArguments({ kind: 'primary', output: 'DP-3' })).toEqual([
      '--output',
      'DP-3',
      '--primary',
    ]);
    expect(() => xrandrArguments({ kind: 'scale', output: 'DP-3', percent: 150 })).toThrow(
      /cannot change scale/,
    );
  });

  it('restores outputs including the primary flag and the off outputs', () => {
    expect(xrandrRestore(raws)).toEqual([
      '--output',
      'DP-3',
      '--mode',
      '2560x1440',
      '--rate',
      '164.96',
      '--pos',
      '0x0',
      '--rotate',
      'left',
      '--primary',
      '--output',
      'HDMI-1',
      '--off',
    ]);
  });

  it('queries with --query', async () => {
    const system = recorder({ xrandr: XRANDR });
    await new XrandrDisplays(system.run).capture();
    expect(system.calls).toEqual(['xrandr --query']);
  });
});
