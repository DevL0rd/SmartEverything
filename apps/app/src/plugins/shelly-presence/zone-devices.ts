import { memoOnInputs } from '../../store/memo-selector';
import { rowsOf, type Device, type StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';

export type DeviceLink = Pick<Device, 'id' | 'kind' | 'model'>;

function sameLink(link: DeviceLink | undefined, device: Device): boolean {
  return link?.id === device.id && link.kind === device.kind && link.model === device.model;
}

function linksSelector(): (state: StoreState) => ReadonlyMap<string, DeviceLink> {
  let held: ReadonlyMap<string, DeviceLink> = new Map();
  return memoOnInputs(
    (state) => [state.tables.devices],
    (state) => {
      const devices = rowsOf(state.tables.devices);
      const firsts = new Map<string, Device>();
      for (const device of devices) {
        if (!firsts.has(device.external_id)) firsts.set(device.external_id, device);
      }
      if (
        held.size === firsts.size &&
        [...firsts].every(([externalId, device]) => sameLink(held.get(externalId), device))
      ) {
        return held;
      }
      held = new Map(
        [...firsts].map(([externalId, device]) => [
          externalId,
          { id: device.id, kind: device.kind, model: device.model },
        ]),
      );
      return held;
    },
  );
}

export const deviceLinksIn = linksSelector();

export function useDeviceLinks(): ReadonlyMap<string, DeviceLink> {
  return useStoreSelector(deviceLinksIn);
}

export function useDeviceIdOf(externalId: string): string | null {
  return useStoreSelector((state) => deviceLinksIn(state).get(externalId)?.id ?? null, Object.is, [
    externalId,
  ]);
}
