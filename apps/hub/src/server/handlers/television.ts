import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { findCandidates } from '../../adapters/samsung-tv/candidates';
import { SAMSUNG_TV_IO, type SamsungTvIo } from '../../adapters/samsung-tv/io';
import { ssdpSearch, type SsdpSearch } from '../../adapters/samsung-tv/ssdp';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const televisionRoutes = (
  { store, log }: Pick<ServerContext, 'store' | 'log'>,
  io: SamsungTvIo = SAMSUNG_TV_IO,
  search: SsdpSearch = ssdpSearch,
) =>
  ({
    listTelevisionCandidates: bound(E.listTelevisionCandidates, ({ params }) => {
      const device = store.devices.byId(params.deviceId);
      if (device.provider !== 'smartthings' || device.kind !== 'television') {
        throw new ApiError(
          'invalid_request',
          'Only a SmartThings television can be linked directly.',
        );
      }
      return findCandidates(io, search, device.model, log);
    }),
  }) as const;
