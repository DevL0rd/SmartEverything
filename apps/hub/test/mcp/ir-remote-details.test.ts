import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EMPTY_IR_REMOTE_STATE } from '@smarteverything/domain';
import { deviceDetails } from '../../src/extensions/mcp/tools/devices';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { captureLogs } from '../support/logs';
import { OWNER } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function add(
  kind: 'ir_blaster' | 'ir_remote' | 'light',
  externalId: string,
  parentId?: string,
): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId,
      parentId: parentId ?? null,
      kind,
      name: externalId,
      model: 'm',
      manufacturer: 'v',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('The device was not stored.');
  return row.id;
}

const DETAILS = z.looseObject({
  device: z.looseObject({
    infrared: z
      .looseObject({
        assumed: z.unknown().optional(),
        remotes: z.array(z.unknown()).optional(),
      })
      .optional(),
  }),
});

function deviceOf(id: string): z.infer<typeof DETAILS>['device'] {
  return DETAILS.parse(
    deviceDetails(opened.store, null, OWNER, placedDevice(opened.store, null, id)),
  ).device;
}

describe('what the AI reads about IR remotes', () => {
  it('shows a library remote’s assumed state, empty until something was sent', () => {
    const remote = add('ir_remote', 'ac');
    expect(deviceOf(remote)).toMatchObject({ infrared: { assumed: EMPTY_IR_REMOTE_STATE } });
    opened.store.settings.setIrRemote(remote, { on: true, temp: 22 });
    expect(deviceOf(remote)).toMatchObject({ infrared: { assumed: { on: true, temp: 22 } } });
  });

  it('shows a blaster every remote under it, library and learned, with their state', () => {
    const blaster = add('ir_blaster', 'ir');
    const library = add('ir_remote', 'ac', blaster);
    const learned = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'Fan',
      category: 'fan',
      brand: null,
    });
    opened.store.settings.setIrRemote(learned.id, { on: false });
    expect(deviceOf(blaster).infrared?.remotes).toEqual([
      { id: library, name: 'ac', assumed: EMPTY_IR_REMOTE_STATE },
      { id: learned.id, name: 'Fan', assumed: { ...EMPTY_IR_REMOTE_STATE, on: false } },
    ]);
  });

  it('leaves the infrared part out for any other device', () => {
    expect(deviceOf(add('light', 'lamp-1'))).not.toHaveProperty('infrared');
  });
});
