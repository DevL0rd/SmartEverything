import type { DriveLockSet, DriveOfflineSet } from '@smarteverything/domain';
import { notifyFailure } from '../../../components/toast-store';
import { ValueStore } from '../../../design/external-store';
import type { SourceActionSpec } from '../../files';
import { canShareLink, canWrite, type DriveAccess } from '../model/drive-access';
import { isStoredItem, itemOf, type DriveNode, type DriveOrigin } from './drive-node';

export const DRIVE_REQUEST_KINDS = [
  'share',
  'shortcut',
  'colour',
  'comments',
  'fileRequest',
] as const;

export type DriveRequestKind = (typeof DRIVE_REQUEST_KINDS)[number];

export interface DriveRequest {
  readonly kind: DriveRequestKind;
  readonly nodes: readonly DriveNode[];
}

export const driveRequests = new ValueStore<DriveRequest | null>(null);

export function closeDriveRequest(): void {
  driveRequests.set(null);
}

export interface DriveActionEnv {
  readonly online: boolean;
  readonly phone: boolean;
  readonly clientId: string;
  readonly setOffline: (body: DriveOfflineSet) => Promise<unknown>;
  readonly setLock: (body: DriveLockSet) => Promise<unknown>;
  readonly removeShortcut: (shortcutId: string) => Promise<unknown>;
  readonly refresh: () => void;
  readonly request: (request: DriveRequest) => void;
}

type DriveSpec = SourceActionSpec<DriveOrigin>;

function everyNode(nodes: readonly DriveNode[], test: (node: DriveNode) => boolean): boolean {
  return nodes.length > 0 && nodes.every(test);
}

function storedOf(node: DriveNode): boolean {
  const item = itemOf(node);
  return node.origin.kind === 'item' && item !== null && isStoredItem(item);
}

function accessOf(node: DriveNode): DriveAccess {
  if (node.origin.kind === 'trash') return 'none';
  return node.origin.access;
}

interface RequestLook {
  readonly label: string;
  readonly icon: DriveSpec['icon'];
}

const REQUEST_LOOK: Readonly<Record<DriveRequestKind, RequestLook>> = {
  share: { label: 'Share', icon: 'share' },
  shortcut: { label: 'Add shortcut', icon: 'redo' },
  colour: { label: 'Folder colour', icon: 'palette' },
  comments: { label: 'Comments', icon: 'messageCircle' },
  fileRequest: { label: 'Request files', icon: 'upload' },
};

function requestSpec(env: DriveActionEnv, kind: DriveRequestKind): DriveSpec {
  return {
    id: kind,
    ...REQUEST_LOOK[kind],
    many: false,
    run: (nodes): void => {
      env.request({ kind, nodes });
    },
  };
}

function removeShortcutSpec(env: DriveActionEnv): DriveSpec {
  return {
    id: 'removeShortcut',
    label: 'Remove shortcut',
    icon: 'unlink',
    many: true,
    run: (nodes): void => {
      const ids = nodes.flatMap((node) =>
        node.origin.kind === 'shortcut' ? [node.origin.shortcut.id] : [],
      );
      Promise.all(ids.map((id) => env.removeShortcut(id)))
        .then(env.refresh)
        .catch(notifyFailure('The shortcut was not removed.'));
    },
  };
}

function offlineSpec(env: DriveActionEnv, nodes: readonly DriveNode[]): DriveSpec {
  const pinned = nodes.every((node) => node.marks.offline !== null);
  return {
    id: pinned ? 'online' : 'offline',
    label: pinned ? 'Remove from this phone' : 'Make available offline',
    icon: 'smartphone',
    many: true,
    run: (picked): void => {
      Promise.all(
        picked.map((node) =>
          env.setOffline({ clientId: env.clientId, itemId: node.key, on: !pinned }),
        ),
      ).catch(notifyFailure('Offline availability was not changed.'));
    },
  };
}

function lockSpec(env: DriveActionEnv, nodes: readonly DriveNode[]): DriveSpec {
  const locked = nodes.every((node) => node.marks.locked);
  return {
    id: 'lock',
    label: locked ? 'Allow downloads' : 'Make view only',
    icon: 'lock',
    many: true,
    run: (picked): void => {
      Promise.all(picked.map((node) => env.setLock({ itemId: node.key, locked: !locked })))
        .then(env.refresh)
        .catch(notifyFailure('View only was not changed.'));
    },
  };
}

function singleOf(nodes: readonly DriveNode[]): DriveNode | null {
  return nodes.length === 1 ? (nodes[0] ?? null) : null;
}

function singleActions(env: DriveActionEnv, single: DriveNode): readonly DriveSpec[] {
  const folder = single.kind === 'folder';
  return [
    ...(canShareLink(accessOf(single)) ? [requestSpec(env, 'share')] : []),
    requestSpec(env, 'shortcut'),
    ...(folder ? [requestSpec(env, 'colour')] : []),
  ];
}

function manyActions(env: DriveActionEnv, nodes: readonly DriveNode[]): readonly DriveSpec[] {
  const sharable = everyNode(nodes, (node) => canShareLink(accessOf(node)));
  return [
    ...(env.phone ? [offlineSpec(env, nodes)] : []),
    ...(sharable ? [lockSpec(env, nodes)] : []),
  ];
}

function closingActions(env: DriveActionEnv, single: DriveNode): readonly DriveSpec[] {
  const requests = single.kind === 'folder' && canWrite(accessOf(single));
  return [requestSpec(env, 'comments'), ...(requests ? [requestSpec(env, 'fileRequest')] : [])];
}

function itemActions(env: DriveActionEnv, nodes: readonly DriveNode[]): readonly DriveSpec[] {
  const single = singleOf(nodes);
  return [
    ...(single === null ? [] : singleActions(env, single)),
    ...manyActions(env, nodes),
    ...(single === null ? [] : closingActions(env, single)),
  ];
}

export function driveActionsOf(
  nodes: readonly DriveNode[],
  env: DriveActionEnv,
): readonly DriveSpec[] {
  if (!env.online || nodes.length === 0) return [];
  if (everyNode(nodes, (node) => node.origin.kind === 'shortcut')) return [removeShortcutSpec(env)];
  return everyNode(nodes, storedOf) ? itemActions(env, nodes) : [];
}
