import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  CAPABILITY_CATALOGUE,
  LIVE_NOTICE,
  PHONE_ACTION,
  PHONE_ACTION_PUSH,
  PHONE_DETAIL,
  PHONE_DETAIL_SECTION_NAMES,
  PHONE_DETAIL_UPDATE,
  PHONE_FEATURE_SUPPORTS,
  PHONE_REPORT,
  PHONE_VALUES,
  mergePhoneDetail,
  phoneActionAllowed,
  phoneDetailFor,
  phoneDetailPartsFor,
  phoneEventFor,
  splitPhoneDetail,
  stampPhoneDetail,
  type EventRow,
  phoneTierOf,
  phoneValueHidden,
  phoneValuesFor,
  phoneViewOf,
  type PhoneDetail,
  type PhoneDetailUpdate,
} from '../src';

const AT = '2026-10-18T10:00:00.000Z';
const LATER = '2026-10-18T10:05:00.000Z';
const DEVICE = '3f2f4a0e-5b64-4f55-9a3e-9c1b0f6a7d11';
const origin = { source: 'assistant', client: 'Desk assistant' } as const;
const OTHER_DEVICE = '9c1b0f6a-7d11-4f55-9a3e-3f2f4a0e5b64';

const FULL: PhoneDetailUpdate = {
  power: {
    level: 62,
    voltageMv: 4100,
    currentMa: 1800,
    temperatureC: 31.5,
    health: 'good',
    cycles: 212,
    charger: 'wireless',
    fullAt: '2026-10-18T18:40:00.000Z',
    memory: { totalBytes: 12e9, availableBytes: 5e9 },
  },
  sound: {
    streams: { media: 40, ring: 70, alarm: 80, notification: 50, call: 60 },
    output: { kind: 'bluetooth', name: 'Galaxy Buds3' },
    media: {
      title: 'Song',
      artist: 'Artist',
      app: 'com.spotify.music',
      appLabel: 'Spotify',
      state: 'playing',
      positionMs: 1000,
      durationMs: 200000,
    },
  },
  screen: {
    brightness: 64,
    auto: true,
    timeoutSeconds: 60,
    fold: 'open',
    writable: true,
    usage: {
      unlocksToday: 41,
      screenMinutesByDay: Array.from({ length: 7 }, (_, index) => ({
        day: `2026-10-${String(12 + index)}`,
        minutes: 100 + index,
      })),
    },
  },
  network: {
    kind: 'wifi',
    wifi: { ssid: 'Home', rssiDbm: -52, bars: 4, linkMbps: 866, bandGhz: 5 },
    cellular: { bars: 3, generation: '5g', operator: 'Telstra' },
    vpn: false,
    metered: false,
    airplane: false,
    data: {
      today: { wifiBytes: 1e9, mobileBytes: 2e8 },
      month: { wifiBytes: 3e10, mobileBytes: 4e9 },
    },
  },
  connections: {
    bluetooth: [{ name: 'Galaxy Buds3', kind: 'headset', batteryPercent: 80 }],
  },
  storage: {
    totalBytes: 256e9,
    freeBytes: 41e9,
    parts: [{ kind: 'apps', bytes: 60e9 }],
    apps: [{ package: 'com.example.big', label: 'Big', bytes: 5e9 }],
  },
  apps: {
    installedCount: 2,
    installed: [
      { package: 'com.a', label: 'A', iconHash: 'a'.repeat(64) },
      { package: 'com.b', label: 'B', iconHash: null },
    ],
    usage: [
      {
        package: 'com.a',
        minutesToday: 30,
        minutesByDay: [1, 2, 3, 4, 5, 6, 30],
        lastUsedAt: AT,
      },
    ],
    front: 'com.a',
  },
  notifications: {
    count: 4,
    apps: [{ package: 'com.a', label: 'A', count: 4 }],
    items: [{ key: 'k1', package: 'com.a', title: 'Hello', at: AT }],
  },
  alarm: { nextAt: '2026-10-19T06:30:00.000Z', appLabel: 'Clock' },
};

const STORED: PhoneDetail = stampPhoneDetail(FULL, AT);

describe('phone report contract', () => {
  it('still parses a report from an older phone without detail or features', () => {
    const report = PHONE_REPORT.parse({ at: AT, values: { battery: 50 }, events: [] });
    expect(report.detail).toBeUndefined();
    expect(report.features).toBeUndefined();
  });

  it('carries features as ready, needing a named permission, or not on this phone', () => {
    expect(
      PHONE_FEATURE_SUPPORTS.parse([
        {
          feature: 'usage',
          state: 'needs_permission',
          permission: 'android_usage_access',
          reason: 'x',
        },
        { feature: 'torch_strength', state: 'ready' },
        { feature: 'fold', state: 'unsupported', reason: 'One screen' },
      ]),
    ).toHaveLength(3);
    expect(
      PHONE_FEATURE_SUPPORTS.safeParse([
        { feature: 'fold', state: 'ready' },
        { feature: 'fold', state: 'ready' },
      ]).success,
    ).toBe(false);
    expect(
      PHONE_FEATURE_SUPPORTS.safeParse([
        { feature: 'usage', state: 'needs_permission', reason: 'x' },
      ]).success,
    ).toBe(false);
  });

  it('parses every detail section a phone can report and a partial update of one', () => {
    expect(PHONE_REPORT.parse({ at: AT, values: {}, events: [], detail: FULL }).detail).toEqual(
      FULL,
    );
    expect(splitPhoneDetail(FULL)).toEqual({ update: FULL, invalid: [] });
    expect(PHONE_DETAIL_UPDATE.safeParse({ alarm: FULL.alarm }).success).toBe(true);
    expect(PHONE_DETAIL_UPDATE.safeParse({}).success).toBe(false);
    expect(PHONE_DETAIL_UPDATE.safeParse({ power: { level: 101 } }).success).toBe(false);
  });

  it('keeps every section name in the update and in the stored detail', () => {
    expect(Object.keys(FULL).sort()).toEqual([...PHONE_DETAIL_SECTION_NAMES].sort());
    expect(Object.keys(PHONE_DETAIL.shape).sort()).toEqual([...PHONE_DETAIL_SECTION_NAMES].sort());
  });

  it('accepts every new value with its own range and no longer lists', () => {
    const values = {
      charger: 'usb',
      charge_full_at: null,
      battery_temperature: 31.5,
      power_save: false,
      thermal_state: 'light',
      ring_volume: 70,
      alarm_volume: 80,
      notification_volume: 50,
      audio_output: 'car',
      in_call: false,
      brightness: 64,
      auto_brightness: true,
      flashlight: 'off',
      ringing: false,
      storage_free: 41e9,
      notification_count: 3,
      next_alarm: null,
      signal_strength: 4,
    };
    expect(PHONE_VALUES.parse(values)).toEqual(values);
    expect(PHONE_VALUES.safeParse({ signal_strength: 5 }).success).toBe(false);
    expect(PHONE_VALUES.safeParse({ flashlight: 'toggle' }).success).toBe(false);
    expect(PHONE_VALUES.safeParse({ charger: 'solar' }).success).toBe(false);
  });

  it('catalogues every new value so automations and the AI see it', () => {
    for (const key of Object.keys(PHONE_VALUES.shape)) {
      if (key === 'phone_context' || key === 'context_confidence' || key === 'place') continue;
      expect(key in CAPABILITY_CATALOGUE, key).toBe(true);
    }
  });
});

describe('phone actions', () => {
  it('validates the new actions', () => {
    const actions = [
      { type: 'set_brightness', percent: 40 },
      { type: 'set_auto_brightness', on: false },
      { type: 'set_timeout', seconds: 120 },
      { type: 'dismiss_notification', target: { by: 'key', key: 'k1' } },
      { type: 'dismiss_notification', target: { by: 'app', app: 'com.a' } },
      { type: 'seek', positionMs: 5000 },
      { type: 'set_flashlight_level', percent: 50 },
      { type: 'launch_app', app: 'com.a' },
    ];
    for (const action of actions) expect(PHONE_ACTION.parse(action)).toEqual(action);
    expect(PHONE_ACTION.safeParse({ type: 'set_timeout', seconds: 45 }).success).toBe(false);
    expect(PHONE_ACTION.safeParse({ type: 'set_brightness', percent: 101 }).success).toBe(false);
    expect(PHONE_ACTION.safeParse({ type: 'set_flashlight_level', percent: 0 }).success).toBe(
      false,
    );
    expect(PHONE_ACTION.safeParse({ type: 'seek', positionMs: -1 }).success).toBe(false);
    expect(
      PHONE_ACTION.safeParse({ type: 'dismiss_notification', target: { by: 'app' } }).success,
    ).toBe(false);
  });

  it('rejects live mode from the public action endpoint but lets the hub push it', () => {
    const live = { type: 'live', on: true };
    expect(API_ENDPOINTS.runPhoneAction.body.safeParse(live).success).toBe(false);
    expect(PHONE_ACTION.safeParse(live).success).toBe(false);
    expect(
      PHONE_ACTION_PUSH.parse({ requestId: DEVICE, action: live, origin, expiresAt: LATER }).action,
    ).toEqual(live);
    expect(
      PHONE_ACTION_PUSH.parse({ requestId: DEVICE, action: { type: 'ring', on: true }, origin })
        .action,
    ).toEqual({ type: 'ring', on: true });
  });

  it('refuses a pushed action that does not say who asked', () => {
    expect(
      PHONE_ACTION_PUSH.safeParse({ requestId: DEVICE, action: { type: 'ring', on: true } })
        .success,
    ).toBe(false);
  });

  it('declares the detail, icon endpoints and the live detail notice', () => {
    expect(API_ENDPOINTS.readPhoneDetail.path).toBe('/api/phones/:deviceId/detail');
    expect(
      API_ENDPOINTS.uploadPhoneIcon.body.safeParse({ hash: 'a'.repeat(64), webpBase64: 'AAAA' })
        .success,
    ).toBe(true);
    expect(
      API_ENDPOINTS.uploadPhoneIcon.body.safeParse({ hash: 'zz', webpBase64: 'AAAA' }).success,
    ).toBe(false);
    const notice = {
      type: 'phone_detail',
      deviceId: DEVICE,
      parts: { alarm: { ...FULL.alarm, at: AT } },
    };
    expect(LIVE_NOTICE.parse(notice)).toEqual(notice);
    expect(LIVE_NOTICE.safeParse({ ...notice, parts: {} }).success).toBe(false);
  });

  it('refuses an icon request whose hash is not a SHA-256 in hex', () => {
    const params = API_ENDPOINTS.readPhoneIcon.params;
    expect(params.safeParse({ hash: 'a'.repeat(64) }).success).toBe(true);
    expect(params.safeParse({ hash: 'a'.repeat(63) }).success).toBe(false);
    expect(params.safeParse({ hash: 'A'.repeat(64) }).success).toBe(false);
    expect(params.safeParse({ hash: '../etc' }).success).toBe(false);
  });

  it('reads detail by named sections only', () => {
    const query = API_ENDPOINTS.readPhoneDetail.query;
    expect(query.parse({ sections: 'power,alarm' }).sections).toEqual(['power', 'alarm']);
    expect(query.parse({}).sections).toBeUndefined();
    expect(query.safeParse({ sections: 'power,secrets' }).success).toBe(false);
    expect(query.safeParse({ sections: '' }).success).toBe(false);
  });
});

describe('merging detail', () => {
  it('stamps every section of an update with the report time', () => {
    const stamped = stampPhoneDetail({ alarm: FULL.alarm, power: FULL.power }, LATER);
    expect(stamped.alarm?.at).toBe(LATER);
    expect(stamped.power?.at).toBe(LATER);
    expect(Object.keys(stamped).sort()).toEqual(['alarm', 'power']);
  });

  it('replaces only the sections the parts carry and keeps each section its own time', () => {
    const parts = stampPhoneDetail({ alarm: { nextAt: null, appLabel: null } }, LATER);
    const next = mergePhoneDetail(STORED, parts);
    expect(next.alarm).toEqual({ nextAt: null, appLabel: null, at: LATER });
    expect(next.power).toEqual({ ...FULL.power, at: AT });
  });
});

describe('splitting a reported detail', () => {
  it('keeps the valid sections and names each invalid one with its problem', () => {
    const split = splitPhoneDetail({
      power: { ...FULL.power, level: 101 },
      alarm: FULL.alarm,
      unknown: { anything: 1 },
    });
    expect(split.update).toEqual({ alarm: FULL.alarm });
    expect(split.invalid).toHaveLength(1);
    expect(split.invalid[0]).toMatchObject({ section: 'power' });
    expect(split.invalid[0]?.issue).toContain('level');
  });

  it('has no update when nothing valid is left or nothing was reported', () => {
    expect(splitPhoneDetail({ power: { level: 101 } }).update).toBeUndefined();
    expect(splitPhoneDetail({})).toEqual({ update: undefined, invalid: [] });
  });
});

describe('who sees what of a phone', () => {
  const base = {
    phoneProfileId: 'p1',
    phoneDeviceId: DEVICE,
    viewerProfileId: 'p1',
    viewerRole: 'member',
    localDeviceId: null,
  } as const;

  it('puts the phone person first, then the owner, then any other member', () => {
    expect(phoneTierOf(base)).toBe('person');
    expect(phoneTierOf({ ...base, viewerProfileId: 'p2', viewerRole: 'owner' })).toBe('owner');
    expect(phoneTierOf({ ...base, viewerProfileId: 'p2' })).toBe('member');
    expect(phoneTierOf({ ...base, viewerRole: 'owner' })).toBe('person');
  });

  it('keeps your phone and this phone apart', () => {
    const away = phoneViewOf(base);
    expect(away).toMatchObject({ own: true, here: false, canRing: true, canOpenLink: true });
    const here = phoneViewOf({ ...base, localDeviceId: DEVICE });
    expect(here).toMatchObject({ own: true, here: true, canRing: false, canOpenLink: false });
    const elsewhere = phoneViewOf({ ...base, viewerProfileId: 'p2', localDeviceId: OTHER_DEVICE });
    expect(elsewhere).toMatchObject({ tier: 'member', own: false, here: false, canAct: false });
    const ownerOnOther = phoneViewOf({ ...base, viewerProfileId: 'p2', viewerRole: 'owner' });
    expect(ownerOnOther).toMatchObject({
      tier: 'owner',
      own: false,
      canAct: true,
      canRing: true,
      canOpenLink: false,
    });
  });

  it('lets a member look only and only the phone person dismiss notifications', () => {
    const dismiss = { type: 'dismiss_notification', target: { by: 'app', app: 'com.a' } } as const;
    expect(phoneActionAllowed({ type: 'ring', on: true }, 'member')).toBe(false);
    expect(phoneActionAllowed({ type: 'ring', on: true }, 'owner')).toBe(true);
    expect(phoneActionAllowed({ type: 'launch_app', app: 'com.a' }, 'owner')).toBe(false);
    expect(phoneActionAllowed({ type: 'launch_app', app: 'com.a' }, 'person')).toBe(true);
    expect(phoneActionAllowed({ type: 'launch_app', app: 'com.a' }, 'member')).toBe(false);
    expect(phoneActionAllowed(dismiss, 'owner')).toBe(false);
    expect(phoneActionAllowed(dismiss, 'person')).toBe(true);
  });

  it('lets only the phone person see the screen of a phone', () => {
    const shot = { type: 'screenshot' } as const;
    expect(phoneActionAllowed(shot, 'person')).toBe(true);
    expect(phoneActionAllowed(shot, 'owner')).toBe(false);
    expect(phoneActionAllowed(shot, 'member')).toBe(false);
  });

  it('hides personal values by tier and never touches the original', () => {
    const values = {
      battery: 50,
      screen_time_today: 190,
      notification_count: 4,
      storage_free: 5,
      phone_context: 'walking',
      context_confidence: 80,
      place: 'Home',
      now_playing: 'Song',
      playback: 'playing',
    } as const;
    expect(phoneValuesFor(values, 'person')).toEqual(values);
    expect(phoneValuesFor(values, 'owner')).toEqual({
      battery: 50,
      screen_time_today: 190,
      notification_count: 4,
      storage_free: 5,
      phone_context: 'walking',
      context_confidence: 80,
      playback: 'playing',
    });
    expect(phoneValuesFor(values, 'member')).toEqual({ battery: 50, playback: 'playing' });
    expect(values.place).toBe('Home');
  });

  it('says for one key whether a tier may not see it', () => {
    expect(phoneValueHidden('now_playing', 'owner')).toBe(true);
    expect(phoneValueHidden('screen_time_today', 'owner')).toBe(false);
    expect(phoneValueHidden('screen_time_today', 'member')).toBe(true);
    expect(phoneValueHidden('now_playing', 'person')).toBe(false);
    expect(phoneValueHidden('battery', 'member')).toBe(false);
  });

  it('gives the phone person everything', () => {
    expect(phoneDetailFor(STORED, 'person')).toEqual(STORED);
  });

  it('gives the owner counts and totals but no names, titles, Wi-Fi name or app lists', () => {
    const owner = phoneDetailFor(STORED, 'owner');
    expect(owner.sound?.media).toMatchObject({
      title: null,
      artist: null,
      app: null,
      state: 'playing',
    });
    expect(owner.sound?.output).toEqual({ kind: 'bluetooth', name: null });
    expect(owner.network?.wifi?.ssid).toBeNull();
    expect(owner.network?.data).toEqual(FULL.network?.data);
    expect(owner.connections?.bluetooth).toEqual([
      { name: null, kind: 'headset', batteryPercent: 80 },
    ]);
    expect(owner.storage).toMatchObject({ freeBytes: 41e9, apps: [] });
    expect(owner.apps).toMatchObject({ installedCount: 2, installed: [], usage: [], front: null });
    expect(owner.notifications).toMatchObject({ count: 4, apps: [], items: null });
    expect(owner.screen?.usage).toEqual(FULL.screen?.usage);
    expect(JSON.stringify(owner)).not.toContain('Hello');
    expect(JSON.stringify(owner)).not.toContain('Home');
    expect(JSON.stringify(owner)).not.toContain('Spotify');
  });

  it('gives another member battery, sound, signal and brightness only', () => {
    const member = phoneDetailFor(STORED, 'member');
    expect(Object.keys(member).sort()).toEqual(['alarm', 'network', 'power', 'screen', 'sound']);
    expect(member.screen).toMatchObject({ brightness: 64, usage: null });
    expect(member.network).toMatchObject({ kind: 'wifi', data: null });
    expect(member.network?.wifi?.ssid).toBeNull();
    expect(member.sound?.media?.title).toBeNull();
    expect(JSON.stringify(member)).not.toContain('Telstra Home');
  });

  it('cuts a live update the same way and drops one that nothing is left of', () => {
    const parts = (names: readonly (keyof PhoneDetailUpdate)[]): PhoneDetail =>
      stampPhoneDetail(Object.fromEntries(names.map((name) => [name, section(name)])), AT);
    const all = stampPhoneDetail(FULL, AT);
    expect(phoneDetailPartsFor(all, 'person')).toBe(all);
    expect(phoneDetailPartsFor(parts(['notifications']), 'owner')?.notifications).toMatchObject({
      count: 4,
      apps: [],
      items: null,
    });
    expect(phoneDetailPartsFor(parts(['notifications']), 'member')).toBeNull();
    expect(phoneDetailPartsFor(parts(['storage', 'apps']), 'member')).toBeNull();
    expect(phoneDetailPartsFor(parts(['power']), 'member')).toEqual(parts(['power']));
  });

  it('keeps each section its own time when a live update is cut', () => {
    const mixed = {
      ...stampPhoneDetail({ power: FULL.power }, AT),
      ...stampPhoneDetail({ alarm: FULL.alarm }, LATER),
    };
    const cut = phoneDetailPartsFor(mixed, 'member');
    expect(cut?.power?.at).toBe(AT);
    expect(cut?.alarm?.at).toBe(LATER);
  });
});

describe('who sees the place events of a phone', () => {
  const event = (kind: EventRow['kind'], details: EventRow['details']): EventRow => ({
    id: DEVICE,
    device_id: OTHER_DEVICE,
    kind,
    occurred_at: AT,
    details,
    acknowledged_at: null,
    created_at: AT,
  });

  it('gives the phone person every event', () => {
    const arrived = event('place_arrived', { place: 'Home' });
    expect(phoneEventFor(arrived, 'person')).toBe(arrived);
  });

  it('drops arriving and leaving for the owner and any member', () => {
    expect(phoneEventFor(event('place_arrived', { place: 'Home' }), 'owner')).toBeNull();
    expect(phoneEventFor(event('place_left', { place: 'Home' }), 'member')).toBeNull();
  });

  it('gives the owner a context change and a parking without the place', () => {
    const changed = event('phone_context_changed', {
      from: 'still',
      to: 'walking',
      confidence: 80,
      place: 'Gym',
    });
    expect(phoneEventFor(changed, 'owner')?.details).toEqual({
      from: 'still',
      to: 'walking',
      confidence: 80,
      place: null,
    });
    expect(phoneEventFor(event('parked', { place: 'Gym' }), 'owner')?.details).toEqual({
      place: null,
    });
    expect(changed.details['place']).toBe('Gym');
  });

  it('drops the context change and parking for another member', () => {
    expect(phoneEventFor(event('phone_context_changed', { place: null }), 'member')).toBeNull();
    expect(phoneEventFor(event('parked', { place: null }), 'member')).toBeNull();
  });

  it('leaves events that carry no place alone', () => {
    const unlocked = event('phone_unlocked', {});
    expect(phoneEventFor(unlocked, 'member')).toBe(unlocked);
  });
});

function section<K extends keyof PhoneDetailUpdate>(name: K): NonNullable<PhoneDetailUpdate[K]> {
  const found = FULL[name];
  if (found === undefined) throw new Error(`fixture section ${name} missing`);
  return found;
}
