import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { dirname } from 'node:path/posix';
import { Readable } from 'node:stream';
import { commitContent } from '../../drive/changes';
import { locate, type DriveWriteRoot } from '../../drive/intents';
import { isInside } from '../../drive/paths';
import { stageBytes } from '../../drive/versions';
import { headerOf, targetOf, writableOf, type DavTarget } from './collections';
import { DavError, guarded, type DavCaller, type DavDeps, type DavExchange } from './dav-auth';
import { hrefOf } from './propfind';

export const SERVER_LOCK_SECONDS = 3600;

const LARGEST_TIMEOUT_SECONDS = 4_294_967_295;
const TOKEN_PREFIX = 'opaquelocktoken:';
const SECONDS = /^Second-(\d+)$/u;
const TOKEN_HEADER = /^<([^<>]+)>$/u;
const LOCKINFO = /<(?:[\w.-]+:)?lockinfo[\s>]/u;
const WRITE_TYPE = /<(?:[\w.-]+:)?locktype\s*>\s*<(?:[\w.-]+:)?write\s*\/>/u;
const SCOPE = /<(?:[\w.-]+:)?lockscope\s*>\s*<(?:[\w.-]+:)?(exclusive|shared)\s*\/>/u;
const OWNER = /<(?:[\w.-]+:)?owner\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?owner\s*>/u;
const TAG = /<[^>]*>/gu;

export type LockScope = 'exclusive' | 'shared';
export type LockDepth = '0' | 'infinity';

export interface DavLock {
  readonly token: string;
  readonly rootId: string;
  readonly relPath: string;
  readonly collection: boolean;
  readonly depth: LockDepth;
  readonly scope: LockScope;
  readonly owner: string;
  readonly profileId: string;
  readonly timeoutSeconds: number;
  readonly expiresAt: number;
}

export interface LockRequest {
  readonly rootId: string;
  readonly relPath: string;
  readonly collection: boolean;
  readonly depth: LockDepth;
  readonly scope: LockScope;
  readonly owner: string;
  readonly profileId: string;
  readonly timeoutSeconds: number;
}

export interface Protection {
  readonly submitted: readonly string[];
  readonly profileId: string;
  readonly membership: boolean;
  readonly subtree: boolean;
}

export function timeoutOf(header: string | undefined): number {
  for (const entry of (header ?? '').split(',')) {
    const value = entry.trim();
    if (value.toLowerCase() === 'infinite') return SERVER_LOCK_SECONDS;
    const seconds = Number(SECONDS.exec(value)?.[1]);
    if (Number.isSafeInteger(seconds) && seconds <= LARGEST_TIMEOUT_SECONDS) return seconds;
  }
  return SERVER_LOCK_SECONDS;
}

function locked(): DavError {
  return new DavError(
    423,
    'The resource is locked; send the lock token in an If header.',
    'lock-token-submitted',
  );
}

export class LockTable {
  private readonly held = new Map<string, DavLock>();

  constructor(private readonly now: () => Date) {}

  private live(): DavLock[] {
    const moment = this.now().getTime();
    for (const [token, lock] of this.held) {
      if (lock.expiresAt <= moment) this.held.delete(token);
    }
    return [...this.held.values()];
  }

  covering(rootId: string, relPath: string): DavLock[] {
    return this.live().filter(
      (lock) =>
        lock.rootId === rootId &&
        isInside(lock.relPath, relPath) &&
        (lock.relPath === relPath || lock.depth === 'infinity'),
    );
  }

  private within(rootId: string, relPath: string): DavLock[] {
    return this.live().filter((lock) => lock.rootId === rootId && isInside(relPath, lock.relPath));
  }

  private protecting(rootId: string, relPath: string, protection: Protection): DavLock[] {
    const found = new Map<string, DavLock>();
    const parent = dirname(relPath) === '.' ? '' : dirname(relPath);
    const groups = [
      this.covering(rootId, relPath),
      protection.membership && relPath !== ''
        ? this.live().filter((lock) => lock.rootId === rootId && lock.relPath === parent)
        : [],
      protection.subtree ? this.within(rootId, relPath) : [],
    ];
    for (const lock of groups.flat()) found.set(lock.token, lock);
    return [...found.values()];
  }

  assertWritable(rootId: string, relPath: string, protection: Protection): void {
    const protecting = this.protecting(rootId, relPath, protection);
    const holds = (lock: DavLock): boolean =>
      protection.submitted.includes(lock.token) && lock.profileId === protection.profileId;
    const exclusive = protecting.filter((lock) => lock.scope === 'exclusive');
    const shared = protecting.filter((lock) => lock.scope === 'shared');
    if (exclusive.every(holds) && (shared.length === 0 || shared.some(holds))) return;
    throw locked();
  }

  acquire(request: LockRequest): DavLock {
    const conflicts = [
      ...this.covering(request.rootId, request.relPath),
      ...(request.depth === 'infinity' ? this.within(request.rootId, request.relPath) : []),
    ];
    const blocked =
      request.scope === 'exclusive'
        ? conflicts.length > 0
        : conflicts.some((lock) => lock.scope === 'exclusive');
    if (blocked) {
      throw new DavError(423, 'Another lock already covers this resource.', 'no-conflicting-lock');
    }
    const lock = {
      ...request,
      token: `${TOKEN_PREFIX}${randomUUID()}`,
      expiresAt: this.now().getTime() + request.timeoutSeconds * 1000,
    };
    this.held.set(lock.token, lock);
    return lock;
  }

  refresh(lock: DavLock, timeoutSeconds: number): DavLock {
    const renewed = {
      ...lock,
      timeoutSeconds,
      expiresAt: this.now().getTime() + timeoutSeconds * 1000,
    };
    this.held.set(renewed.token, renewed);
    return renewed;
  }

  release(rootId: string, relPath: string, token: string, profileId: string): void {
    const lock = this.covering(rootId, relPath).find((candidate) => candidate.token === token);
    if (lock === undefined) {
      throw new DavError(
        409,
        'The lock token does not match a lock on this resource.',
        'lock-token-matches-request-uri',
      );
    }
    if (lock.profileId !== profileId) {
      throw new DavError(403, 'Only the person who holds the lock can release it.');
    }
    this.held.delete(token);
  }

  discard(token: string): void {
    this.held.delete(token);
  }

  dropWithin(rootId: string, relPath: string): void {
    for (const lock of this.within(rootId, relPath)) this.held.delete(lock.token);
  }
}

export interface LockCall {
  readonly deps: DavDeps;
  readonly locks: LockTable;
  readonly exchange: DavExchange;
  readonly caller: DavCaller;
  readonly submitted: readonly string[];
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

function lockDocument(lock: DavLock): string {
  const owner = lock.owner === '' ? '' : `<D:owner>${escapeXml(lock.owner)}</D:owner>`;
  const root = escapeXml(hrefOf(lock.rootId, lock.relPath, lock.collection));
  return (
    '<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>' +
    `<D:locktype><D:write/></D:locktype><D:lockscope><D:${lock.scope}/></D:lockscope>` +
    `<D:depth>${lock.depth}</D:depth>${owner}<D:timeout>Second-${String(lock.timeoutSeconds)}</D:timeout>` +
    `<D:locktoken><D:href>${lock.token}</D:href></D:locktoken>` +
    `<D:lockroot><D:href>${root}</D:href></D:lockroot></D:activelock></D:lockdiscovery></D:prop>`
  );
}

function sendLock(call: LockCall, lock: DavLock, status: number): void {
  const xml = lockDocument(lock);
  call.exchange.response.writeHead(status, {
    'content-type': 'application/xml; charset=utf-8',
    'content-length': Buffer.byteLength(xml),
    'lock-token': `<${lock.token}>`,
    'cache-control': 'no-store',
  });
  call.exchange.response.end(xml);
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const source: AsyncIterable<Uint8Array> = request;
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function depthOf(request: IncomingMessage): LockDepth {
  const depth = headerOf(request, 'depth');
  if (depth === undefined || depth === 'infinity') return 'infinity';
  if (depth === '0') return '0';
  throw new DavError(400, 'A lock is requested with Depth 0 or Depth infinity.');
}

interface LockInfo {
  readonly scope: LockScope;
  readonly owner: string;
}

function lockInfoOf(xml: string): LockInfo {
  const scope = SCOPE.exec(xml)?.[1];
  if (
    !LOCKINFO.test(xml) ||
    !WRITE_TYPE.test(xml) ||
    (scope !== 'exclusive' && scope !== 'shared')
  ) {
    throw new DavError(400, 'Only exclusive and shared write locks can be requested.');
  }
  const owner = unescapeXml((OWNER.exec(xml)?.[1] ?? '').replace(TAG, '').trim());
  return { scope, owner };
}

async function makeEmptyFile(
  deps: DavDeps,
  caller: DavCaller,
  root: DriveWriteRoot,
  relPath: string,
): Promise<void> {
  const staged = await stageBytes(deps.env, root, Readable.from([]));
  try {
    await commitContent(deps.env, { root, staged, relPath, actor: caller.change });
  } catch (cause) {
    await deps.env.files.remove(await locate(root, staged.relPath));
    throw cause;
  }
}

async function createLock(call: LockCall, target: DavTarget, info: LockInfo): Promise<void> {
  const { deps, locks, caller, submitted, exchange } = call;
  const root = writableOf(target.root);
  const creating = target.item === undefined && target.relPath !== '';
  if (creating) {
    locks.assertWritable(root.id, target.relPath, {
      submitted,
      profileId: caller.actor.profileId,
      membership: true,
      subtree: false,
    });
  }
  const lock = locks.acquire({
    rootId: root.id,
    relPath: target.relPath,
    collection: target.relPath === '' || target.item?.kind === 'folder',
    depth: depthOf(exchange.request),
    scope: info.scope,
    owner: info.owner,
    profileId: caller.actor.profileId,
    timeoutSeconds: timeoutOf(headerOf(exchange.request, 'timeout')),
  });
  if (creating) {
    await makeEmptyFile(deps, caller, root, target.relPath).catch((cause: unknown) => {
      locks.discard(lock.token);
      throw cause;
    });
  }
  sendLock(call, lock, creating ? 201 : 200);
}

function refreshLock(call: LockCall, target: DavTarget): void {
  const { locks, caller, submitted, exchange } = call;
  const held = locks
    .covering(target.root.id, target.relPath)
    .find((lock) => submitted.includes(lock.token) && lock.profileId === caller.actor.profileId);
  if (held === undefined) {
    throw new DavError(412, 'None of the submitted lock tokens is a lock you hold here.');
  }
  sendLock(call, locks.refresh(held, timeoutOf(headerOf(exchange.request, 'timeout'))), 200);
}

export function handleLock(call: LockCall): Promise<void> {
  const { deps, caller, exchange } = call;
  return guarded(exchange, async () => {
    const target = targetOf(deps, caller, exchange.request);
    const body = await bodyOf(exchange.request);
    if (body.trim() === '') {
      refreshLock(call, target);
      return;
    }
    await createLock(call, target, lockInfoOf(body));
  });
}

export function handleUnlock(call: LockCall): Promise<void> {
  const { deps, locks, caller, exchange } = call;
  return guarded(exchange, () => {
    const target = targetOf(deps, caller, exchange.request);
    const header = [exchange.request.headers['lock-token']].flat()[0];
    const token = TOKEN_HEADER.exec(header?.trim() ?? '')?.[1];
    if (token === undefined) {
      throw new DavError(400, 'Send the lock to release in a Lock-Token header.');
    }
    locks.release(target.root.id, target.relPath, token, caller.actor.profileId);
    exchange.response.writeHead(204, { 'content-length': 0, 'cache-control': 'no-store' });
    exchange.response.end();
    return Promise.resolve();
  });
}
