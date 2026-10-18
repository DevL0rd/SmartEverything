import { describe, expect, it } from 'vitest';
import {
  SHELLY_DEVICE,
  SHELLY_TRACKS,
  shellyComponentCapability,
  type ShellyDevice,
} from '@smarteverything/shelly';
import {
  liveSensor,
  readingKey,
  trackedSensor,
  readingKeys,
  type PresenceReadings,
} from './presence-readings';

const NONE: PresenceReadings = { values: {}, observedAt: null };

function readingsOf(
  values: PresenceReadings['values'],
  observedAt: string | null = null,
): PresenceReadings {
  return { values, observedAt };
}

function sensorFixture(): ShellyDevice {
  return SHELLY_DEVICE.parse({
    id: 'radar-1',
    externalId: 'shelly-presence:radar-1',
    name: 'Hall radar',
    address: 'http://127.0.0.1',
    info: {
      id: 'radar-1',
      mac: 'AABBCC',
      model: 'S4SN-0U61X',
      gen: 4,
      fw_id: 'x',
      ver: '1',
      app: 'presence',
      auth_en: false,
    },
    connection: { state: 'online', reason: null },
    observedAt: null,
    config: { enable: true, main_zone: 'presencezone:200' },
    status: {},
    revision: 1,
    zones: [
      {
        key: 'presencezone:200',
        externalId: 'shelly-presence:radar-1',
        generation: 0,
        main: true,
        config: { id: 200, enable: true, area: [] },
        status: { id: 200, value: false, num_objects: 0 },
      },
      {
        key: 'presencezone:201',
        externalId: 'shelly-presence:radar-1:201:0',
        generation: 0,
        main: false,
        config: { id: 201, enable: true, area: [] },
        status: { id: 201, value: false, num_objects: 0 },
      },
    ],
    light: [{ config: { id: 0 }, status: { id: 0, lux: 5, illumination: 'dark' } }],
    tracks: [],
    tracksAt: null,
    methods: [],
    componentKeys: [],
    features: [],
    components: [],
    discoveredBthome: [],
  });
}

describe('live Shelly readings', () => {
  it('returns the inventory sensor itself when nothing is live', () => {
    const sensor = sensorFixture();
    expect(liveSensor(sensor, NONE)).toBe(sensor);
  });

  it('overlays occupancy, count and light from device state onto the right zone', () => {
    const sensor = sensorFixture();
    const zone = sensor.zones.find((item) => !item.main);
    const live = liveSensor(
      sensor,
      readingsOf({
        [readingKey(sensor.externalId, 'occupancy')]: true,
        [readingKey(zone?.externalId ?? '', 'object_count')]: 3,
        [readingKey(sensor.externalId, 'illuminance')]: 120,
        [readingKey(sensor.externalId, 'illumination')]: 'bright',
      }),
    );
    expect(live.zones.find((item) => item.main)?.status).toMatchObject({
      value: true,
      num_objects: 0,
    });
    expect(live.zones.find((item) => !item.main)?.status).toMatchObject({
      value: false,
      num_objects: 3,
    });
    expect(live.light[0]?.status).toMatchObject({ lux: 120, illumination: 'bright' });
    expect(live.zones.find((item) => item.main)).not.toBe(sensor.zones.find((item) => item.main));
  });

  it('ignores readings of the wrong type and keeps untouched zones identical', () => {
    const sensor = sensorFixture();
    const live = liveSensor(
      sensor,
      readingsOf({
        [readingKey(sensor.externalId, 'occupancy')]: 'yes',
        [readingKey(sensor.externalId, 'illumination')]: 5,
      }),
    );
    expect(live).toBe(sensor);
  });

  it('adds the tracks of this sensor from the live frame and drops them without one', () => {
    const sensor = sensorFixture();
    const frame = SHELLY_TRACKS.parse({
      devices: [
        {
          id: sensor.id,
          tracks: [{ id: 1, x: 1, y: 2, z: 0.5 }],
          tracksAt: '2026-10-16T10:00:00.000Z',
        },
        { id: 'other', tracks: [], tracksAt: null },
      ],
    });
    const live = trackedSensor(sensor, frame);
    expect(live.tracks).toHaveLength(1);
    expect(live.tracksAt).toBe('2026-10-16T10:00:00.000Z');
    expect(trackedSensor(live, null).tracks).toHaveLength(0);
    expect(trackedSensor(sensor, null)).toBe(sensor);
  });

  it('shows the newest reading time as last observed when it is newer than the inventory', () => {
    const sensor = { ...sensorFixture(), observedAt: '2026-10-16T10:00:00.000Z' };
    const newer = liveSensor(sensor, readingsOf({}, '2026-10-16T10:00:05.000Z'));
    expect(newer.observedAt).toBe('2026-10-16T10:00:05.000Z');
    const older = liveSensor(sensor, readingsOf({}, '2026-10-16T09:59:00.000Z'));
    expect(older).toBe(sensor);
  });

  it('asks for the device state of every zone and component value it can show', () => {
    const sensor = sensorFixture();
    const keys = readingKeys(sensor).map(([id, capability]) => readingKey(id, capability));
    expect(keys).toContain(readingKey(sensor.externalId, 'occupancy'));
    expect(keys).toContain(readingKey(sensor.externalId, 'illuminance'));
    expect(shellyComponentCapability('boolean:200')).toBe('raw:shelly.component.boolean:200');
  });
});
