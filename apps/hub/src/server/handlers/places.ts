import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type PlaceRoutes = Record<'searchPlaces' | 'locatePlace', Bound>;

export function placeRoutes(context: ServerContext): PlaceRoutes {
  const { places } = context;
  return {
    searchPlaces: bound(E.searchPlaces, async ({ query }) => ({
      places: await places.search(query.q, query.count),
    })),
    locatePlace: bound(E.locatePlace, async ({ query }) => ({
      place: await places.locate(query.latitude, query.longitude),
    })),
  };
}
