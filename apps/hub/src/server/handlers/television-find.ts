import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { televisionSearch } from '../../adapters/samsung-tv/candidates';
import {
  findTelevision,
  screensOf,
  type FindResult,
  type FindTelevisionOptions,
} from '../../adapters/samsung-tv/find-television';
import { SAMSUNG_TV_IO, type SamsungTvIo } from '../../adapters/samsung-tv/io';
import type { HostSearch } from '../../adapters/samsung-tv/lan-sweep';
import type { ScreenDevice } from '../../adapters/samsung-tv/screen-matching';
import type { ProviderManager } from '../../providers/manager';
import type { Store } from '../../store/store';
import { bound } from '../router';

interface FindContext {
  readonly store: Store;
  readonly log: Logger;
  readonly hub: { readonly providers: Pick<ProviderManager, 'link'> };
}

function optionsOf(
  { store, log, hub }: FindContext,
  io: SamsungTvIo,
  search: HostSearch,
): FindTelevisionOptions {
  return {
    search,
    io,
    screens: (): readonly ScreenDevice[] => screensOf(store),
    isLinked: (deviceId): boolean => {
      const settings = store.televisionSettings.find(deviceId);
      return (settings?.direct_host ?? null) !== null && (settings?.direct_mac ?? null) !== null;
    },
    isLinking: (): boolean => store.providers.find('samsung_tv')?.status === 'linking',
    learn: (deviceId, mac): void => {
      store.televisionSettings.setWakeAddress(deviceId, mac);
    },
    startLink: (host, attachTo): void => {
      hub.providers.link({ provider: 'samsung_tv', host, attachTo }).catch((cause: unknown) => {
        log.error('provider.link_failed', cause, { provider: 'samsung_tv' });
      });
    },
    log,
  };
}

function once(
  running: Map<string, Promise<FindResult>>,
  deviceId: string,
  start: () => Promise<FindResult>,
): Promise<FindResult> {
  const pending =
    running.get(deviceId) ??
    start().finally(() => {
      running.delete(deviceId);
    });
  running.set(deviceId, pending);
  return pending;
}

export const televisionFindRoutes = (
  context: FindContext,
  io: SamsungTvIo = SAMSUNG_TV_IO,
  search: HostSearch = televisionSearch(context.log),
  running = new Map<string, Promise<FindResult>>(),
) =>
  ({
    findTelevision: bound(E.findTelevision, ({ params }) => {
      const device = context.store.devices.byId(params.deviceId);
      if (device.provider !== 'smartthings' || device.kind !== 'television') {
        throw new ApiError(
          'invalid_request',
          'Only a SmartThings television can be linked directly.',
        );
      }
      return once(running, device.id, () =>
        findTelevision(optionsOf(context, io, search), device.id),
      );
    }),
  }) as const;
