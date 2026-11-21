import type { ProviderAdapter } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { LocalDevicesOptions } from '../../local/local-devices';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import { XiaomiAdapter } from './adapter';
import { CommandLanes } from '../../commands/lanes';

type PassiveHooks = Pick<LocalDevicesOptions, 'eligible' | 'sourceChanged'>;

function linkedToEntry(store: Store, entry: LocalDeviceEntry): boolean {
  const deviceId = entry.config['deviceId'];
  const device = typeof deviceId === 'string' ? store.live.home.devices.find(deviceId) : undefined;
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
  const lanes = new CommandLanes();
  const observed = async (
    externalId: string,
    source: Parameters<PassiveHooks['sourceChanged']>[1],
  ): Promise<void> => {
    const adapter = adapterOf();
    if (!(adapter instanceof XiaomiAdapter)) return;
    const entry = (await store.host.call('localDevices', 'list')).find(
      (candidate) => candidate.externalId === externalId,
    );
    if (source !== null && entry?.config['accountScope'] !== adapter.passiveAccountScope()) return;
    adapter.observePassive(externalId, source, entry?.address ?? null);
  };
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
      background(
        lanes.run('passive', () => observed(externalId, source)),
        'xiaomi.passive_source_failed',
        { externalId },
      );
    },
  };
}
