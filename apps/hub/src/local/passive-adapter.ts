import type { ProviderAdapter } from '@smarteverything/domain';
import { XiaomiAdapter } from '../adapters/xiaomi';
import type { HubParts } from '../hub-assembly';
import { linkedDevice, passiveSource } from './passive-observations';

export function preparePassiveAdapter(
  adapter: ProviderAdapter,
  parts: Pick<HubParts, 'store' | 'secrets'>,
): void {
  if (!(adapter instanceof XiaomiAdapter)) {
    return;
  }
  for (const entry of parts.store.localDevices.list()) {
    const device = linkedDevice(parts.store, entry);
    if (
      device?.provider !== adapter.provider ||
      entry.config['accountScope'] !== adapter.passiveAccountScope()
    ) {
      continue;
    }
    adapter.observePassive(
      entry.externalId,
      passiveSource(parts.store, parts.secrets, entry, device.id),
      entry.address,
    );
  }
}
