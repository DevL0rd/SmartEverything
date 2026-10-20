import { describe, expect, it } from 'vitest';
import { assistantLabel, isInterruption, isRetiredFailedAction } from '../src/assistant';
import { miotDeviceEventKind } from '../src/events';
import { suggestedGoals } from '../src/fitness-defaults';
import { defaultWaterPercent, FOOD_CHANGE, unitLabel } from '../src/foods';
import { HEALTH_RECORD_TYPES } from '../src/health';
import { HEALTH_TYPE_INFO, healthTypeInfo } from '../src/health-types';
import { LOGGABLE_TYPES } from '../src/health-entries';
import { nowPlayingText } from '../src/node/computer-session-state';

describe('assistant helpers', () => {
  it('counts an interrupted or stopped reply as an interruption and nothing else', () => {
    expect(isInterruption('interrupted')).toBe(true);
    expect(isInterruption('stopped')).toBe(true);
    expect(isInterruption('offline')).toBe(false);
    expect(isInterruption(null)).toBe(false);
  });

  it('recognises the retired failed-action rows by their action kind and prefix', () => {
    expect(isRetiredFailedAction({ kind: 'action', text: 'Couldn’t do this: lights' })).toBe(true);
    expect(isRetiredFailedAction({ kind: 'action', text: 'Turned on the lights' })).toBe(false);
    expect(isRetiredFailedAction({ kind: 'text', text: 'Couldn’t do this: lights' })).toBe(false);
  });

  it('names the assistant by its setting, else Coordinator', () => {
    expect(assistantLabel({ name: 'Jarvis' })).toBe('Jarvis');
    expect(assistantLabel({ name: null })).toBe('Coordinator');
  });
});

describe('foods', () => {
  it('counts plain drinks as water and everything else as dry', () => {
    expect(defaultWaterPercent('drink', false)).toBe(100);
    expect(defaultWaterPercent('drink', true)).toBe(0);
    expect(defaultWaterPercent('food', false)).toBe(0);
  });

  it('labels the unit of a portion', () => {
    expect(unitLabel('ml')).toBe('ml');
    expect(unitLabel('g')).toBe('g');
  });

  it('needs at least one field to change a food', () => {
    expect(FOOD_CHANGE.safeParse({}).success).toBe(false);
    expect(FOOD_CHANGE.safeParse({ name: 'Soup' }).success).toBe(true);
  });
});

describe('miotDeviceEventKind', () => {
  it('maps a known device event name to its kind', () => {
    expect(miotDeviceEventKind('door-opened')).toBe('opened');
    expect(miotDeviceEventKind('people-fence-in')).toBe('person');
  });

  it('knows nothing of other names, including names on the object prototype', () => {
    expect(miotDeviceEventKind('unknown-event')).toBeNull();
    expect(miotDeviceEventKind('toString')).toBeNull();
  });
});

describe('suggestedGoals', () => {
  it('suggests more movement and drink for a younger man', () => {
    expect(suggestedGoals({ sex: 'male', age: 30, heightCm: 180 })).toStrictEqual({
      steps: 10_000,
      move_kcal: 500,
      active_minutes: 30,
      sleep_minutes: 480,
      hydration_ml: 2500,
    });
  });

  it('suggests lighter goals for a woman and fewer steps and more sleep from sixty-five', () => {
    expect(suggestedGoals({ sex: 'female', age: 64, heightCm: 165 })).toMatchObject({
      steps: 10_000,
      move_kcal: 400,
      sleep_minutes: 480,
      hydration_ml: 2000,
    });
    expect(suggestedGoals({ sex: 'female', age: 65, heightCm: 165 })).toMatchObject({
      steps: 7000,
      sleep_minutes: 450,
    });
  });
});

describe('health type info', () => {
  it('describes every health record type exactly once', () => {
    expect(HEALTH_TYPE_INFO.map((info) => info.type).sort()).toStrictEqual(
      [...HEALTH_RECORD_TYPES].sort(),
    );
  });

  it('marks the loggable types and requires an end only for loggable intervals', () => {
    for (const type of HEALTH_RECORD_TYPES) {
      const info = healthTypeInfo(type);
      expect(info.loggable).toBe(LOGGABLE_TYPES.some((loggable) => loggable === type));
      if (info.endRequired) {
        expect(info.loggable).toBe(true);
        expect(info.span).toBe('interval');
      }
    }
  });

  it('tells an instant from an interval by whether its end may be empty', () => {
    expect(healthTypeInfo('Weight').span).toBe('instant');
    expect(healthTypeInfo('Weight').endRequired).toBe(false);
    expect(healthTypeInfo('SleepSession').span).toBe('interval');
    expect(healthTypeInfo('SleepSession').endRequired).toBe(true);
    expect(healthTypeInfo('Steps').endRequired).toBe(false);
  });

  it('refuses a record type that has no variant', () => {
    expect(() => healthTypeInfo('Teleportation')).toThrow(
      'The health record type Teleportation has no variant in HEALTH_RECORD_VARIANTS.',
    );
  });
});

describe('nowPlayingText', () => {
  const base = { player: 'Spotify', status: 'playing' } as const;

  it('joins title and artist, skipping missing and empty parts', () => {
    expect(nowPlayingText({ ...base, title: 'Song', artist: 'Band' })).toBe('Song – Band');
    expect(nowPlayingText({ ...base, title: 'Song', artist: null })).toBe('Song');
    expect(nowPlayingText({ ...base, title: '', artist: 'Band' })).toBe('Band');
  });

  it('falls back to the player and cuts long text to 300 characters', () => {
    expect(nowPlayingText({ ...base, title: null, artist: '' })).toBe('Spotify');
    expect(
      nowPlayingText({ ...base, title: 'x'.repeat(300), artist: 'y'.repeat(300) }),
    ).toHaveLength(300);
  });
});
