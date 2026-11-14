import type { DriveGrant, DriveGrantRole, DriveItem, DriveRoot } from '@smarteverything/domain';

export type DriveAccess = 'own' | 'shared' | 'edit' | 'view' | 'none';

export const MY_DRIVE_LABEL = 'My Drive';
export const SHARED_DRIVE_LABEL = 'Shared Drive';

export function isDriveOwner(
  root: Pick<DriveRoot, 'ownerProfileId'>,
  viewerId: string | null,
): boolean {
  return viewerId !== null && root.ownerProfileId === viewerId;
}

export function ownDriveOf(roots: readonly DriveRoot[], viewerId: string | null): DriveRoot | null {
  return roots.find((root) => root.scope === 'person' && isDriveOwner(root, viewerId)) ?? null;
}

export function sharedDriveOf(roots: readonly DriveRoot[]): DriveRoot | null {
  return roots.find((root) => root.scope === 'home') ?? null;
}

export function driveOfRootId(roots: readonly DriveRoot[], rootId: string): DriveRoot | null {
  return roots.find((root) => root.id === rootId) ?? null;
}

export function driveOfItem(
  roots: readonly DriveRoot[],
  item: Pick<DriveItem, 'rootId'>,
): DriveRoot | null {
  return driveOfRootId(roots, item.rootId);
}

export function driveLabelOf(root: DriveRoot, viewerId: string | null): string | null {
  if (root.scope === 'home') return SHARED_DRIVE_LABEL;
  return isDriveOwner(root, viewerId) ? MY_DRIVE_LABEL : null;
}

export function sharedItemLabel(ownerName: string, item: Pick<DriveItem, 'kind'>): string {
  return `${ownerName}’s ${item.kind === 'folder' ? 'folder' : 'file'}`;
}

export function sharedTrailLabel(ownerName: string, item: Pick<DriveItem, 'kind'>): string {
  return `Shared with me › ${sharedItemLabel(ownerName, item)}`;
}

function strongest(left: DriveGrantRole | null, right: DriveGrantRole): DriveGrantRole {
  return left === 'edit' || right === 'edit' ? 'edit' : 'view';
}

export function grantRoleOf(
  grants: readonly DriveGrant[],
  viewerId: string | null,
  coveringItemIds: readonly (string | null)[],
): DriveGrantRole | null {
  let role: DriveGrantRole | null = null;
  for (const grant of grants) {
    if (
      viewerId !== null &&
      grant.profileId === viewerId &&
      coveringItemIds.includes(grant.itemId)
    ) {
      role = strongest(role, grant.role);
    }
  }
  return role;
}

export function driveAccessOf(
  root: DriveRoot,
  viewerId: string | null,
  grantRole: DriveGrantRole | null,
): DriveAccess {
  if (root.scope === 'home') return 'shared';
  if (isDriveOwner(root, viewerId)) return 'own';
  return grantRole ?? 'none';
}

export function canOpen(access: DriveAccess): boolean {
  return access !== 'none';
}

export function canWrite(access: DriveAccess): boolean {
  return access === 'own' || access === 'shared' || access === 'edit';
}

export function canSharePeople(access: DriveAccess): boolean {
  return access === 'own';
}

export function canShareLink(access: DriveAccess): boolean {
  return access === 'own' || access === 'shared';
}

export function canPlace(access: DriveAccess): boolean {
  return access !== 'none';
}

export function placementReadOnly(access: DriveAccess): boolean {
  return access === 'view';
}

export interface DriveOfItem {
  readonly root: DriveRoot | null;
  readonly label: string | null;
  readonly access: DriveAccess;
  readonly grantRole: DriveGrantRole | null;
}

export interface DriveOfItemInput {
  readonly roots: readonly DriveRoot[];
  readonly grants: readonly DriveGrant[];
  readonly profiles: readonly { readonly id: string; readonly name: string }[];
  readonly viewerId: string | null;
  readonly item: Pick<DriveItem, 'rootId' | 'id' | 'parentId' | 'kind'>;
  readonly ancestorIds: readonly string[];
}

export function driveOfItemView(input: DriveOfItemInput): DriveOfItem {
  const { roots, grants, profiles, viewerId, item, ancestorIds } = input;
  const root = driveOfItem(roots, item);
  if (root === null) return { root: null, label: null, access: 'none', grantRole: null };
  const foreign = root.scope === 'person' && !isDriveOwner(root, viewerId);
  const grantRole = foreign
    ? grantRoleOf(grants, viewerId, [item.id, item.parentId, ...ancestorIds])
    : null;
  const ownerName = profiles.find((profile) => profile.id === root.ownerProfileId)?.name;
  const label =
    driveLabelOf(root, viewerId) ??
    (ownerName === undefined ? null : sharedItemLabel(ownerName, item));
  return { root, label, access: driveAccessOf(root, viewerId, grantRole), grantRole };
}
