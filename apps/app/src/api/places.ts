import { API_ENDPOINTS as E, type GeoPoint, type PlaceMatch } from '@smarteverything/domain';
import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../queries/use-screen-query';
import { api } from './transport';

export const MIN_PLACE_QUERY = 2;

export function usePlaceSearch(query: string): UseQueryResult<readonly PlaceMatch[]> {
  const q = query.trim();
  return useScreenQuery({
    queryKey: ['places', q.toLowerCase()],
    queryFn: async () => (await api().call(E.searchPlaces, { query: { q } })).places,
    enabled: q.length >= MIN_PLACE_QUERY,
  });
}

export async function placeAt(point: GeoPoint): Promise<PlaceMatch> {
  const answer = await api().call(E.locatePlace, {
    query: { latitude: point.latitude, longitude: point.longitude },
  });
  return answer.place;
}
