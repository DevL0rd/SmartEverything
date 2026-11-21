import type { ProviderAdapter } from '@smarteverything/domain';
import { XiaomiAdapter } from '../adapters/xiaomi';
import type { HubParts } from '../hub-assembly';
import { linkedDevice, passiveSource } from './passive-observations';

export async function preparePassiveAdapter(
  adapter: ProviderAdapter,
  parts: Pick<HubParts, 'store' | 'secrets'>,
): Promise<void> {
  if (!(adapter instanceof XiaomiAdapter)) {
    return;
  }
  for (const entry of await parts.store.host.call('localDevices', 'list')) {
    const device = await linkedDevice(parts.store, entry);
    if (
      device?.provider !== adapter.provider ||
      entry.config['accountScope'] !== adapter.passiveAccountScope()
    ) {
      continue;
    }
    adapter.observePassive(
      entry.externalId,
      await passiveSource(parts.store, parts.secrets, entry, device.id),
      entry.address,
    );
  }
}
