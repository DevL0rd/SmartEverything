import type { ReactNode } from 'react';
import { usePathname, type ErrorBoundaryProps } from 'expo-router';
import { AreaRouteErrorBoundary } from '../../../app-shell/route-error-boundary';
import { usePhotoRailCounts } from '../data';
import {
  PHOTOS_RAIL_HREF,
  PHOTOS_RAIL_IDS,
  photosSectionsOf,
  photosTitleOf,
  type PhotosRailId,
} from './photos-frame';

const DETAIL_SECTION: readonly (readonly [string, PhotosRailId])[] = [
  ['/photos/albums/', 'albums'],
  ['/photos/people/', 'people'],
  ['/photos/places/', 'map'],
  ['/photos/folder/', 'folders'],
  ['/photos/rankings/', 'insights'],
  ['/photos/view/', 'library'],
];

function rootPathOf(target: (typeof PHOTOS_RAIL_HREF)[PhotosRailId]): string {
  return typeof target === 'string' ? target : target.pathname;
}

export interface PhotosCrashPlace {
  readonly active: PhotosRailId;
  readonly root: boolean;
}

export function photosCrashPlaceOf(pathname: string): PhotosCrashPlace {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const rootId = PHOTOS_RAIL_IDS.find((id) => rootPathOf(PHOTOS_RAIL_HREF[id]) === path);
  if (rootId !== undefined) return { active: rootId, root: true };
  const detail = DETAIL_SECTION.find(([prefix]) => path.startsWith(prefix));
  if (detail === undefined) throw new Error(`Photos has no section for ${pathname}`);
  return { active: detail[1], root: false };
}

export function PhotosErrorBoundary(props: ErrorBoundaryProps): ReactNode {
  const place = photosCrashPlaceOf(usePathname());
  const counts = usePhotoRailCounts().data;
  return (
    <AreaRouteErrorBoundary
      title={photosTitleOf(place.active)}
      back={!place.root}
      sections={photosSectionsOf(place.active, counts, null)}
      {...props}
    />
  );
}
