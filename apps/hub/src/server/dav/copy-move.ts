import type { IncomingMessage } from 'node:http';
import { basename, dirname } from 'node:path/posix';
import type { DriveItem } from '@smarteverything/domain';
import {
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  parentOf,
  recordItem,
} from '../../drive/changes';
import { DriveWriteError, locate, moveWithin, type DriveWriteRoot } from '../../drive/intents';
import { DrivePathError, isInside, normalizeRelativePath } from '../../drive/paths';
import { checkDriveWrite } from '../../drive/quotas';
import { MARKER_DIRECTORY } from '../../drive/root-marker';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import { repathItem } from '../../drive/service-write-repath';
import { commitTrash } from '../../drive/trash-purge';
import { stageBytes } from '../../drive/versions';
import {
  DAV_PREFIX,
  headerOf,
  targetIn,
  targetOf,
  writableOf,
  type DavLocation,
  type DavTarget,
} from './collections';
import { DavError, guarded, type DavCaller, type DavDeps, type DavExchange } from './dav-auth';

const ABSOLUTE = /^https?:\/\/([^/?#]+)([^?#]*)/iu;

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

function pathOfHref(request: IncomingMessage, href: string): string {
  const absolute = ABSOLUTE.exec(href);
  if (absolute === null) {
    if (!href.startsWith('/')) throw new DavError(400, 'The address is not a path or a URL.');
    return href.split(/[?#]/u, 1)[0] ?? '';
  }
  const [, authority = '', path = ''] = absolute;
  if (authority.includes('@')) throw new DavError(400, 'The address cannot carry credentials.');
  if (authority.toLowerCase() !== request.headers.host?.toLowerCase()) {
    throw new DavError(502, 'A copy or move stays on this hub.');
  }
  return path;
}

export function locationOfHref(request: IncomingMessage, href: string): DavLocation {
  const raw = pathOfHref(request, href);
  if (!raw.startsWith(DAV_PREFIX)) {
    throw new DavError(502, 'The address is not inside the WebDAV tree of this hub.');
  }
  const [rootPart = '', ...rest] = raw.slice(DAV_PREFIX.length).split('/');
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

export function targetOfHref(
  deps: DavDeps,
  caller: DavCaller,
  request: IncomingMessage,
  href: string,
): DavTarget {
  return targetIn(deps, caller, locationOfHref(request, href));
}

export function destinationOf(
  deps: DavDeps,
  caller: DavCaller,
  request: IncomingMessage,
): DavTarget {
  const header = headerOf(request, 'destination');
  if (header === undefined) {
    throw new DavError(400, 'Send the target address in a Destination header.');
  }
  return targetOfHref(deps, caller, request, header);
}

interface Plan {
  readonly deps: DavDeps;
  readonly caller: DavCaller;
  readonly root: DriveWriteRoot;
  readonly item: DriveItem;
  readonly existing: DriveItem | undefined;
  readonly relPath: string;
  readonly parent: DriveItem | null;
  readonly shallow: boolean;
}

function overwriteOf(request: IncomingMessage): boolean {
  const overwrite = headerOf(request, 'overwrite');
  if (overwrite === undefined || overwrite === 'T') return true;
  if (overwrite === 'F') return false;
  throw new DavError(400, 'Overwrite is T or F.');
}

function shallowOf(request: IncomingMessage, move: boolean): boolean {
  const depth = headerOf(request, 'depth');
  if (depth === undefined || depth === 'infinity') return false;
  if (depth === '0' && !move) return true;
  throw new DavError(
    400,
    move ? 'A move is sent with Depth infinity.' : 'A copy is sent with Depth 0 or infinity.',
  );
}

function sourceOf(source: DavTarget): DriveItem {
  if (source.relPath === '')
    throw new DavError(403, 'The top folder of a drive cannot be copied or moved.');
  if (source.item === undefined) throw new DavError(404, 'There is nothing at that address.');
  return source.item;
}

function assertPlace(item: DriveItem, source: DavTarget, destination: DavTarget): void {
  if (destination.root.id !== source.root.id) {
    throw new DavError(403, 'A copy or move stays inside one drive.');
  }
  const overlapping =
    destination.relPath === '' ||
    isInside(destination.relPath, item.relPath) ||
    (item.kind === 'folder' && isInside(item.relPath, destination.relPath));
  if (overlapping) {
    throw new DavError(403, 'The source and the destination overlap.');
  }
}

function planOf(deps: DavDeps, caller: DavCaller, request: IncomingMessage, move: boolean): Plan {
  const source = targetOf(deps, caller, request);
  const item = sourceOf(source);
  const destination = destinationOf(deps, caller, request);
  assertPlace(item, source, destination);
  const overwrite = overwriteOf(request);
  const shallow = shallowOf(request, move);
  const root = writableOf(destination);
  const parent = parentOf(deps.env, root.id, destination.relPath);
  if (destination.item !== undefined && !overwrite) {
    throw new DavError(412, 'The destination exists and Overwrite is F.');
  }
  return {
    deps,
    caller,
    root,
    item,
    existing: destination.item,
    relPath: destination.relPath,
    parent,
    shallow,
  };
}

async function relocate(plan: Plan): Promise<void> {
  const { deps, caller, root, item, relPath, parent } = plan;
  const back = { from: relPath, to: item.relPath, mode: 'keep' } as const;
  await moveWithin(deps.env.files, root, { from: item.relPath, to: relPath, mode: 'keep' });
  try {
    repathItem(
      deps.env,
      item,
      { parentId: parent?.id ?? null, relPath, name: basename(relPath) },
      { op: dirname(item.relPath) === dirname(relPath) ? 'rename' : 'move', actor: caller.change },
    );
  } catch (cause) {
    await moveWithin(deps.env.files, root, back);
    throw cause;
  }
}

async function copyFile(plan: Plan, item: DriveItem, relPath: string): Promise<void> {
  const { deps, caller, root } = plan;
  await checkDriveWrite(deps.guard, {
    profileId: caller.actor.profileId,
    addBytes: item.bytes,
    releasedBytes: 0,
    path: root.path,
  });
  const source = deps.env.files.read(await locate(root, item.relPath));
  const staged = await stageBytes(deps.env, root, source);
  try {
    await commitContent(deps.env, { root, staged, relPath, actor: caller.change });
  } catch (cause) {
    await deps.env.files.remove(await locate(root, staged.relPath));
    throw cause;
  }
}

async function createFolder(
  plan: Plan,
  relPath: string,
  parent: DriveItem | null,
): Promise<DriveItem> {
  const { deps, caller, root } = plan;
  const { env } = deps;
  const path = await locate(root, relPath);
  if ((await env.files.stamp(path)) !== null) {
    throw new DriveWriteError('exists', 'A folder or file with that name is already on disk.');
  }
  await env.files.mkdir(path);
  const stamp = await env.files.stamp(path);
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The new folder is missing after it was made.');
  }
  return recordItem(env, {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: parent?.id ?? null,
        relPath,
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

async function copyChildren(
  plan: Plan,
  folder: DriveItem,
  made: DriveItem,
  relPath: string,
): Promise<void> {
  let after: string | null = null;
  do {
    const window = plan.deps.store.driveItems.children({
      rootId: folder.rootId,
      parentId: folder.id,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: plan.caller.actor.profileId,
    });
    for (const { item } of window.entries) {
      await copyNode(plan, item, `${relPath}/${item.name}`, made);
    }
    after = window.next;
  } while (after !== null);
}

async function copyNode(
  plan: Plan,
  item: DriveItem,
  relPath: string,
  parent: DriveItem | null,
): Promise<void> {
  if (item.kind !== 'folder') {
    await copyFile(plan, item, relPath);
    return;
  }
  const made = await createFolder(plan, relPath, parent);
  if (item !== plan.item || !plan.shallow) await copyChildren(plan, item, made, relPath);
}

function transfer(
  deps: DavDeps,
  exchange: DavExchange,
  caller: DavCaller,
  move: boolean,
): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const plan = planOf(deps, caller, request, move);
    if (plan.existing !== undefined) {
      await commitTrash(deps.env, plan.root, plan.existing.id, caller.change);
    }
    await (move ? relocate(plan) : copyNode(plan, plan.item, plan.relPath, plan.parent));
    response.writeHead(plan.existing === undefined ? 201 : 204, {
      'content-length': 0,
      'cache-control': 'no-store',
    });
    response.end();
  });
}

export function handleCopy(deps: DavDeps, exchange: DavExchange, caller: DavCaller): Promise<void> {
  return transfer(deps, exchange, caller, false);
}

export function handleMove(deps: DavDeps, exchange: DavExchange, caller: DavCaller): Promise<void> {
  return transfer(deps, exchange, caller, true);
}
