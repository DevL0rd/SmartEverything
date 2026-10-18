import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { DEVICE_CAPABILITY, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { deviceFixture } from './device-fixture';
import type { Device, DeviceValues } from './state';

const LIVE = z.record(
  z.string(),
  z.object({
    model: z.string(),
    capabilities: z.array(DEVICE_CAPABILITY),
    state: z.record(z.string(), JSON_VALUE),
  }),
);

const RECORDED = LIVE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/domain/test/fixtures/smartthings-televisions.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

export type RecordedTv = 'livingRoom' | 'bedroom' | 'monitor';

export interface TelevisionFixture {
  readonly device: Device;
  readonly values: DeviceValues;
}

export function televisionFixture(
  name: RecordedTv,
  online: boolean,
  changes: Readonly<Record<string, JsonValue>> = {},
): TelevisionFixture {
  const recorded = RECORDED[name];
  if (recorded === undefined) {
    throw new Error(`The recorded televisions have no ${name}.`);
  }
  const state = { ...recorded.state, ...changes };
  return {
    device: deviceFixture(0, {
      id: `${name}-id`,
      provider: 'smartthings',
      kind: 'television',
      model: recorded.model,
      online,
      capabilities: recorded.capabilities,
    }),
    values: Object.fromEntries(
      Object.entries(state).map(([key, value]) => [
        key,
        { value, observedAt: '2026-10-18T10:00:00.000Z' },
      ]),
    ),
  };
}
