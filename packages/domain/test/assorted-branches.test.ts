import { describe, expect, it } from 'vitest';
import { effectiveFitnessGoals, FITNESS_GOAL_LIMITS } from '../src/fitness-settings';
import { portionOf, type FoodCandidate } from '../src/foods';
import { isNewerVersion } from '../src/machine-updates';
import { MICROWAVE_KEYS, microwaveSecondsLeft } from '../src/microwave';
import { leastTrustedOrigin, type PluginOrigin } from '../src/plugin-people';
import { providerLabelOf } from '../src/presentation/humanize';
import { WIDGET_SIZE } from '../src/board-layout';
import { overlayView } from '../src/voice-overlay-view';
import { EMPTY_IR_REMOTE_STATE, afterIrSend } from '../src/ir-remote-state';
import { DEFAULT_OVERLAY_PREFS } from '../src/voice-overlay';
import { call, input } from './support/voice-overlay-fixtures';
import {
  effectiveHistoryPolicy,
  applyHistorySettingsChange,
  type HistorySettings,
} from '../src/history-settings';
import { signalTriggerError } from '../src/signal-sources/spec';
import { SIGNAL_SOURCES } from '../src/signal-sources/index';
import { signalTriggerKeywords } from '../src/search-triggers';

describe('fitness goals', () => {
  it('uses the goal the person set and the standard goal for the rest', () => {
    expect(
      effectiveFitnessGoals({
        steps: 12_000,
        move_kcal: null,
        active_minutes: 45,
        sleep_minutes: null,
        hydration_ml: null,
      }),
    ).toStrictEqual({
      steps: 12_000,
      move_kcal: FITNESS_GOAL_LIMITS.move_kcal.standard,
      active_minutes: 45,
      sleep_minutes: FITNESS_GOAL_LIMITS.sleep_minutes.standard,
      hydration_ml: FITNESS_GOAL_LIMITS.hydration_ml.standard,
    });
  });
});

describe('fitness goals left at the standard', () => {
  it('uses the standard for every goal that was never set', () => {
    expect(
      effectiveFitnessGoals({
        steps: null,
        move_kcal: null,
        active_minutes: null,
        sleep_minutes: null,
        hydration_ml: null,
      }),
    ).toStrictEqual({
      steps: FITNESS_GOAL_LIMITS.steps.standard,
      move_kcal: FITNESS_GOAL_LIMITS.move_kcal.standard,
      active_minutes: FITNESS_GOAL_LIMITS.active_minutes.standard,
      sleep_minutes: FITNESS_GOAL_LIMITS.sleep_minutes.standard,
      hydration_ml: FITNESS_GOAL_LIMITS.hydration_ml.standard,
    });
  });
});

describe('portionOf', () => {
  const FACTS: FoodCandidate = {
    name: 'Soup',
    brand: null,
    barcode: null,
    kind: 'food',
    basis: { amount: 100, unit: 'g' },
    serving: null,
    kcal: 40,
    grams: { protein: 2.5 },
    water_percent: 80,
  };

  it('scales calories, nutrients and water to the amount', () => {
    expect(portionOf(FACTS, 250)).toStrictEqual({
      kilocalories: 100,
      grams: { protein: 6.25 },
      waterMl: 200,
    });
  });

  it('keeps unknown calories unknown', () => {
    expect(portionOf({ ...FACTS, kcal: null }, 250).kilocalories).toBeNull();
  });
});

describe('isNewerVersion with different lengths', () => {
  it('treats missing parts as zero', () => {
    expect(isNewerVersion('1.2.1', '1.2')).toBe(true);
    expect(isNewerVersion('1.2', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.2', '1.2.1')).toBe(false);
  });
});

describe('microwave time left without progress', () => {
  it('counts the whole programmed time while no progress is reported', () => {
    expect(
      microwaveSecondsLeft({
        [MICROWAVE_KEYS.state]: 'running',
        [MICROWAVE_KEYS.duration]: '00:06:00',
      }),
    ).toBe(360);
  });
});

describe('leastTrustedOrigin', () => {
  function origin(requester: PluginOrigin['requester']): PluginOrigin {
    return { plugin_id: 'bridge', requester };
  }

  it('is none for no origins and picks the least trusted requester otherwise', () => {
    expect(leastTrustedOrigin([])).toBeNull();
    const owner = origin('owner');
    const unlisted = origin('unlisted');
    const approved = origin('approved');
    expect(leastTrustedOrigin([owner, unlisted, approved])).toBe(unlisted);
    expect(leastTrustedOrigin([owner, approved])).toBe(approved);
    expect(leastTrustedOrigin([unlisted, owner])).toBe(unlisted);
  });
});

describe('providerLabelOf', () => {
  it('uses what follows the last colon, tidied, or the whole label when that is empty', () => {
    expect(providerLabelOf('Xiaomi: living_room_fan')).toBe('Living room fan');
    expect(providerLabelOf('Plain label')).toBe('Plain label');
    expect(providerLabelOf('Kitchen:  ')).toBe('Kitchen:');
  });
});

describe('WIDGET_SIZE', () => {
  it('reads the retired small and large sizes as medium and extra large', () => {
    expect(WIDGET_SIZE.parse('S')).toBe('M');
    expect(WIDGET_SIZE.parse('L')).toBe('XL');
    expect(WIDGET_SIZE.parse('W')).toBe('W');
    expect(WIDGET_SIZE.safeParse('Q').success).toBe(false);
    expect(WIDGET_SIZE.safeParse(3).success).toBe(false);
  });
});

describe('the sharing detail of the voice overlay', () => {
  it('names the shared window, or says a window when it has no label', () => {
    const named = call({ sharing: { kind: 'window', label: 'Files' } });
    const unnamed = call({ sharing: { kind: 'window', label: null } });
    const surface = { platform: 'desktop', main: 'away', inShare: false } as const;
    const prefs = { ...DEFAULT_OVERLAY_PREFS };
    expect(overlayView(input({ call: named, surface, prefs })).detail).toMatch(/Files$/);
    expect(overlayView(input({ call: unnamed, surface, prefs })).detail).toMatch(/a window$/);
  });
});

describe('the mode key of an IR remote', () => {
  it('moves to the next mode and wraps round', () => {
    const first = afterIrSend(EMPTY_IR_REMOTE_STATE, 'Mode', [], '2026-10-18T12:00:00.000Z');
    expect(first.mode).not.toBeNull();
    const second = afterIrSend(first, 'Mode', [], '2026-10-18T12:00:00.000Z');
    expect(second.mode).not.toBe(first.mode);
    let state = second;
    const seen = new Set<string | null>([first.mode, second.mode]);
    for (let press = 0; press < 12; press += 1) {
      state = afterIrSend(state, 'Mode', [], '2026-10-18T12:00:00.000Z');
      seen.add(state.mode);
    }
    expect(seen.has(first.mode)).toBe(true);
  });
});

describe('history policy overrides', () => {
  const SETTINGS: HistorySettings = {
    classes: {
      generic: { interval_ms: 1000, window_ms: 60_000 },
      hub: { interval_ms: 1000, window_ms: 60_000 },
      computers: { interval_ms: 1000, window_ms: 60_000 },
      router: { interval_ms: 1000, window_ms: 60_000 },
      syncthing: { interval_ms: 1000, window_ms: 60_000 },
      adguard: { interval_ms: 1000, window_ms: 60_000 },
    },
    devices: { d1: { interval_ms: 5000, window_ms: null } },
  };

  it('takes a field the override names and the class value for the field it leaves out', () => {
    expect(effectiveHistoryPolicy(SETTINGS, 'd1', 'generic')).toStrictEqual({
      interval_ms: 5000,
      window_ms: 60_000,
    });
    expect(effectiveHistoryPolicy(SETTINGS, 'd2', 'generic')).toStrictEqual({
      interval_ms: 1000,
      window_ms: 60_000,
    });
  });

  it('keeps the devices as they are when a change names classes only', () => {
    const after = applyHistorySettingsChange(SETTINGS, {
      classes: { hub: { interval_ms: 2000, window_ms: 60_000 } },
    });
    expect(after.devices).toStrictEqual(SETTINGS.devices);
    expect(after.classes.hub.interval_ms).toBe(2000);
    expect(after.classes.generic).toStrictEqual(SETTINGS.classes.generic);
  });
});

describe('trigger keywords for xiaomi device events', () => {
  it('uses the event name itself when it has no friendlier label', () => {
    const words = signalTriggerKeywords({
      source: 'event',
      kind: 'opened',
      match: { miotEvent: 'door-opened' },
    });
    expect(words).toEqual(
      expect.arrayContaining(['Xiaomi event name (not cameras)', 'door-opened']),
    );
    expect(
      signalTriggerError(SIGNAL_SOURCES, { source: 'event', kind: 'opened', match: {} }),
    ).toBeNull();
  });
});
