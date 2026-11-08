import { z } from 'zod';
import { PHOTO_TIMELINE_FILTERS } from '@smarteverything/domain';
import type { PhotoScope } from '../../../api/photos';

export const VIEWER_PARAMS = z
  .strictObject({
    itemId: z.union([
      z.uuid(),
      z
        .string()
        .startsWith('local:')
        .min('local:'.length + 1),
    ]),
    filter: z.enum(PHOTO_TIMELINE_FILTERS).optional(),
    placeId: z.coerce.number().int().positive().optional(),
  })
  .readonly();

export interface ViewerTarget {
  readonly itemId: string;
  readonly scope: PhotoScope;
}

export function viewerTargetOf(params: unknown): ViewerTarget | null {
  const parsed = VIEWER_PARAMS.safeParse(params);
  if (!parsed.success) return null;
  return {
    itemId: parsed.data.itemId,
    scope: { filter: parsed.data.filter ?? 'all', placeId: parsed.data.placeId ?? null },
  };
}

export function viewerParamsOf(scope: PhotoScope): Readonly<Record<string, string>> {
  return {
    ...(scope.filter === 'all' ? {} : { filter: scope.filter }),
    ...(scope.placeId === null ? {} : { placeId: String(scope.placeId) }),
  };
}
