import { readFileSync } from 'node:fs';
import { DEVICE_CAPABILITY, type DeviceRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coreNodeReadHandlers } from '../../../src/automations/world-v3/core-node-reads';
import { ReadFailure } from '../../../src/automations/world-v3/read-port';
import { furnish, type Home } from './support';

const CAPABILITIES = z
  .array(DEVICE_CAPABILITY)
  .parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../packages/domain/test/fixtures/mibx5-f29gl-capabilities.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

const STATUS = 'raw:2.2';
const DOOR = 'raw:2.9';
const REMAINING = 'raw:2.10';
const RUN_PHASE = 'raw:2.11';

let home: Home;
let washer: DeviceRow;

beforeEach(async () => {
  home = await furnish();
  const [stored] = home.test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'washer-1',
      parentId: null,
      kind: 'appliance',
      name: 'Washer',
      model: 'mibx5.washer.f29gl',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: CAPABILITIES,
      details: {},
    },
  ]);
  if (stored === undefined) throw new Error('the washer was not stored');
  washer = stored;
});

afterEach(async () => {
  await home.test.close();
});

function read(device: DeviceRow = washer): Readonly<Record<string, unknown>> {
  return home.read('laundry.read', { machine: { device: device.id } }).outputs;
}

describe('laundry.read', () => {
  it('registers as a read handler of the core node reads', () => {
    expect(Object.keys(coreNodeReadHandlers(home.deps))).toContain('laundry.read');
  });

  it('reports the status, phase, time left as a duration and a closed door while washing', () => {
    home.write(washer, STATUS, 'Busy');
    home.write(washer, RUN_PHASE, 'Washing');
    home.write(washer, REMAINING, 42);
    home.write(washer, DOOR, 'Closed And Can Not Be Opened');
    expect(read()).toEqual({
      status: 'Busy',
      phase: 'wash',
      remaining: 42 * 60_000,
      doorOpen: false,
    });
  });

  it('reports an open door and the resting phase of a ready machine', () => {
    home.write(washer, STATUS, 'Idle');
    home.write(washer, REMAINING, 0);
    home.write(washer, DOOR, 'Open');
    expect(read()).toEqual({ status: 'Idle', phase: 'idle', remaining: 0, doorOpen: true });
  });

  it('reports the finished phase of a completed cycle', () => {
    home.write(washer, STATUS, 'Completed');
    expect(read()).toMatchObject({ status: 'Completed', phase: 'finished' });
  });

  it('leaves out what the machine has not reported', () => {
    expect(read()).toEqual({});
    home.write(washer, DOOR, 'Closed And Can Be Opened');
    expect(read()).toEqual({ doorOpen: false });
  });

  it('is Invalid for a device that is no washing machine and NotFound for a missing one', () => {
    expect(() => read(home.lampA)).toThrow(ReadFailure);
    expect(() => read(home.lampA)).toThrow('not a washing machine or dryer');
    expect(() =>
      home.read('laundry.read', { machine: { device: '00000000-0000-4000-8000-000000000000' } }),
    ).toThrow(ReadFailure);
  });

  it('fails with the reason when the machine reports a status it does not define', () => {
    home.write(washer, STATUS, 'Spinning Round');
    expect(() => read()).toThrow(ReadFailure);
  });

  it('rejects inputs it cannot read', () => {
    expect(() => home.read('laundry.read', {})).toThrow('cannot read');
  });
});
