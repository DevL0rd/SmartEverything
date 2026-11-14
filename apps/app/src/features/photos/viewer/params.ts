import { z } from 'zod';
import { LIBRARY_FILTERS, LIBRARY_SCOPE, type LibraryScope } from '@smarteverything/domain';

const DAY = z.iso.date();

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
    from: DAY.optional(),
    to: DAY.optional(),
  })
  .readonly();

export interface ViewerTarget {
  readonly itemId: string;
  readonly scope: LibraryScope;
}

export function viewerTargetOf(params: unknown): ViewerTarget | null {
  const parsed = VIEWER_PARAMS.safeParse(params);
  if (!parsed.success) return null;
  const { itemId, filter, ...rest } = parsed.data;
  const scope = LIBRARY_SCOPE.safeParse({ filter: filter ?? 'all', ...rest });
  return scope.success ? { itemId, scope: scope.data } : null;
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
