import { createHash } from 'node:crypto';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { ProviderAdapter } from '@smarteverything/domain';
import { XiaomiAdapter } from '../adapters/xiaomi';
import type { HubParts } from '../hub-assembly';
import { BLE_RECEIVER_FRESH_MS } from './passive-observations';
import { LOCAL_DRIVER_REGISTRY } from './drivers';

export function preparePassiveAdapter(
  adapter: ProviderAdapter,
  parts: Pick<HubParts, 'store' | 'secrets'>,
): void {
  if (!(adapter instanceof XiaomiAdapter)) {
    return;
  }
  const state = parts.store.state.list();
  for (const entry of parts.store.localDevices.list()) {
    const deviceId = linkedDeviceId(adapter, parts, entry);
    const key = parts.secrets.deviceKey(entry.externalId);
    if (deviceId === null || key === null) {
      continue;
    }
    const cursor = parts.store.bleObservations.cursor(
      deviceId,
      createHash('sha256').update(key).digest('hex'),
    );
    const value = state.find((row) => row.device_id === deviceId && row.capability === 'contact');
    adapter.observePassive(
      entry.externalId,
      {
        update:
          value === undefined
            ? null
            : {
                externalId: entry.externalId,
                capability: 'contact',
                value: value.value,
                observedAt: value.observed_at,
              },
        freshUntil:
          cursor === undefined
            ? 0
            : Math.min(Date.parse(cursor.seen_at), Date.parse(cursor.received_at)) +
              BLE_RECEIVER_FRESH_MS,
      },
      entry.address,
    );
  }
}

function linkedDeviceId(
  adapter: XiaomiAdapter,
  parts: Pick<HubParts, 'store'>,
  entry: LocalDeviceEntry,
): string | null {
  const deviceId = entry.config['deviceId'];
  if (
    LOCAL_DRIVER_REGISTRY[entry.driver].provider !== adapter.provider ||
    typeof deviceId !== 'string' ||
    entry.config['accountScope'] !== adapter.passiveAccountScope()
  ) {
    return null;
  }
  const device = parts.store.devices.find(deviceId);
  return device?.provider === adapter.provider &&
    device.external_id === entry.externalId &&
    device.model === entry.config['model']
    ? deviceId
    : null;
}
