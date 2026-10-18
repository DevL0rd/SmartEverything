import type { DisplayOutput, PendingRevert } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  arrangementOf,
  dropOf,
  isCustomScale,
  isOnlyScreen,
  modeLine,
  modeOfChoice,
  nightLightLine,
  refreshOptions,
  remainingSeconds,
  resolutionOptions,
  resolutionValue,
} from './displays-model';

function output(patch: Partial<DisplayOutput>): DisplayOutput {
  return {
    id: 'DP-3',
    name: 'Dell U2723QE',
    builtIn: false,
    enabled: true,
    primary: true,
    mode: { width: 2560, height: 1440, refreshHz: 165, preferred: false },
    modes: [
      { width: 3840, height: 2160, refreshHz: 60, preferred: true },
      { width: 2560, height: 1440, refreshHz: 165, preferred: false },
      { width: 2560, height: 1440, refreshHz: 60, preferred: false },
      { width: 1920, height: 1080, refreshHz: 60, preferred: false },
    ],
    scalePercent: 125,
    rotation: 0,
    x: 0,
    y: 0,
    brightness: 60,
    hdr: { supported: true, enabled: false },
    vrr: 'automatic',
    mirrorOf: null,
    ...patch,
  };
}

const LEFT = output({ id: 'eDP-1', name: 'Laptop', primary: false, scalePercent: 100, x: 0 });
const RIGHT = output({ id: 'DP-3', scalePercent: 100, x: 2560 });

describe('displays model', () => {
  it('describes a screen in one line', () => {
    expect(modeLine(output({}))).toBe('2,560 × 1,440 · 165 Hz · 125 % · DP-3');
    expect(modeLine(output({ enabled: false, mode: null }))).toBe('Off · DP-3');
  });

  it('lists resolutions largest first with the preferred one marked', () => {
    expect(resolutionOptions(output({})).map((option) => option.label)).toEqual([
      '3,840 × 2,160 (preferred)',
      '2,560 × 1,440',
      '1,920 × 1,080',
    ]);
    expect(resolutionValue(output({}))).toBe('2560x1440');
  });

  it('lists the refresh rates of one resolution fastest first', () => {
    expect(refreshOptions(output({}), '2560x1440').map((option) => option.value)).toEqual([
      '165',
      '60',
    ]);
    expect(refreshOptions(output({}), null)).toEqual([]);
  });

  it('keeps the chosen refresh rate when it exists and otherwise takes the fastest', () => {
    expect(modeOfChoice(output({}), '2560x1440', '60')?.refreshHz).toBe(60);
    expect(modeOfChoice(output({}), '3840x2160', '165')?.refreshHz).toBe(60);
    expect(modeOfChoice(output({}), '800x600', '60')).toBeNull();
  });

  it('knows custom scales and the only screen', () => {
    expect(isCustomScale(125)).toBe(false);
    expect(isCustomScale(135)).toBe(true);
    expect(isOnlyScreen([output({})], 'DP-3')).toBe(true);
    expect(isOnlyScreen([LEFT, RIGHT], 'DP-3')).toBe(false);
    expect(isOnlyScreen([output({}), output({ id: 'x', enabled: false })], 'x')).toBe(false);
  });

  it('words night light', () => {
    const light = { supported: true, mode: 'on', active: true, temperatureKelvin: 4500 } as const;
    expect(nightLightLine(light)).toBe('4,500 K');
    expect(nightLightLine({ ...light, mode: 'off' })).toBeNull();
    expect(nightLightLine({ ...light, temperatureKelvin: null })).toBeNull();
    expect(nightLightLine({ ...light, mode: 'scheduled' })).toBe('Active now · 4,500 K');
    expect(nightLightLine({ ...light, mode: 'scheduled', active: false })).toBe(
      'Not active right now',
    );
  });

  it('counts the seconds left, never above 15', () => {
    const pending: PendingRevert = {
      token: 't',
      startedAt: '2026-10-17T10:00:00.000Z',
      revertsAt: '2026-10-17T10:00:15.000Z',
      summary: 'x',
    };
    const at = (seconds: number): number => Date.parse('2026-10-17T10:00:00.000Z') + seconds * 1000;
    expect(remainingSeconds(pending, at(0))).toBe(15);
    expect(remainingSeconds(pending, at(-30))).toBe(15);
    expect(remainingSeconds(pending, at(0.2))).toBe(15);
    expect(remainingSeconds(pending, at(14.1))).toBe(1);
    expect(remainingSeconds(pending, at(15))).toBe(0);
    expect(remainingSeconds(pending, at(40))).toBe(0);
  });
});

describe('arrangement', () => {
  it('lays enabled screens to scale side by side', () => {
    const [first, second] = arrangementOf([LEFT, RIGHT], 400).on;
    expect(first?.id).toBe('eDP-1');
    expect(second?.left ?? 0).toBeGreaterThan(first?.left ?? 0);
    expect(second?.top).toBe(first?.top);
  });

  it('stacks off screens below the enabled ones', () => {
    const off = output({ id: 'HDMI-1', name: 'TV', enabled: false, primary: false, mode: null });
    const layout = arrangementOf([LEFT, RIGHT, off], 400);
    const bottom = (layout.on[0]?.top ?? 0) + (layout.on[0]?.height ?? 0);
    expect(layout.off[0]?.id).toBe('HDMI-1');
    expect(layout.off[0]?.top ?? 0).toBeGreaterThan(bottom);
    expect(layout.height).toBeGreaterThan(layout.off[0]?.top ?? 0);
  });

  it('swaps the size of a turned screen', () => {
    const turned = arrangementOf([output({ rotation: 90, scalePercent: 100 })], 400);
    const plain = arrangementOf([output({ scalePercent: 100 })], 400);
    expect(turned.on[0]?.height).toBeGreaterThan(plain.on[0]?.height ?? 0);
  });

  it('turns a drag into a side of the nearest other screen', () => {
    const { on } = arrangementOf([LEFT, RIGHT], 400);
    const right = on[1];
    const wide = (right?.width ?? 0) * 2;
    const tall = (right?.height ?? 0) * 1.5;
    expect(dropOf(on, 'DP-3', -wide, 0)).toEqual({ relativeTo: 'eDP-1', side: 'left' });
    expect(dropOf(on, 'DP-3', 0, tall)?.side).toBe('below');
    expect(dropOf(on, 'DP-3', 0, -tall)?.side).toBe('above');
  });

  it('ignores a tiny drag and a lone screen', () => {
    const { on } = arrangementOf([LEFT, RIGHT], 400);
    expect(dropOf(on, 'DP-3', 3, 3)).toBeNull();
    const lone = arrangementOf([LEFT], 400).on;
    expect(dropOf(lone, 'eDP-1', 50, 0)).toBeNull();
  });
});
