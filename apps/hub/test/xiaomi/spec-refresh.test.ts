import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpecStore, diffSpecs, firmwareFromMiioInfo } from '../../src/adapters/xiaomi/spec-store';
import { MIOT_SPEC, type MiotSpec } from '@smarteverything/xiaomi';
import { captureLogs, testLogger } from '../support/logs';

const TYPE = 'urn:miot-spec-v2:device:vacuum:0000A006:dreame-r2228o:1';
const MODEL = 'dreame.vacuum.r2228o';

function spec(extra: readonly object[] = [], range = 3): object {
  return {
    type: TYPE,
    description: 'Robot Cleaner',
    services: [
      {
        iid: 2,
        type: 'urn:miot-spec-v2:service:vacuum:00007810:dreame-r2228o:1',
        description: 'Robot Cleaner',
        properties: [
          {
            iid: 1,
            type: 'urn:miot-spec-v2:property:status:00000007:dreame-r2228o:1',
            format: 'uint8',
            access: ['read', 'notify'],
            'value-list': [{ value: 1, description: 'Sweeping' }],
          },
          {
            iid: 4,
            type: 'urn:miot-spec-v2:property:mode:00000008:dreame-r2228o:1',
            format: 'uint8',
            access: ['read', 'write'],
            'value-range': [0, range, 1],
          },
          ...extra,
        ],
      },
    ],
  };
}

const NEW_PROPERTY = {
  iid: 99,
  type: 'urn:miot-spec-v2:property:carpet-mode:00000099:dreame-r2228o:1',
  format: 'bool',
  access: ['read'],
};

function parsed(value: object): MiotSpec {
  return MIOT_SPEC.parse(value);
}

let directory = '';
let served: object = spec();
let requests: string[] = [];
let failing = false;

function store(): SpecStore {
  return new SpecStore({
    baseUrl: 'https://spec.test',
    directory,
    log: testLogger('spec-store'),
    fetch: (url): Promise<Response> => {
      requests.push(url);
      if (failing) {
        return Promise.resolve(new Response('down', { status: 503 }));
      }
      return Promise.resolve(Response.json(served));
    },
  });
}

beforeEach(async (): Promise<void> => {
  directory = await mkdtemp(join(tmpdir(), 'spec-refresh-'));
  served = spec();
  requests = [];
  failing = false;
});

afterEach(async (): Promise<void> => {
  await rm(directory, { recursive: true, force: true });
});

describe('firmwareFromMiioInfo', () => {
  it('reads fw_ver from the miIO.info reply', () => {
    expect(firmwareFromMiioInfo({ model: MODEL, fw_ver: '4.5.8_0492', hw_ver: 'Linux' })).toBe(
      '4.5.8_0492',
    );
  });

  it('is null when the reply carries no firmware version', () => {
    expect(firmwareFromMiioInfo({ model: MODEL })).toBeNull();
    expect(firmwareFromMiioInfo({ fw_ver: '' })).toBeNull();
    expect(firmwareFromMiioInfo(null)).toBeNull();
  });
});

describe('diffSpecs', () => {
  it('lists added, removed and changed entries by siid.piid', () => {
    const before = parsed(spec());
    const after = parsed(spec([NEW_PROPERTY], 5));
    expect(diffSpecs(before, after)).toEqual({
      added: ['2.p99'],
      removed: [],
      changed: ['2.p4'],
    });
    expect(diffSpecs(after, before)).toEqual({
      added: [],
      removed: ['2.p99'],
      changed: ['2.p4'],
    });
  });
});

describe('spec refresh on firmware change', () => {
  it('records the first firmware seen without refetching', async () => {
    await store().specFor(MODEL, TYPE, '4.5.8_0492');
    expect(requests).toHaveLength(1);
    await store().specFor(MODEL, TYPE, '4.5.8_0492');
    expect(requests).toHaveLength(1);
    const saved: unknown = JSON.parse(
      await readFile(join(directory, 'miot-spec-firmware.json'), 'utf8'),
    );
    expect(saved).toEqual({ [MODEL]: '4.5.8_0492' });
  });

  it('never refetches while the firmware is unknown', async () => {
    await store().specFor(MODEL, TYPE);
    served = spec([NEW_PROPERTY]);
    const again = await store().specFor(MODEL, TYPE, null);
    expect(requests).toHaveLength(1);
    expect(again.services[0]?.properties).toHaveLength(2);
  });

  it('refetches once when the firmware changes and logs both versions and the diff', async () => {
    const logs = captureLogs();
    await store().specFor(MODEL, TYPE, '4.5.8_0492');
    served = spec([NEW_PROPERTY]);
    const fresh = await store().specFor(MODEL, TYPE, '4.6.0_0100');
    expect(requests).toHaveLength(2);
    expect(fresh.services[0]?.properties).toHaveLength(3);
    const record = logs.records.find((entry) => entry.event === 'miot_spec.firmware_changed');
    expect(record?.payload).toMatchObject({
      model: MODEL,
      from: '4.5.8_0492',
      to: '4.6.0_0100',
      diff: { added: ['2.p99'], removed: [], changed: [] },
    });
    const cached = await store().specFor(MODEL, TYPE, '4.6.0_0100');
    expect(requests).toHaveLength(2);
    expect(cached.services[0]?.properties).toHaveLength(3);
  });

  it('keeps the stored spec, warns and retries next time when the refetch fails', async () => {
    const logs = captureLogs();
    await store().specFor(MODEL, TYPE, '4.5.8_0492');
    failing = true;
    const kept = await store().specFor(MODEL, TYPE, '4.6.0_0100');
    expect(kept.services[0]?.properties).toHaveLength(2);
    expect(logs.events()).toContain('miot_spec.refresh_failed');
    failing = false;
    served = spec([NEW_PROPERTY]);
    const retried = await store().specFor(MODEL, TYPE, '4.6.0_0100');
    expect(retried.services[0]?.properties).toHaveLength(3);
    expect(logs.events()).toContain('miot_spec.firmware_changed');
  });
});
