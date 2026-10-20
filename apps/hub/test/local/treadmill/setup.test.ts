import { ApiError, type LocalDeviceSetup } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { treadmillSetup } from '../../../src/local/treadmill/setup';
import { ADDRESS, FTMS_GATT, WILINK_GATT } from '../../support/treadmill-rig';

type TreadmillSetup = Extract<LocalDeviceSetup, { driver: 'kingsmith_treadmill' }>;

function setup(gatt: TreadmillSetup['gatt'], name = 'Hallway pad'): TreadmillSetup {
  return {
    driver: 'kingsmith_treadmill',
    source: 'bluetooth',
    name,
    address: ADDRESS,
    room: 'Hallway',
    gatt,
  };
}

describe('adding a treadmill', () => {
  it('names the device by its address, stores no key and keeps the room, the family and the read table', () => {
    const resolved = treadmillSetup(setup(WILINK_GATT));
    expect(resolved.key).toBeNull();
    expect(resolved.replaces).toBeNull();
    expect(resolved.entry).toMatchObject({
      externalId: `kingsmith_treadmill:${ADDRESS}`,
      driver: 'kingsmith_treadmill',
      address: ADDRESS,
      name: 'Hallway pad',
      config: { room: 'Hallway', family: 'wilink', model: 'kingsmith.treadmill.k15' },
    });
  });

  it('decides the family from the Bluetooth table, never from the name', () => {
    expect(treadmillSetup(setup(FTMS_GATT, 'KS-K15')).entry.config).toMatchObject({
      family: 'ftms',
    });
  });

  it('refuses a table that is not a treadmill with the services it found', () => {
    expect(() =>
      treadmillSetup(setup({ name: 'Lamp', services: [{ uuid: '180f', characteristics: [] }] })),
    ).toThrow(ApiError);
    expect(() =>
      treadmillSetup(setup({ name: 'Lamp', services: [{ uuid: '180f', characteristics: [] }] })),
    ).toThrow(/180f/);
  });
});
