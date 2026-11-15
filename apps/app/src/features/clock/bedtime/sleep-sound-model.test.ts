import type { PlannerSleepSoundNotice } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  fadeOptionsOf,
  receiveSleepSound,
  sleepRequestOf,
  sleepSoundKindOf,
  sleepSoundTitleOf,
  timerOptionsOf,
  type SleepPlayer,
} from './sleep-sound-model';
import type { SleepSoundRequest } from '../../../../modules/health-connect';

const FOLDER = '00000000-0000-4000-8000-000000000010';

function play(sound: PlannerSleepSoundNotice['sound']): PlannerSleepSoundNotice {
  return { type: 'planner_sleep_sound', action: 'play', sound, timerMinutes: 45, fadeSeconds: 60 };
}

const STOP: PlannerSleepSoundNotice = {
  type: 'planner_sleep_sound',
  action: 'stop',
  sound: null,
  timerMinutes: null,
  fadeSeconds: 0,
};

describe('the sleep sound', () => {
  it('names each kind of sound', () => {
    expect(sleepSoundTitleOf({ kind: 'noise', colour: 'pink' }, null)).toBe('Pink noise');
    expect(
      sleepSoundTitleOf(
        { kind: 'radio', station_id: 's', name: 'Calm FM', url: 'https://x.test/a' },
        null,
      ),
    ).toBe('Calm FM');
    expect(sleepSoundTitleOf({ kind: 'file', item_id: FOLDER }, 'rain.mp3')).toBe('rain.mp3');
    expect(sleepSoundTitleOf({ kind: 'playlist', item_id: FOLDER, shuffle: true }, 'Music')).toBe(
      'Music, shuffled',
    );
    expect(sleepSoundTitleOf(null, null)).toBe('No sound');
    expect(sleepSoundKindOf({ kind: 'file', item_id: FOLDER })).toBe('drive');
    expect(sleepSoundKindOf(null)).toBe('noise');
  });

  it('offers timers and fades with the current choice kept', () => {
    expect(timerOptionsOf(null)[0]).toEqual({ value: 'off', label: 'Until I stop it' });
    expect(timerOptionsOf(50).map((option) => option.value)).toContain('50');
    expect(timerOptionsOf(null).find((option) => option.value === '60')?.label).toBe('1 h');
    expect(fadeOptionsOf(45).map((option) => option.label)).toContain('45 s fade');
    expect(fadeOptionsOf(0)[0]?.label).toBe('No fade');
  });
});

describe('a sleep sound notice on the phone', () => {
  it('plays noise and radio as they are', () => {
    expect(sleepRequestOf(play({ kind: 'noise', colour: 'brown' }))).toEqual({
      source: { kind: 'noise', colour: 'brown' },
      timerMinutes: 45,
      fadeSeconds: 60,
    });
    const radio = { kind: 'radio', name: 'Calm FM', url: 'https://x.test/a' } as const;
    expect(sleepRequestOf(play(radio))?.source).toEqual(radio);
    expect(sleepRequestOf(STOP)).toBeNull();
  });

  it('plays the resolved Drive tracks the hub sent', () => {
    const files = {
      kind: 'files',
      files: [
        { item_id: '00000000-0000-4000-8000-000000000101', name: 'rain-1.mp3', etag: 'e1' },
        { item_id: '00000000-0000-4000-8000-000000000102', name: 'rain-2.mp3', etag: 'e2' },
      ],
      shuffle: true,
    } as const;
    expect(sleepRequestOf(play(files))?.source).toEqual(files);
  });

  it('starts and stops the native player only on a phone with it', async () => {
    const started: SleepSoundRequest[] = [];
    let stopped = 0;
    const player = (linked: boolean): SleepPlayer => ({
      linked: () => linked,
      start: (request): Promise<void> => {
        started.push(request);
        return Promise.resolve();
      },
      stop: (): Promise<void> => {
        stopped += 1;
        return Promise.resolve();
      },
    });
    expect(await receiveSleepSound(play({ kind: 'noise', colour: 'white' }), player(false))).toBe(
      false,
    );
    expect(await receiveSleepSound(play({ kind: 'noise', colour: 'white' }), player(true))).toBe(
      true,
    );
    expect(await receiveSleepSound(STOP, player(true))).toBe(true);
    expect(started.map((request) => request.source)).toEqual([{ kind: 'noise', colour: 'white' }]);
    expect(stopped).toBe(1);
  });
});
