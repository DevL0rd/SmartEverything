import { describe, expect, it } from 'vitest';
import { planDisplayChange } from '../../../src/node/controls/linux/display-plan';
import {
  changeArguments,
  KscreenDisplays,
  parseKscreen,
  restoreArguments,
  toDisplayOutputs,
} from '../../../src/node/controls/linux/kscreen-displays';
import { kscreen, ONE_SCREEN_ON, TWO_SCREENS } from './kscreen-fixtures';
import { recorder } from './support';

const raws = parseKscreen(TWO_SCREENS);
const outputs = toDisplayOutputs(raws);

describe('kscreen-doctor JSON to display outputs', () => {
  it('maps modes, scale, position, primary and capability flags', () => {
    expect(outputs[0]).toMatchObject({
      id: 'DP-3',
      builtIn: false,
      enabled: true,
      primary: true,
      scalePercent: 125,
      rotation: 0,
      brightness: 80,
      hdr: { supported: true, enabled: false },
      vrr: 'automatic',
      mirrorOf: null,
      mode: { width: 2560, height: 1440, refreshHz: 165, preferred: true },
    });
    expect(outputs[0]?.modes).toHaveLength(3);
    expect(outputs[1]).toMatchObject({
      id: 'eDP-2',
      builtIn: true,
      primary: false,
      hdr: { supported: false },
      vrr: null,
    });
  });

  it('shows a disabled output without a current mode and maps the rotation flags', () => {
    const [off, turned] = toDisplayOutputs(
      parseKscreen(
        kscreen([
          { name: 'HDMI-A-1', enabled: false },
          { name: 'DP-1', enabled: true, rotation: 2, replicationSource: 1 },
        ]),
      ),
    );
    expect(off).toMatchObject({ enabled: false, mode: null, primary: false });
    expect(turned).toMatchObject({ rotation: 90, mirrorOf: 'HDMI-A-1' });
  });

  it('ignores outputs that are not connected and names bad output', () => {
    const first = raws[0];
    const unplugged = JSON.stringify({ outputs: [{ ...first, connected: false }, first] });
    expect(parseKscreen(unplugged)).toHaveLength(1);
    expect(() => parseKscreen('nope')).toThrow(/kscreen-doctor returned text that is not JSON/);
    expect(() => parseKscreen('{"outputs":[{}]}')).toThrow(/shape we do not know/);
  });
});

describe('display changes become kscreen-doctor arguments', () => {
  function args(change: Parameters<typeof planDisplayChange>[0]): string[] {
    return planDisplayChange(change, outputs).flatMap((step) => [...changeArguments(step, raws)]);
  }

  it('enables, disables and sets scale, rotation and hdr', () => {
    expect(args({ action: 'disable', output: 'eDP-2' })).toEqual(['output.eDP-2.disable']);
    expect(args({ action: 'enable', output: 'edp-2' })).toEqual(['output.eDP-2.enable']);
    expect(args({ action: 'scale', output: 'DP-3', percent: 150 })).toEqual([
      'output.DP-3.scale.1.5',
    ]);
    expect(args({ action: 'rotation', output: 'DP-3', degrees: 270 })).toEqual([
      'output.DP-3.rotation.right',
    ]);
    expect(args({ action: 'hdr', output: 'DP-3', enabled: true })).toEqual([
      'output.DP-3.hdr.enable',
    ]);
    expect(args({ action: 'vrr', output: 'DP-3', policy: 'always' })).toEqual([
      'output.DP-3.vrrpolicy.always',
    ]);
    expect(args({ action: 'brightness', level: 33.4, output: 'eDP-2' })).toEqual([
      'output.eDP-2.brightness.33',
    ]);
  });

  it('picks the mode id by size and refresh, the fastest when no refresh is given', () => {
    expect(
      args({ action: 'mode', output: 'DP-3', width: 2560, height: 1440, refreshHz: 60 }),
    ).toEqual(['output.DP-3.mode.2']);
    expect(args({ action: 'mode', output: 'DP-3', width: 2560, height: 1440 })).toEqual([
      'output.DP-3.mode.1',
    ]);
    expect(() => args({ action: 'mode', output: 'DP-3', width: 800, height: 600 })).toThrow(
      'DP-3 has no 800x600 mode.',
    );
  });

  it('places an output next to another using logical sizes', () => {
    expect(
      args({ action: 'position', output: 'eDP-2', relativeTo: 'DP-3', side: 'right' }),
    ).toEqual(['output.eDP-2.position.2048,0']);
    expect(
      args({ action: 'position', output: 'eDP-2', relativeTo: 'DP-3', side: 'below' }),
    ).toEqual(['output.eDP-2.position.0,1152']);
    expect(args({ action: 'position', output: 'eDP-2', relativeTo: 'DP-3', side: 'left' })).toEqual(
      ['output.eDP-2.position.-2560,0'],
    );
  });

  it('makes an output primary by reordering the priorities of the enabled outputs', () => {
    expect(args({ action: 'primary', output: 'eDP-2' })).toEqual([
      'output.eDP-2.priority.1',
      'output.DP-3.priority.2',
    ]);
  });

  it('refuses what the display cannot do', () => {
    expect(() => args({ action: 'hdr', output: 'eDP-2', enabled: true })).toThrow(
      'eDP-2 does not support HDR.',
    );
    expect(() => args({ action: 'vrr', output: 'eDP-2', policy: 'never' })).toThrow(
      'eDP-2 does not support adaptive sync.',
    );
    expect(() => args({ action: 'mirror', output: 'eDP-2', of: 'DP-3' })).toThrow(/Mirroring/);
    expect(() => args({ action: 'enable', output: 'nothing' })).toThrow(
      'No display matches "nothing".',
    );
  });

  it('applies every brightness change to the enabled outputs that report one', () => {
    expect(args({ action: 'brightness', level: 10 })).toEqual([
      'output.DP-3.brightness.10',
      'output.eDP-2.brightness.10',
    ]);
  });
});

describe('restoring the previous layout', () => {
  it('re-enables outputs with their mode, position, scale, rotation and priority before disabling others', () => {
    expect(restoreArguments(parseKscreen(ONE_SCREEN_ON))).toEqual([
      'output.DP-3.enable',
      'output.DP-3.mode.1',
      'output.DP-3.position.0,0',
      'output.DP-3.scale.1.25',
      'output.DP-3.rotation.none',
      'output.DP-3.priority.1',
      'output.eDP-2.disable',
    ]);
  });
});

describe('KscreenDisplays', () => {
  it('reads with -j and applies one atomic kscreen-doctor call', async () => {
    const system = recorder({ 'kscreen-doctor': TWO_SCREENS });
    const backend = new KscreenDisplays(system.run);
    await backend.apply({ kind: 'enabled', output: 'eDP-2', enabled: false });
    expect(system.calls).toEqual(['kscreen-doctor -j', 'kscreen-doctor output.eDP-2.disable']);
    await expect(backend.capture()).resolves.toContain('output.DP-3.enable');
    await backend.restore(['output.DP-3.enable']);
    expect(system.calls.at(-1)).toBe('kscreen-doctor output.DP-3.enable');
  });
});
