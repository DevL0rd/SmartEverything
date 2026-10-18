import type { JsonValue } from '@smarteverything/domain';
import { SHELLY_ENROLL_REQUEST } from '@smarteverything/shelly';
import { afterEach, describe, expect, it } from 'vitest';
import {
  enrolledDevices,
  enrollShelly,
  type ShellyEnrollInput,
} from '../../../src/plugins/builtin/shelly-presence/enrollment';
import { DEVICE_ID, DEVICE_INFO, FakeShelly, memoryRecords, memorySecrets } from './fake-shelly';

const open: FakeShelly[] = [];
afterEach(async () => {
  for (const shelly of open.splice(0)) await shelly.close();
});

async function fake(info: Record<string, JsonValue>, methods: string[]): Promise<FakeShelly> {
  const shelly = await FakeShelly.open();
  open.push(shelly);
  shelly.info = { ...DEVICE_INFO, ...info };
  shelly.methods = methods;
  return shelly;
}

function request(address: string, password: string | null = null): ShellyEnrollInput {
  return SHELLY_ENROLL_REQUEST.parse({ address, password });
}

describe('Shelly enrollment', () => {
  it('accepts any Gen2 or newer device that offers presence methods', async () => {
    const shelly = await fake({ model: 'S3SN-0U12A', gen: 3 }, ['Presence.GetConfig']);
    const records = memoryRecords();
    const enrollment = await enrollShelly(request(shelly.address), records, memorySecrets());
    expect(enrollment.info).toMatchObject({ id: DEVICE_ID, model: 'S3SN-0U12A', gen: 3 });
    expect(enrolledDevices(records)).toHaveLength(1);
  });

  it('refuses a device without a presence component and saves nothing', async () => {
    const shelly = await fake({}, ['Shelly.GetConfig', 'Switch.Set']);
    const records = memoryRecords();
    await expect(enrollShelly(request(shelly.address), records, memorySecrets())).rejects.toThrow(
      'no Presence component',
    );
    expect(records.list()).toEqual([]);
  });

  it('refuses a first-generation device before opening a connection', async () => {
    const shelly = await fake({ gen: 1 }, ['Presence.GetConfig']);
    await expect(
      enrollShelly(request(shelly.address), memoryRecords(), memorySecrets()),
    ).rejects.toThrow('older than Gen2');
    expect(shelly.calls).toEqual([]);
  });

  it('keeps the saved password when the same sensor is added again without one', async () => {
    const shelly = await fake({}, ['Presence.GetConfig']);
    const records = memoryRecords();
    const store = memorySecrets();
    const first = await enrollShelly(request(shelly.address, 'pw'), records, store);
    const again = await enrollShelly(request(shelly.address), records, store);
    expect(first.secret).not.toBeNull();
    expect(again.secret).toBe(first.secret);
    expect(store.names()).toEqual([first.secret]);
  });
});
