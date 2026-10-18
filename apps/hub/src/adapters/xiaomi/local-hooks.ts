import type { ProviderAdapter } from '@smarteverything/domain';
import type { LocalDevicesOptions } from '../../local/local-devices';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import { XiaomiAdapter } from './adapter';

type PassiveHooks = Pick<LocalDevicesOptions, 'eligible' | 'sourceChanged'>;

function linkedToEntry(store: Store, entry: LocalDeviceEntry): boolean {
  const deviceId = entry.config['deviceId'];
  const device = typeof deviceId === 'string' ? store.devices.find(deviceId) : undefined;
  return (
    device?.provider === 'xiaomi' &&
    device.external_id === entry.externalId &&
    device.model === entry.config['model']
  );
}

export function xiaomiLocalHooks(
  store: Store,
  adapterOf: () => ProviderAdapter | undefined,
): PassiveHooks {
  return {
    eligible: (entry): boolean => {
      const adapter = adapterOf();
      const model = entry.config['model'];
      const scope = entry.config['accountScope'];
      return (
        adapter instanceof XiaomiAdapter &&
        typeof model === 'string' &&
        typeof scope === 'string' &&
        linkedToEntry(store, entry) &&
        adapter.passiveEligible(entry.externalId, model, entry.address, scope)
      );
    },
    sourceChanged: (externalId, source): void => {
      const adapter = adapterOf();
      if (!(adapter instanceof XiaomiAdapter)) return;
      const entry = store.localDevices
        .list()
        .find((candidate) => candidate.externalId === externalId);
      if (source !== null && entry?.config['accountScope'] !== adapter.passiveAccountScope())
        return;
      adapter.observePassive(externalId, source, entry?.address ?? null);
    },
  };
}
