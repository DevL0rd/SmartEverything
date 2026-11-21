import type { HostStore } from '../../store/host/host-store';
import type { ScreenDevice } from './screen-matching';

export function screensOf(
  store: Pick<HostStore, 'devices' | 'televisionSettings' | 'state'>,
): readonly ScreenDevice[] {
  return store.devices
    .list()
    .filter((device) => device.provider === 'smartthings' && device.kind === 'television')
    .map((device) => {
      const settings = store.televisionSettings.find(device.id);
      const power = store.state.value(device.id, 'power');
      return {
        id: device.id,
        model: device.model,
        online: device.online,
        power: typeof power === 'boolean' ? power : null,
        macs: [
          ...(settings?.wake_macs ?? []),
          ...(settings?.direct_mac === null || settings?.direct_mac === undefined
            ? []
            : [settings.direct_mac]),
        ],
      };
    });
}
