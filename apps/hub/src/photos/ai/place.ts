import { z } from 'zod';
import type { StoreContext } from '../../store/context';

const PLACE = z.strictObject({
  name: z.string(),
  admin: z.string().nullable(),
  country: z.string(),
});

export function placeNameOf(context: StoreContext, placeId: string | null): string | null {
  if (placeId === null) return null;
  const place = context.sql.get(
    PLACE,
    'select name, admin, country from drive_places where id = $placeId',
    { placeId },
  );
  if (place === undefined) return null;
  return [place.name, place.admin, place.country].filter((part) => part !== null).join(', ');
}
