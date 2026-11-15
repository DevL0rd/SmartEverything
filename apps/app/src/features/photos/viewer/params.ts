import { z } from 'zod';
import {
  LIBRARY_FILTERS,
  LIBRARY_SCOPE,
  PHOTO_FOLDER_KEY,
  PHOTO_FOLDER_SHOWS,
  type LibraryScope,
} from '@smarteverything/domain';

const DAY = z.iso.date();

export const VIEWER_FROM = ['library', 'archive'] as const;

export type ViewerFrom = (typeof VIEWER_FROM)[number];

export const VIEWER_PARAMS = z
  .strictObject({
    itemId: z.union([
      z.uuid(),
      z
        .string()
        .startsWith('local:')
        .min('local:'.length + 1),
    ]),
    filter: z.enum(LIBRARY_FILTERS).optional(),
    placeId: z.coerce.number().int().positive().optional(),
    countryCode: z.string().length(2).optional(),
    camera: z.string().min(1).optional(),
    albumId: z.uuid().optional(),
    text: z.string().min(1).optional(),
    folder: PHOTO_FOLDER_KEY.optional(),
    folders: z.enum(PHOTO_FOLDER_SHOWS).optional(),
    from: DAY.optional(),
    to: DAY.optional(),
    origin: z.enum(VIEWER_FROM).optional(),
  })
  .readonly();

export interface ViewerTarget {
  readonly itemId: string;
  readonly scope: LibraryScope;
  readonly from: ViewerFrom;
}

export function viewerTargetOf(params: unknown): ViewerTarget | null {
  const parsed = VIEWER_PARAMS.safeParse(params);
  if (!parsed.success) return null;
  const { itemId, filter, origin, ...rest } = parsed.data;
  const scope = LIBRARY_SCOPE.safeParse({ filter: filter ?? 'all', ...rest });
  return scope.success ? { itemId, scope: scope.data, from: origin ?? 'library' } : null;
}

export function viewerFromParams(from: ViewerFrom): Readonly<Record<string, string>> {
  return from === 'library' ? {} : { origin: from };
}

export function viewerParamsOf(scope: LibraryScope): Readonly<Record<string, string>> {
  const { filter, placeId, ...rest } = scope;
  return {
    ...(filter === 'all' ? {} : { filter }),
    ...(placeId === undefined ? {} : { placeId: String(placeId) }),
    ...Object.fromEntries(
      Object.entries(rest).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  };
}
