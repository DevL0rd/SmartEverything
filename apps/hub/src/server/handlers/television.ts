import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { findCandidates, televisionSearch } from '../../adapters/samsung-tv/candidates';
import { SAMSUNG_TV_IO, type SamsungTvIo } from '../../adapters/samsung-tv/io';
import type { HostSearch } from '../../adapters/samsung-tv/lan-sweep';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const televisionRoutes = (
  { store, log }: Pick<ServerContext, 'store' | 'log'>,
  io: SamsungTvIo = SAMSUNG_TV_IO,
  search: HostSearch = televisionSearch(log),
) =>
  ({
    listTelevisionCandidates: bound(E.listTelevisionCandidates, async ({ params }) => {
      const device = store.devices.byId(params.deviceId);
      if (device.provider !== 'smartthings' || device.kind !== 'television') {
        throw new ApiError(
          'invalid_request',
          'Only a SmartThings television can be linked directly.',
        );
      }
      const links = new Map(
        store.televisionSettings
          .list()
          .flatMap((row) =>
            row.direct_mac === null ? [] : [[row.direct_mac, row.device_id] as const],
          ),
      );
      const candidates = await findCandidates(io, search, device.model, log);
      return candidates.map((candidate) => ({
        ...candidate,
        linkedTo: candidate.macAddress === null ? null : (links.get(candidate.macAddress) ?? null),
      }));
    }),
  }) as const;
