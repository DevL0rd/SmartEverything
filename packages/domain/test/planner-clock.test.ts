import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  PLANNER_ALARM_CHANGES,
  PLANNER_ALARM_CREATE,
  PLANNER_CLOCK_ENDPOINTS,
  PLANNER_PHONE_RING_SET,
  PLANNER_RADIO_QUERY,
  PLANNER_SLEEP_QUERY,
  PLANNER_SLEEP_SOUND_BODY,
} from '../src/api/endpoints-planner-clock';
import { PLANNER_LIVE_NOTICES } from '../src/api/live-planner';
import { PLANNER_ALARM_ROW, PLANNER_CHALLENGE, PLANNER_SUNRISE } from '../src/planner/alarms';
import {
  PLANNER_BEDTIME,
  PLANNER_BEDTIME_SIGNALS,
  PLANNER_BEDTIME_SIGNAL_KINDS,
  PLANNER_BEDTIME_WINDOW,
  PLANNER_SLEEP_SOUND_NOTICE,
  PLANNER_SLEEP_SOUNDS,
} from '../src/planner/bedtime';
import { PLANNER_SMART_LISTS } from '../src/planner/preferences';
import { PLANNER_SLEEP } from '../src/planner/sleep';
import {
  PLANNER_ALARM_SOUND,
  PLANNER_RADIO_RESULT,
  PLANNER_RESOLVED_SOUND,
  PLANNER_SLEEP_SOUND,
} from '../src/planner/sounds';

const ID = '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f';
const OTHER = '7d1e9a2c-8b3f-4c5d-a6e7-0f1a2b3c4d5e';
const NOW = '2026-11-07T08:00:00Z';
const RADIO = {
  kind: 'radio',
  station_id: 'abc',
  name: 'Jazz FM',
  url: 'https://radio.example/stream',
};

describe('alarm sounds', () => {
  it('accepts each kind and rejects unknown kinds, noise and extra fields', () => {
    for (const sound of [
      { kind: 'tone', id: 'default' },
      { kind: 'file', item_id: ID },
      { kind: 'playlist', item_id: ID, shuffle: true },
      RADIO,
    ]) {
      expect(PLANNER_ALARM_SOUND.safeParse(sound).success, sound.kind).toBe(true);
    }
    expect(PLANNER_ALARM_SOUND.safeParse('default').success).toBe(false);
    expect(PLANNER_ALARM_SOUND.safeParse({ kind: 'noise', colour: 'white' }).success).toBe(false);
    expect(PLANNER_ALARM_SOUND.safeParse({ kind: 'tone', id: ' ' }).success).toBe(false);
    expect(PLANNER_ALARM_SOUND.safeParse({ kind: 'file', item_id: 'x' }).success).toBe(false);
    expect(PLANNER_ALARM_SOUND.safeParse({ kind: 'playlist', item_id: ID }).success).toBe(false);
    expect(PLANNER_ALARM_SOUND.safeParse({ ...RADIO, url: 'ftp://radio.example' }).success).toBe(
      false,
    );
    expect(PLANNER_ALARM_SOUND.safeParse({ kind: 'file', item_id: ID, extra: 1 }).success).toBe(
      false,
    );
  });

  it('gives sleep sounds noise colours in place of tones', () => {
    expect(PLANNER_SLEEP_SOUND.safeParse({ kind: 'noise', colour: 'pink' }).success).toBe(true);
    expect(PLANNER_SLEEP_SOUND.safeParse({ kind: 'noise', colour: 'blue' }).success).toBe(false);
    expect(PLANNER_SLEEP_SOUND.safeParse({ kind: 'tone', id: 'default' }).success).toBe(false);
    expect(PLANNER_SLEEP_SOUND.safeParse(RADIO).success).toBe(true);
  });

  it('resolves a ring sound to a tone, a downloadable file or a radio stream', () => {
    const file = { kind: 'file', item_id: ID, name: 'wake.mp3', etag: 'e1' };
    expect(PLANNER_RESOLVED_SOUND.safeParse(file).success).toBe(true);
    expect(PLANNER_RESOLVED_SOUND.safeParse({ kind: 'file', item_id: ID }).success).toBe(false);
    expect(
      PLANNER_RESOLVED_SOUND.safeParse({ kind: 'playlist', item_id: ID, shuffle: false }).success,
    ).toBe(false);
    expect(PLANNER_RESOLVED_SOUND.safeParse(RADIO).success).toBe(true);
  });

  it('describes a radio search hit', () => {
    const hit = {
      station_id: 'abc',
      name: 'Jazz FM',
      url: 'https://r.example/s',
      country: 'UK',
      bitrate: 128,
      codec: 'MP3',
    };
    expect(PLANNER_RADIO_RESULT.safeParse(hit).success).toBe(true);
    expect(PLANNER_RADIO_RESULT.safeParse({ ...hit, bitrate: 0 }).success).toBe(false);
    expect(PLANNER_RADIO_QUERY.safeParse({ text: 'jazz' }).success).toBe(true);
    expect(PLANNER_RADIO_QUERY.safeParse({ text: '  ' }).success).toBe(false);
  });
});

describe('challenges and sunrise', () => {
  it('accepts every challenge kind and rejects incomplete ones', () => {
    for (const challenge of [
      { kind: 'none' },
      { kind: 'maths', difficulty: 'hard', count: 3 },
      { kind: 'qr', code: 'bathroom-mirror' },
      { kind: 'steps', steps: 30 },
    ]) {
      expect(PLANNER_CHALLENGE.safeParse(challenge).success, challenge.kind).toBe(true);
    }
    expect(
      PLANNER_CHALLENGE.safeParse({ kind: 'maths', difficulty: 'insane', count: 3 }).success,
    ).toBe(false);
    expect(
      PLANNER_CHALLENGE.safeParse({ kind: 'maths', difficulty: 'easy', count: 0 }).success,
    ).toBe(false);
    expect(PLANNER_CHALLENGE.safeParse({ kind: 'qr', code: '' }).success).toBe(false);
    expect(PLANNER_CHALLENGE.safeParse({ kind: 'steps', steps: -1 }).success).toBe(false);
    expect(PLANNER_CHALLENGE.safeParse({ kind: 'steps', steps: 10, extra: 1 }).success).toBe(false);
  });

  it('needs a light, a positive length and no repeated light for a sunrise', () => {
    expect(PLANNER_SUNRISE.safeParse({ lights: [ID], minutes: 20, colour: true }).success).toBe(
      true,
    );
    expect(PLANNER_SUNRISE.safeParse({ lights: [], minutes: 20, colour: true }).success).toBe(
      false,
    );
    expect(PLANNER_SUNRISE.safeParse({ lights: [ID, ID], minutes: 20, colour: true }).success).toBe(
      false,
    );
    expect(PLANNER_SUNRISE.safeParse({ lights: [ID], minutes: 0, colour: false }).success).toBe(
      false,
    );
  });
});

describe('alarm rows and bodies with the wave 2 fields', () => {
  const alarm = {
    id: ID,
    profile_id: OTHER,
    label: null,
    time: '07:00',
    days: [1],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: { kind: 'tone', id: 'default' },
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    snooze_limit: 3,
    challenge: { kind: 'maths', difficulty: 'easy', count: 2 },
    sunrise: { lights: [OTHER], minutes: 15, colour: false },
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
    created_at: NOW,
    updated_at: NOW,
  };

  it('accepts a row with a limit, a challenge and a sunrise and rejects the old string sound', () => {
    expect(PLANNER_ALARM_ROW.safeParse(alarm).success).toBe(true);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, sound: 'default' }).success).toBe(false);
    expect(PLANNER_ALARM_ROW.safeParse({ ...alarm, snooze_limit: 0 }).success).toBe(false);
    expect(
      PLANNER_ALARM_ROW.safeParse({ ...alarm, snooze_limit: null, sunrise: null }).success,
    ).toBe(true);
    const { challenge, ...missing } = alarm;
    expect(challenge.kind).toBe('maths');
    expect(PLANNER_ALARM_ROW.safeParse(missing).success).toBe(false);
  });

  it('defaults a created alarm to no challenge, no sunrise and the clock default limit', () => {
    const created = PLANNER_ALARM_CREATE.parse({ time: '06:30' });
    expect(created.challenge).toStrictEqual({ kind: 'none' });
    expect(created.sunrise).toBeNull();
    expect(created.snooze_limit).toBeUndefined();
    expect(created.sound).toBeUndefined();
    const set = PLANNER_ALARM_CREATE.parse({
      time: '06:30',
      sound: RADIO,
      snooze_limit: null,
      challenge: { kind: 'steps', steps: 20 },
    });
    expect(set.snooze_limit).toBeNull();
    expect(PLANNER_ALARM_CREATE.safeParse({ time: '06:30', sound: 'default' }).success).toBe(false);
  });

  it('changes the new fields one at a time', () => {
    expect(PLANNER_ALARM_CHANGES.safeParse({ snooze_limit: null }).success).toBe(true);
    expect(PLANNER_ALARM_CHANGES.safeParse({ sunrise: null }).success).toBe(true);
    expect(PLANNER_ALARM_CHANGES.safeParse({ challenge: { kind: 'qr', code: 'a' } }).success).toBe(
      true,
    );
    expect(PLANNER_ALARM_CHANGES.safeParse({ challenge: { kind: 'qr' } }).success).toBe(false);
  });
});

describe('bedtime preferences', () => {
  const bedtime = {
    enabled: true,
    schedule: [
      { days: [0, 1, 2, 3, 4], bed: '22:30', wake: '06:30' },
      { days: [5, 6], bed: '23:30', wake: '08:00' },
    ],
    reminder_minutes: 30,
    wind_down_minutes: 45,
    wind_down_automation_id: ID,
    do_not_disturb: true,
    sleep_sound: { kind: 'noise', colour: 'brown' },
  };

  it('accepts a weekly schedule and the empty off state', () => {
    expect(PLANNER_BEDTIME.safeParse(bedtime).success).toBe(true);
    expect(
      PLANNER_BEDTIME.safeParse({
        ...bedtime,
        enabled: false,
        schedule: [],
        reminder_minutes: null,
        wind_down_minutes: null,
        wind_down_automation_id: null,
        sleep_sound: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a weekday with two bedtimes, empty days, equal times and bad minutes', () => {
    const twice = [...bedtime.schedule, { days: [6], bed: '01:00', wake: '09:00' }];
    expect(PLANNER_BEDTIME.safeParse({ ...bedtime, schedule: twice }).success).toBe(false);
    expect(
      PLANNER_BEDTIME.safeParse({
        ...bedtime,
        schedule: [{ days: [], bed: '22:00', wake: '06:00' }],
      }).success,
    ).toBe(false);
    expect(
      PLANNER_BEDTIME.safeParse({
        ...bedtime,
        schedule: [{ days: [1], bed: '22:00', wake: '22:00' }],
      }).success,
    ).toBe(false);
    expect(PLANNER_BEDTIME.safeParse({ ...bedtime, reminder_minutes: 0 }).success).toBe(false);
    expect(
      PLANNER_BEDTIME.safeParse({ ...bedtime, sleep_sound: { kind: 'tone', id: 'x' } }).success,
    ).toBe(false);
    expect(PLANNER_BEDTIME.safeParse({ ...bedtime, extra: 1 }).success).toBe(false);
  });

  it('keeps the last sleep sound, timer and fade', () => {
    const sounds = {
      sound: { kind: 'noise', colour: 'white' },
      timer_minutes: 45,
      fade_seconds: 20,
    };
    expect(PLANNER_SLEEP_SOUNDS.safeParse(sounds).success).toBe(true);
    expect(
      PLANNER_SLEEP_SOUNDS.safeParse({ ...sounds, timer_minutes: null, sound: null }).success,
    ).toBe(true);
    expect(PLANNER_SLEEP_SOUNDS.safeParse({ ...sounds, fade_seconds: -1 }).success).toBe(false);
  });

  it('lists the assigned smart list', () => {
    expect(PLANNER_SMART_LISTS).toContain('assigned');
  });
});

describe('ring set, windows, sleep and sleep sound contracts', () => {
  const ring = {
    ringKey: 'a-1',
    kind: 'alarm',
    refId: ID,
    dueAt: NOW,
    sound: { kind: 'file', item_id: ID, name: 'wake.mp3', etag: 'e1' },
    rampSeconds: 30,
    vibrate: true,
    snoozeLimit: 2,
    challenge: { kind: 'steps', steps: 40 },
    label: null,
  };
  const window = {
    windDownAt: '2026-11-07T21:30:00Z',
    bedAt: '2026-11-07T22:00:00Z',
    wakeAt: '2026-11-08T06:00:00Z',
  };

  it('carries the resolved sound, limit, challenge and bedtime windows to the phone', () => {
    expect(
      PLANNER_PHONE_RING_SET.safeParse({ hash: 'h', rings: [ring], bedtimeWindows: [window] })
        .success,
    ).toBe(true);
    expect(
      PLANNER_PHONE_RING_SET.safeParse({
        hash: 'h',
        rings: [{ ...ring, sound: 'default' }],
        bedtimeWindows: [],
      }).success,
    ).toBe(false);
    expect(PLANNER_PHONE_RING_SET.safeParse({ hash: 'h', rings: [] }).success).toBe(false);
  });

  it('orders a window wind-down, bed, wake', () => {
    expect(PLANNER_BEDTIME_WINDOW.safeParse({ ...window, windDownAt: window.bedAt }).success).toBe(
      true,
    );
    expect(
      PLANNER_BEDTIME_WINDOW.safeParse({ ...window, windDownAt: '2026-11-07T22:30:00Z' }).success,
    ).toBe(false);
    expect(PLANNER_BEDTIME_WINDOW.safeParse({ ...window, wakeAt: window.bedAt }).success).toBe(
      false,
    );
  });

  it('describes nights and a missing average', () => {
    const night = {
      date: '2026-11-08',
      bed_at: window.bedAt,
      woke_at: window.wakeAt,
      asleep_minutes: 430,
    };
    expect(PLANNER_SLEEP.safeParse({ nights: [night], week_average_minutes: 410 }).success).toBe(
      true,
    );
    expect(PLANNER_SLEEP.safeParse({ nights: [], week_average_minutes: null }).success).toBe(true);
    expect(
      PLANNER_SLEEP.safeParse({
        nights: [{ ...night, woke_at: night.bed_at }],
        week_average_minutes: null,
      }).success,
    ).toBe(false);
    expect(PLANNER_SLEEP_QUERY.safeParse({ from: NOW, to: NOW }).success).toBe(true);
    expect(PLANNER_SLEEP_QUERY.safeParse({ from: NOW }).success).toBe(false);
  });

  it('plays with optional overrides and stops by itself', () => {
    expect(PLANNER_SLEEP_SOUND_BODY.safeParse({ action: 'play' }).success).toBe(true);
    expect(
      PLANNER_SLEEP_SOUND_BODY.safeParse({
        action: 'play',
        sound: { kind: 'noise', colour: 'pink' },
        timer_minutes: null,
        fade_seconds: 10,
        clientId: ID,
      }).success,
    ).toBe(true);
    expect(PLANNER_SLEEP_SOUND_BODY.safeParse({ action: 'stop' }).success).toBe(true);
    expect(
      PLANNER_SLEEP_SOUND_BODY.safeParse({
        action: 'stop',
        sound: { kind: 'noise', colour: 'pink' },
      }).success,
    ).toBe(false);
  });

  it('registers the three new endpoints once each', () => {
    const keys = Object.values(PLANNER_CLOCK_ENDPOINTS).map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const wanted of [
      'GET /api/planner/sleep',
      'GET /api/planner/radio',
      'POST /api/planner/sleep-sound',
    ]) {
      expect(keys).toContain(wanted);
    }
  });
});

describe('bedtime notices and signals', () => {
  const kinds = new Set(PLANNER_LIVE_NOTICES.map((notice) => notice.shape.type.value));

  it('adds the three notices to the live planner notices', () => {
    for (const type of ['planner_bedtime', 'planner_wind_down', 'planner_sleep_sound'] as const) {
      expect(kinds.has(type), type).toBe(true);
    }
  });

  it('plays a sleep sound with a sound and stops without one', () => {
    const play = {
      type: 'planner_sleep_sound',
      action: 'play',
      sound: { kind: 'noise', colour: 'white' },
      timerMinutes: 30,
      fadeSeconds: 10,
    };
    expect(PLANNER_SLEEP_SOUND_NOTICE.safeParse(play).success).toBe(true);
    expect(PLANNER_SLEEP_SOUND_NOTICE.safeParse({ ...play, action: 'stop' }).success).toBe(false);
    expect(
      PLANNER_SLEEP_SOUND_NOTICE.safeParse({
        ...play,
        action: 'stop',
        sound: null,
        timerMinutes: null,
      }).success,
    ).toBe(true);
    expect(PLANNER_SLEEP_SOUND_NOTICE.safeParse({ ...play, sound: null }).success).toBe(false);
  });

  it('has one signal schema per bedtime kind', () => {
    const base = {
      source: 'planner',
      subject: ID,
      field: null,
      value: true,
      previous: null,
      at: NOW,
      profileId: ID,
    };
    const data = {
      bedtime_reminder: { bedAt: NOW, minutesBefore: 30 },
      wind_down_started: { bedAt: NOW, wakeAt: NOW, minutes: 30 },
      wake_time: { wakeAt: NOW },
    };
    expect(PLANNER_BEDTIME_SIGNALS).toHaveLength(PLANNER_BEDTIME_SIGNAL_KINDS.length);
    for (const kind of PLANNER_BEDTIME_SIGNAL_KINDS) {
      const schema: z.ZodType | undefined = PLANNER_BEDTIME_SIGNALS.find(
        (candidate) => candidate.shape.kind.value === kind,
      );
      expect(schema?.safeParse({ ...base, kind, data: data[kind] }).success, kind).toBe(true);
      expect(schema?.safeParse({ ...base, kind, data: {} }).success, kind).toBe(false);
    }
  });
});
