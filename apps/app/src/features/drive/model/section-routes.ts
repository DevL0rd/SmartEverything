import type { DriveRoot } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';

export const DRIVE_SECTIONS = [
  'index',
  'shared-drive',
  'shared',
  'recent',
  'starred',
  'activity',
  'computers',
  'storage',
  'trash',
] as const;

export type DriveSection = (typeof DRIVE_SECTIONS)[number];

export type DrivePageSection = Exclude<DriveSection, 'index'>;

export const DRIVE_SECTION_ROUTES: readonly DriveSection[] = DRIVE_SECTIONS;

type RouteParams = Readonly<Record<string, string>>;

export function driveTopHref(root: Pick<DriveRoot, 'scope'>, params: RouteParams = {}): AppHref {
  return root.scope === 'home' ? href.drivePage('shared-drive', params) : href.drive(params);
}

export interface DriveLocation {
  readonly rootId: string;
  readonly folderId: string | null;
  readonly params?: RouteParams;
}

export function driveLocationHref(
  roots: readonly Pick<DriveRoot, 'id' | 'scope'>[],
  location: DriveLocation,
): AppHref {
  const params = location.params ?? {};
  if (location.folderId !== null) return href.driveFolder(location.folderId, params);
  const root = roots.find((candidate) => candidate.id === location.rootId);
  return root === undefined ? href.drivePage('shared', params) : driveTopHref(root, params);
}
