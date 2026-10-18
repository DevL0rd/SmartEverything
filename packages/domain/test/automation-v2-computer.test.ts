import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_V2,
  audioChangeFeature,
  automationReferenceIds,
  displayChangeFeature,
  displayChangeKeepable,
  displayKeepProblem,
  walkSteps,
  type DisplayChange,
  type DisplayOutput,
  type DisplayState,
} from '../src';

const COMPUTER = '3a000000-0000-4000-8000-0000000000a1';

function automation(step: Record<string, unknown>): unknown {
  return { when: [], steps: [step] };
}

function accepts(step: Record<string, unknown>): void {
  expect(AUTOMATION_V2.safeParse(automation(step)).success).toBe(true);
}

function refusal(step: Record<string, unknown>): string {
  const result = AUTOMATION_V2.safeParse(automation(step));
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.message).join('; ') ?? '';
}

describe('computer audio steps', () => {
  it('accepts every per-app and per-device audio change', () => {
    accepts({
      do: 'audio',
      computer: COMPUTER,
      change: { action: 'app_volume', app: 'Spotify', level: 30 },
    });
    accepts({
      do: 'audio',
      computer: COMPUTER,
      change: { action: 'app_mute', app: 'Firefox', muted: true },
    });
    accepts({
      do: 'audio',
      computer: COMPUTER,
      change: { action: 'app_output', app: 'Spotify', output: 'Headset' },
    });
    accepts({
      do: 'audio',
      computer: COMPUTER,
      change: { action: 'mute', muted: true, kind: 'input' },
    });
  });

  it('fills the default sound kind and refuses a level above the loudest boost', () => {
    const parsed = AUTOMATION_V2.parse(
      automation({
        do: 'audio',
        computer: COMPUTER,
        change: { action: 'volume', level: 40 },
      }),
    );
    expect(walkSteps(parsed.steps)[0]).toMatchObject({ change: { kind: 'output', level: 40 } });
    expect(
      refusal({
        do: 'audio',
        computer: COMPUTER,
        change: { action: 'volume', level: 151 },
      }),
    ).not.toBe('');
  });

  it('refuses a step with no computer or an unknown action', () => {
    expect(refusal({ do: 'audio', change: { action: 'volume', level: 10 } })).not.toBe('');
    expect(refusal({ do: 'audio', computer: COMPUTER, change: { action: 'equalise' } })).not.toBe(
      '',
    );
  });
});

describe('computer display steps', () => {
  it('accepts resolution, refresh, scale, brightness, night light and position changes', () => {
    const changes = [
      { action: 'mode', output: 'DP-1', width: 2560, height: 1440, refreshHz: 144 },
      { action: 'scale', output: 'DP-1', percent: 125 },
      { action: 'brightness', level: 40 },
      { action: 'night_light', mode: 'on', temperatureKelvin: 3500 },
      { action: 'position', output: 'HDMI-1', relativeTo: 'DP-1', side: 'right' },
    ];
    for (const change of changes) accepts({ do: 'display', computer: COMPUTER, change });
  });

  it('leaves the other display actions to the tool step', () => {
    for (const change of [
      { action: 'identify' },
      { action: 'disable', output: 'DP-1' },
      { action: 'hdr', output: 'DP-1', enabled: true },
    ]) {
      expect(refusal({ do: 'display', computer: COMPUTER, change })).not.toBe('');
    }
  });

  it('allows keep only on mode, scale and position changes', () => {
    for (const change of [
      { action: 'mode', output: 'DP-1', width: 1920, height: 1080 },
      { action: 'scale', output: 'DP-1', percent: 125 },
      { action: 'position', output: 'DP-1', relativeTo: 'HDMI-1', side: 'left' },
    ]) {
      accepts({ do: 'display', computer: COMPUTER, keep: true, change });
    }
    for (const change of [
      { action: 'brightness', level: 10 },
      { action: 'night_light', mode: 'on' },
    ]) {
      expect(refusal({ do: 'display', computer: COMPUTER, keep: true, change })).toContain(
        'keep applies only to',
      );
    }
  });
});

describe('computer steps in references and features', () => {
  it('reference the computer so removing it is noticed', () => {
    const parsed = AUTOMATION_V2.parse({
      when: [],
      steps: [{ do: 'audio', computer: COMPUTER, change: { action: 'volume', level: 10 } }],
    });
    expect(automationReferenceIds(parsed).has(COMPUTER)).toBe(true);
  });

  it('name the feature a computer must advertise', () => {
    expect(audioChangeFeature({ action: 'volume', level: 1, kind: 'output' })).toBe('audio');
    expect(audioChangeFeature({ action: 'mute', muted: true, kind: 'input' })).toBe('microphone');
    expect(audioChangeFeature({ action: 'app_mute', app: 'x', muted: true })).toBe('audio_apps');
    expect(displayChangeFeature({ action: 'night_light', mode: 'on' })).toBe('night_light');
    expect(displayChangeFeature({ action: 'disable', output: 'a' })).toBe('display_enable');
    expect(displayChangeFeature({ action: 'scale', output: 'a', percent: 100 })).toBe('displays');
    expect(displayChangeFeature({ action: 'mode', output: 'a', width: 1, height: 1 })).toBe(
      'display_modes',
    );
  });
});

function output(extra: Partial<DisplayOutput>): DisplayOutput {
  return {
    id: 'DP-1',
    name: 'Dell U2723',
    builtIn: false,
    enabled: true,
    primary: false,
    mode: { width: 2560, height: 1440, refreshHz: 144, preferred: true },
    modes: [],
    scalePercent: 100,
    rotation: 0,
    x: 0,
    y: 0,
    brightness: null,
    hdr: { supported: false, enabled: false },
    vrr: null,
    mirrorOf: null,
    ...extra,
  };
}

function state(...outputs: DisplayOutput[]): DisplayState {
  return {
    outputs,
    nightLight: { supported: false, mode: 'off', active: false, temperatureKelvin: null },
    pendingRevert: null,
  };
}

describe('the rule for keeping a screen change without a person', () => {
  const mode: DisplayChange = { action: 'mode', output: 'dp-1', width: 2560, height: 1440 };

  it('keeps a mode the screen really switched to, matching by id or name in any case', () => {
    expect(displayKeepProblem(mode, state(output({})))).toBeNull();
    expect(
      displayKeepProblem({ ...mode, output: 'dell u2723' }, state(output({ id: 'DP-9' }))),
    ).toBeNull();
  });

  it('refuses a mode that did not apply and a refresh rate that differs', () => {
    expect(
      displayKeepProblem(
        mode,
        state(output({ mode: { width: 1920, height: 1080, refreshHz: 60, preferred: false } })),
      ),
    ).toContain('did not switch');
    expect(displayKeepProblem({ ...mode, refreshHz: 60 }, state(output({})))).toContain(
      'did not switch',
    );
    expect(displayKeepProblem({ ...mode, refreshHz: 144.2 }, state(output({})))).toBeNull();
    expect(displayKeepProblem(mode, state(output({ mode: null })))).toContain('did not switch');
  });

  it('checks scale and position changes against the applied state', () => {
    const scale: DisplayChange = { action: 'scale', output: 'DP-1', percent: 150 };
    expect(displayKeepProblem(scale, state(output({ scalePercent: 150 })))).toBeNull();
    expect(displayKeepProblem(scale, state(output({ scalePercent: 100 })))).toContain('scale');
    const tv = output({ id: 'HDMI-1', name: 'TV', x: 2560 });
    const right: DisplayChange = {
      action: 'position',
      output: 'HDMI-1',
      relativeTo: 'DP-1',
      side: 'right',
    };
    expect(displayKeepProblem(right, state(output({}), tv))).toBeNull();
    expect(displayKeepProblem(right, state(output({}), output({ ...tv, x: -1920 })))).toContain(
      'did not move right of',
    );
    expect(displayKeepProblem({ ...right, side: 'below' }, state(output({}), tv))).toContain(
      'did not move below',
    );
    expect(displayKeepProblem({ ...right, side: 'left' }, state(output({}), tv))).toContain(
      'did not move left',
    );
    expect(
      displayKeepProblem(
        { ...right, side: 'above' },
        state(output({}), output({ ...tv, x: 0, y: -1440 })),
      ),
    ).toBeNull();
    expect(displayKeepProblem({ ...right, relativeTo: 'gone' }, state(output({}), tv))).toContain(
      'is not a screen',
    );
  });

  it('never keeps when every screen is off, the screen is missing or it is off', () => {
    expect(displayKeepProblem(mode, state(output({ enabled: false })))).toBe('Every screen is off');
    expect(displayKeepProblem(mode, state(output({ id: 'HDMI-1', name: 'TV' })))).toContain(
      'is not a screen',
    );
    expect(
      displayKeepProblem(
        mode,
        state(output({ enabled: false }), output({ id: 'HDMI-1', name: 'TV' })),
      ),
    ).toContain('is off');
  });

  it('never keeps a change that can blank screens', () => {
    for (const change of [
      { action: 'disable', output: 'DP-1' },
      { action: 'mirror', output: 'DP-1', of: null },
      { action: 'rotation', output: 'DP-1', degrees: 90 },
      { action: 'brightness', level: 5 },
    ] as const) {
      expect(displayChangeKeepable(change)).toBe(false);
      expect(displayKeepProblem(change, state(output({})))).toContain('cannot be kept');
    }
  });
});
