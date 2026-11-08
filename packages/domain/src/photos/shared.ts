import { z } from 'zod';

export const ID = z.uuid();
export const MOMENT = z.iso.datetime({ offset: true });
export const DAY = z.iso.date();
export const COUNT = z.int().nonnegative();
export const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const LATITUDE = z.number().min(-90).max(90);
export const LONGITUDE = z.number().min(-180).max(180);
export const PLACE_ID = z.int().positive();
export const THUMBHASH = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const NAME = z.string().trim().min(1);
export const QUERY_PLACE_ID = z.coerce.number().int().positive();
