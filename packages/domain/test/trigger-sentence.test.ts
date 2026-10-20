import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEVICE_CAPABILITY,
  SIGNAL_SOURCES,
  describeTrigger,
  rowSentence,
  timingSummary,
  triggerCatalogue,
  triggerLookup,
  signalTimingOf,
  type CatalogueDevice,
  type CatalogueInventory,
  type DeviceCapability,
  type SignalMatcher,
} from '../src';

function capability(
  key: string,
  label: string,
  value: Record<string, unknown>,
  access = 'read_write',
): DeviceCapability {
  return DEVICE_CAPABILITY.parse({ key, label, access, value });
}

const LAMP_ID = '00000000-0000-4000-8000-000000000001';
const DOOR_ID = '00000000-0000-4000-8000-000000000002';
const CAMERA_ID = '00000000-0000-4000-8000-000000000003';
const PERSON_ID = '00000000-0000-4000-8000-000000000004';

const LAMP: CatalogueDevice = {
  id: LAMP_ID,
  name: 'Reading lamp',
  roomId: 'room-living',
  kind: 'light',
  model: 'lamp.one',
  capabilities: [
    capability('power', 'Power', { kind: 'boolean' }),
    capability('brightness', 'Brightness', {
      kind: 'number',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    }),
  ],
};

const DOOR: CatalogueDevice = {
  id: DOOR_ID,
  name: 'Back door',
  roomId: 'room-hall',
  kind: 'sensor',
  model: 'door.one',
  capabilities: [capability('contact', 'Door', { kind: 'boolean' }, 'read')],
};

const CAMERA: CatalogueDevice = {
  id: CAMERA_ID,
  name: 'Driveway camera',
  roomId: null,
  kind: 'camera',
  model: 'cam.one',
  capabilities: [capability('privacy_mode', 'Privacy', { kind: 'boolean' })],
};

const INVENTORY: CatalogueInventory = {
  devices: [LAMP, DOOR, CAMERA],
  rooms: [{ id: 'room-living', name: 'Living room' }],
  people: [{ id: PERSON_ID, name: 'Alex' }],
  chats: [],
};

const LOOKUP = triggerLookup(SIGNAL_SOURCES, INVENTORY);

function say(fields: Partial<SignalMatcher> & Pick<SignalMatcher, 'source' | 'kind'>): string {
  return describeTrigger(fields, LOOKUP);
}

const LAMP_ON = {
  source: 'device',
  kind: 'state',
  subject: LAMP_ID,
  field: 'power',
  test: { is: 'eq', to: true },
} as const;

const BRIGHT = {
  source: 'device',
  kind: 'state',
  subject: LAMP_ID,
  field: 'brightness',
  test: { is: 'gt', to: 80 },
} as const;

describe('describeTrigger for a device value', () => {
  it('uses the verb of the value for on-off things', () => {
    expect(say(LAMP_ON)).toBe('Reading lamp turns on');
    expect(say({ ...LAMP_ON, test: { is: 'eq', to: false } })).toBe('Reading lamp turns off');
    expect(
      say({
        source: 'device',
        kind: 'state',
        subject: DOOR_ID,
        field: 'contact',
        test: { is: 'eq', to: true },
      }),
    ).toBe('Back door opens');
  });

  it('words each test in plain terms', () => {
    expect(say({ ...BRIGHT, test: { is: 'changed' } })).toBe('Reading lamp brightness changes');
    expect(say(BRIGHT)).toBe('Reading lamp brightness rises above 80%');
    expect(say({ ...BRIGHT, test: { is: 'gte', to: 80 } })).toBe(
      'Reading lamp brightness reaches 80%',
    );
    expect(say({ ...BRIGHT, test: { is: 'lt', to: 20 } })).toBe(
      'Reading lamp brightness falls below 20%',
    );
    expect(say({ ...BRIGHT, test: { is: 'lte', to: 20 } })).toBe(
      'Reading lamp brightness falls to 20%',
    );
    expect(say({ ...BRIGHT, test: { is: 'eq', to: 50 } })).toBe(
      'Reading lamp brightness becomes 50%',
    );
    expect(say({ ...BRIGHT, test: { is: 'ne', to: 50 } })).toBe(
      'Reading lamp brightness stops being 50%',
    );
    expect(say({ ...BRIGHT, test: { is: 'between', min: 20, max: 60 } })).toBe(
      'Reading lamp brightness is between 20% and 60%',
    );
    expect(say({ ...BRIGHT, test: { is: 'in', to: [10, 20] } })).toBe(
      'Reading lamp brightness is 10% or 20%',
    );
  });

  it('says how long it stays, with the word of the state', () => {
    expect(say({ ...LAMP_ON, holdSeconds: 1800 })).toBe(
      'Reading lamp turns on and stays on for 30 minutes',
    );
    expect(say({ ...BRIGHT, holdSeconds: 300 })).toBe(
      'Reading lamp brightness rises above 80% and stays that way for 5 minutes',
    );
  });

  it('counts, averages and waits', () => {
    expect(
      say({ ...LAMP_ON, window: { of: 'count', seconds: 600 }, test: { is: 'gte', to: 5 } }),
    ).toBe('Reading lamp power changes 5 times in 10 minutes');
    expect(say({ ...BRIGHT, window: { of: 'avg', seconds: 600 } })).toBe(
      'Reading lamp brightness rises above 80%, on average over 10 minutes',
    );
    expect(say({ ...BRIGHT, window: { of: 'rate', seconds: 3600 } })).toBe(
      'Reading lamp brightness rises above 80%, per minute over 1 hour',
    );
    expect(say({ ...BRIGHT, debounceSeconds: 30, cooldownSeconds: 3600 })).toBe(
      'Reading lamp brightness rises above 80%, once it settles for 30 seconds, at most every 1 hour',
    );
  });

  it('goes quiet, comes first and rearms', () => {
    expect(
      say({
        source: 'device',
        kind: 'state',
        subject: LAMP_ID,
        field: 'brightness',
        silentSeconds: 7200,
      }),
    ).toBe('Reading lamp brightness, nothing for 2 hours');
    expect(say({ ...LAMP_ON, first: 'day' })).toBe(
      'Reading lamp turns on, for the first time today',
    );
    expect(say({ ...LAMP_ON, first: 'week' })).toBe(
      'Reading lamp turns on, for the first time this week',
    );
    expect(say({ ...LAMP_ON, first: 'ever' })).toBe(
      'Reading lamp turns on, for the first time ever',
    );
    expect(say({ ...BRIGHT, rearm: 70 })).toBe(
      'Reading lamp brightness rises above 80%, again once below 70',
    );
  });

  it('names an unknown device and any device', () => {
    expect(say({ ...LAMP_ON, subject: '00000000-0000-4000-8000-0000000000ff' })).toBe(
      'a removed device turns on',
    );
    expect(
      say({ source: 'device', kind: 'state', field: 'power', test: { is: 'eq', to: true } }),
    ).toBe('Any device turns on');
    expect(say({ source: 'device', kind: 'state' })).toBe('A device value changes');
  });
});

describe('describeTrigger for moments', () => {
  const PERSON = { source: 'event', kind: 'person', subject: CAMERA_ID } as const;

  it('says who reported what', () => {
    expect(say(PERSON)).toBe('Driveway camera reports “Person seen”');
    expect(say({ source: 'event', kind: 'person' })).toBe('Any device reports “Person seen”');
    expect(
      say({ source: 'event', kind: 'sound', subject: CAMERA_ID, match: { detection: 'baby_cry' } }),
    ).toBe('Driveway camera reports “Baby crying”');
  });

  it('counts and goes quiet', () => {
    expect(
      say({ ...PERSON, window: { of: 'count', seconds: 600 }, test: { is: 'gte', to: 3 } }),
    ).toBe('Person seen 3 times in 10 minutes for Driveway camera');
    expect(say({ ...PERSON, silentSeconds: 7200 })).toBe(
      'Driveway camera reports “Person seen”, nothing for 2 hours',
    );
    expect(say({ ...PERSON, first: 'day' })).toBe(
      'Driveway camera reports “Person seen”, for the first time today',
    );
  });

  it('names the room and the other details a match holds', () => {
    expect(
      say({
        source: 'device',
        kind: 'lifecycle',
        match: { change: 'added', roomId: 'room-living' },
      }),
    ).toBe(
      'A device is added, removed or changed matching What happened to the device: Added to the home, Room: Living room',
    );
  });
});

describe('describeTrigger for other signals', () => {
  it('words an on-off kind with its own words', () => {
    expect(
      say({ source: 'device', kind: 'online', subject: LAMP_ID, test: { is: 'eq', to: false } }),
    ).toBe('Devices: A device goes online or offline for Reading lamp becomes offline');
    expect(
      say({
        source: 'computer',
        kind: 'app_open',
        subject: LAMP_ID,
        match: { app: 'Firefox' },
        test: { is: 'eq', to: true },
        holdSeconds: 1800,
      }),
    ).toBe(
      'Computers: App on a computer for Reading lamp becomes open matching App name: Firefox and stays open for 30 minutes',
    );
  });

  it('words a measured value with its unit and the person', () => {
    expect(
      say({
        source: 'health',
        kind: 'body_reading',
        subject: PERSON_ID,
        field: 'weight_kg',
        test: { is: 'gt', to: 80 },
      }),
    ).toBe('Health: Weight for Alex rises above 80 kg');
  });
});

describe('timingSummary', () => {
  it('lists only the timing, in short clauses', () => {
    const timing = signalTimingOf({
      ...BRIGHT,
      holdSeconds: 300,
      cooldownSeconds: 60,
      first: 'day',
    });
    expect(timingSummary(timing)).toBe(
      'stays that way for 5 minutes, at most every 1 minute, for the first time today',
    );
    expect(timingSummary(signalTimingOf({ source: 'device', kind: 'state' }))).toBe('');
  });
});

describe('rowSentence', () => {
  it('gives every row of the catalogue a plain sentence', () => {
    const catalogue = triggerCatalogue(SIGNAL_SOURCES, INVENTORY, []);
    for (const row of catalogue.rows) {
      const sentence = rowSentence(row, catalogue);
      expect(sentence, row.id).not.toBe('');
      expect(sentence, row.id).not.toMatch(/undefined|\[object|NaN/);
    }
  });

  it('says what a device value row is about', () => {
    const catalogue = triggerCatalogue(SIGNAL_SOURCES, INVENTORY, []);
    const sentenceOf = (field: string): string | undefined => {
      const row = catalogue.rows.find(
        (entry) => entry.subject === LAMP_ID && entry.field === field,
      );
      return row === undefined ? undefined : rowSentence(row, catalogue);
    };
    expect(sentenceOf('power')).toBe('Reading lamp turns on');
    expect(sentenceOf('brightness')).toBe('Reading lamp brightness changes');
  });
});

describe('describeTrigger over random triggers', () => {
  const test = fc.oneof(
    fc.constant({ is: 'changed' as const }),
    fc.record({
      is: fc.constantFrom('eq' as const, 'ne' as const),
      to: fc.integer({ min: 0, max: 100 }),
    }),
    fc.record({
      is: fc.constantFrom('gt' as const, 'gte' as const, 'lt' as const, 'lte' as const),
      to: fc.integer({ min: 0, max: 100 }),
    }),
    fc.record({ is: fc.constant('between' as const), min: fc.constant(10), max: fc.constant(90) }),
    fc.record({ is: fc.constant('in' as const), to: fc.constant<number[]>([5, 15]) }),
  );
  const seconds = fc.option(fc.integer({ min: 1, max: 86_400 }), { nil: undefined });

  it('always makes a sentence that starts with the device and names no placeholder', () => {
    fc.assert(
      fc.property(test, seconds, seconds, fc.boolean(), (chosen, hold, cooldown, first) => {
        const text = describeTrigger(
          {
            source: 'device',
            kind: 'state',
            subject: LAMP_ID,
            field: 'brightness',
            test: chosen,
            ...(hold === undefined ? {} : { holdSeconds: hold }),
            ...(cooldown === undefined ? {} : { cooldownSeconds: cooldown }),
            ...(first ? { first: 'day' as const } : {}),
          },
          LOOKUP,
        );
        expect(text.startsWith('Reading lamp brightness ')).toBe(true);
        expect(text).not.toMatch(/undefined|\[object|NaN/);
        expect(text.includes('stays that way for')).toBe(hold !== undefined);
        expect(text.endsWith('for the first time today')).toBe(first);
      }),
    );
  });
});
