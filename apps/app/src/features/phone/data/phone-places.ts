import { API_ENDPOINTS as E, type EventRow } from '@smarteverything/domain';
import { z } from 'zod';
import { api } from '../../../api/transport';
import { dayKeyOf, startOfDayKey } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';

const PLACE_KINDS = ['place_arrived', 'place_left'] as const;
const PLACE_DETAILS = z.object({ place: z.string().min(1) });
const MOST_PLACE_EVENTS = 200;

export interface PlaceVisit {
  readonly id: string;
  readonly arrived: boolean;
  readonly place: string;
  readonly at: string;
}

export function placeVisitsOf(rows: readonly EventRow[]): readonly PlaceVisit[] {
  return rows
    .flatMap((row) => {
      const details = PLACE_DETAILS.safeParse(row.details);
      if (!details.success) return [];
      return [
        {
          id: row.id,
          arrived: row.kind === 'place_arrived',
          place: details.data.place,
          at: row.occurred_at,
        },
      ];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function usePhonePlaces(
  deviceId: string,
  now: number,
  enabled: boolean,
): {
  readonly visits: readonly PlaceVisit[] | undefined;
  readonly error: Error | null;
} {
  const from = new Date(startOfDayKey(dayKeyOf(now))).toISOString();
  const query = useScreenQuery({
    queryKey: ['window', 'phone-places', deviceId, from],
    queryFn: () =>
      api().call(E.listEvents, {
        query: { deviceIds: [deviceId], kinds: [...PLACE_KINDS], from, limit: MOST_PLACE_EVENTS },
      }),
    select: placeVisitsOf,
    enabled,
  });
  return { visits: query.data, error: query.error };
}
