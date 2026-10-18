import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const placeRoutes = ({ places }: ServerContext) =>
  ({
    searchPlaces: bound(E.searchPlaces, async ({ query }) => ({
      places: await places.search(query.q, query.count),
    })),
    locatePlace: bound(E.locatePlace, async ({ query }) => ({
      place: await places.locate(query.latitude, query.longitude),
    })),
  }) as const;
