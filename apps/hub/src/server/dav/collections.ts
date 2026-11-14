import type { IncomingMessage } from 'node:http';
import { dirname } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { canWrite, driveAccess, itemAccess, type ItemAccess } from '../../drive/access';
import { folderDraft, identityOf, isoOf, parentOf, recordItem } from '../../drive/changes';
import { DriveWriteError, locate } from '../../drive/intents';
import { DrivePathError, normalizeRelativePath } from '../../drive/paths';
import { MARKER_DIRECTORY } from '../../drive/root-marker';
import {
  authenticateDav,
  DavError,
  guarded,
  type DavCaller,
  type DavDeps,
  type DavExchange,
} from './dav-auth';

export const DAV_PREFIX = '/dav/';

export interface DavTarget {
  readonly root: StoredDrive;
  readonly relPath: string;
  readonly item: DriveItem | undefined;
  readonly access: ItemAccess;
}

const ABSOLUTE_FORM = /^https?:\/\/[^/]+(\/.*)$/u;

function rawPathOf(request: IncomingMessage): string {
  const raw = request.url ?? '';
  const origin = ABSOLUTE_FORM.exec(raw);
  const target = origin?.[1] ?? raw;
  return target.split(/[?#]/u, 1)[0] ?? '';
}

function decodeSegment(segment: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch (cause) {
    throw new DrivePathError('invalid', 'The path is not valid percent-encoding.', cause);
  }
  if (decoded.includes('/')) {
    throw new DrivePathError('invalid', 'An encoded slash cannot be part of a name.');
  }
  return decoded;
}

export interface DavLocation {
  readonly rootId: string;
  readonly relPath: string;
}

export function locationOf(request: IncomingMessage): DavLocation {
  const raw = rawPathOf(request);
  if (!raw.startsWith(DAV_PREFIX)) {
    throw new DavError(404, 'This is not a WebDAV path.');
  }
  const parts = raw.slice(DAV_PREFIX.length).split('/');
  const [rootPart = '', ...rest] = parts;
  if (rest.at(-1) === '') rest.pop();
  const relPath = normalizeRelativePath(rest.map(decodeSegment).join('/'));
  if (relPath === MARKER_DIRECTORY || relPath.startsWith(`${MARKER_DIRECTORY}/`)) {
    throw new DavError(
      403,
      'The hub keeps its own files in this folder; they are not part of the drive.',
    );
  }
  return { rootId: decodeSegment(rootPart), relPath };
}

function accessOf(
  deps: DavDeps,
  caller: DavCaller,
  root: StoredDrive,
  relPath: string,
): ItemAccess {
  const whole = driveAccess(caller.actor, root);
  if (whole !== 'none') return whole;
  for (let path = relPath; path !== ''; path = dirname(path) === '.' ? '' : dirname(path)) {
    const item = deps.store.driveItems.byPath(root.id, path, null);
    if (item !== undefined) return itemAccess(deps.store, caller.actor, root, item);
  }
  return 'none';
}

export function targetIn(
  deps: DavDeps,
  caller: DavCaller,
  location: { readonly rootId: string; readonly relPath: string },
): DavTarget {
  const { rootId, relPath } = location;
  const root = deps.store.driveRoots.find(rootId);
  const access = root === undefined ? 'none' : accessOf(deps, caller, root, relPath);
  if (root === undefined || access === 'none') {
    throw new DavError(404, 'There is no such drive or folder for this person.');
  }
  const item =
    relPath === ''
      ? undefined
      : deps.store.driveItems.byPath(root.id, relPath, caller.actor.profileId);
  return { root, relPath, item, access };
}

export function targetOf(deps: DavDeps, caller: DavCaller, request: IncomingMessage): DavTarget {
  return targetIn(deps, caller, locationOf(request));
}

export function writableOf(target: DavTarget): StoredDrive {
  if (!canWrite(target.access)) {
    throw new DavError(403, 'You can only view this; you cannot change it.');
  }
  return target.root;
}

export function headerOf(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function hasBody(request: IncomingMessage): boolean {
  const length = request.headers['content-length'];
  return (
    request.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0')
  );
}

async function makeFolder(deps: DavDeps, caller: DavCaller, target: DavTarget): Promise<void> {
  const { env } = deps;
  const root = writableOf(target);
  const parent = parentOf(env, root.id, target.relPath);
  const path = await locate(root, target.relPath);
  if ((await env.files.stamp(path)) !== null) {
    throw new DriveWriteError('exists', 'A folder or file with that name is already on disk.');
  }
  await env.files.mkdir(path);
  const stamp = await env.files.stamp(path);
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The new folder is missing after it was made.');
  }
  recordItem(env, {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: parent?.id ?? null,
        relPath: target.relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: env.now().toISOString(),
        outside: false,
        addedByProfileId: caller.actor.profileId,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor: caller.change,
  });
}

export function handleMkcol(deps: DavDeps, exchange: DavExchange): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const target = targetOf(deps, caller, request);
    if (hasBody(request)) {
      throw new DavError(415, 'A collection is made without a request body.');
    }
    if (target.relPath === '' || target.item !== undefined) {
      throw new DavError(405, 'Something already exists at that address.');
    }
    await makeFolder(deps, caller, target);
    response.writeHead(201, { 'content-length': 0, 'cache-control': 'no-store' });
    response.end();
  });
}
