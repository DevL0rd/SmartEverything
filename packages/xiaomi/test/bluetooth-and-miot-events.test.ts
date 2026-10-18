import { describe, expect, it } from 'vitest';
import {
  BEACON_KEY_PATH,
  BeaconKeyMissingError,
  MIOT_SPEC,
  beaconKeyData,
  deviceEventFromLegacyButton,
  isBluetoothDid,
  miotEventDetails,
  miotEventOf,
  parseBeaconKey,
  readingsSourceOf,
  supportsLegacyButton,
} from '../src';

const KEY = 'AABBCCDDEEFF00112233445566778899';

describe('Bluetooth beacon keys', () => {
  it('asks the cloud for the key of one device', () => {
    expect(BEACON_KEY_PATH).toBe('/v2/device/blt_get_beaconkey');
    expect(beaconKeyData('blt.3.abc')).toEqual({ did: 'blt.3.abc', pdid: 1 });
  });

  it('returns the key in lower case', () => {
    expect(parseBeaconKey('blt.3.abc', { beaconkey: KEY })).toBe(KEY.toLowerCase());
  });

  it('names the device and every problem when the cloud gives no usable key', () => {
    expect(() => parseBeaconKey('blt.3.abc', { beaconkey: 'short' })).toThrow(
      BeaconKeyMissingError,
    );
    expect(() => parseBeaconKey('blt.3.abc', {})).toThrow(/blt\.3\.abc/);
  });

  it('knows a Bluetooth device id by its prefix', () => {
    expect(isBluetoothDid('blt.3.abc')).toBe(true);
    expect(isBluetoothDid('12345')).toBe(false);
  });
});

const SPEC = MIOT_SPEC.parse({
  type: 'urn:miot-spec-v2:device:motion-sensor:0000A014:lumi-test:1',
  services: [
    {
      iid: 2,
      type: 'urn:miot-spec-v2:service:motion-sensor:00007813:lumi-test:1',
      properties: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:property:no-motion-duration:00000102:lumi-test:1',
          format: 'uint8',
          access: ['read'],
        },
        {
          iid: 2,
          type: 'urn:miot-spec-v2:property:illumination:0000004B:lumi-test:1',
          format: 'uint8',
          access: ['read'],
        },
        {
          iid: 3,
          type: 'urn:miot-spec-v2:property:other:0000004B:lumi-test:1',
          format: 'uint8',
          access: ['read'],
        },
      ],
      events: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:event:motion-detected:00005001:lumi-test:1',
          arguments: [2, 1],
        },
      ],
    },
  ],
});

describe('MIoT events of a device', () => {
  it('names the event and the arguments it carries', () => {
    const shape = miotEventOf(SPEC, 2, 1);
    expect(shape?.name).toBe('motion-detected');
    expect([...(shape?.argumentNames ?? [])]).toEqual([
      [1, 'no-motion-duration'],
      [2, 'illumination'],
    ]);
  });

  it('finds nothing for a service or an event the device does not have', () => {
    expect(miotEventOf(SPEC, 9, 1)).toBeNull();
    expect(miotEventOf(SPEC, 2, 9)).toBeNull();
  });

  it('labels each reported value by its argument, and an unknown argument by its number', () => {
    const shape = miotEventOf(SPEC, 2, 1);
    if (shape === null) throw new Error('the event is missing from the spec');
    expect(
      miotEventDetails(shape, [
        { piid: 2, value: 40 },
        { piid: 7, value: true },
      ]),
    ).toEqual({ illumination: 40, 'argument-7': true });
  });
});

describe('legacy buttons', () => {
  it('belongs to the listed models only', () => {
    expect(supportsLegacyButton('lumi.sensor_switch.v2')).toBe(true);
    expect(supportsLegacyButton('lumi.sensor_motion.v2')).toBe(false);
  });

  it('turns a legacy click into a button event with its protocol', () => {
    const observed = {
      externalId: '42',
      occurredAt: '2026-10-08T10:00:00.000Z',
      details: { a: 1 },
    };
    expect(deviceEventFromLegacyButton('event.long_click_press', observed)).toEqual({
      ...observed,
      kind: 'button',
      details: {
        a: 1,
        action: 'long_press',
        protocol: 'legacy-miio',
        method: 'event.long_click_press',
      },
    });
  });
});

describe('where a device kind keeps its readings', () => {
  it('points a scale at its Bluetooth adverts and a other kind at nothing', () => {
    expect(readingsSourceOf('urn:miot-spec-v2:device:scale:0000A00A:test:1')).toMatch(/Bluetooth/);
    expect(readingsSourceOf('urn:miot-spec-v2:device:light:0000A001:test:1')).toBeNull();
  });
});
