import type { IncomingMessage } from 'node:http';
import { matchesEntityTag } from '../entity-tag';
import { handleMkcol, headerOf, targetOf, type DavTarget } from './collections';
import { destinationOf, handleCopy, handleMove, targetOfHref } from './copy-move';
import {
  authenticateDav,
  DavError,
  guarded,
  type DavCaller,
  type DavDeps,
  type DavExchange,
} from './dav-auth';
import { handleLock, handleUnlock, LockTable, type Protection } from './locks';
import { handlePropfind } from './propfind';
import { CLASS1_METHODS, handleRead, sendOptions } from './read';
import { handleDelete, handlePut } from './write';

export const DAV_COMPLIANCE = '1, 2';
export const CLASS2_METHODS = [...CLASS1_METHODS, 'COPY', 'MOVE', 'LOCK', 'UNLOCK'] as const;

const FIRST_FAILURE = 300;
const TOKEN_PREFIX = 'opaquelocktoken:';
const IF_TOKENS = /<([^<>]*)>|(\()|(\))|\[([^\]]*)\]|\b(Not)\b|(\S)/gu;

interface Condition {
  readonly negated: boolean;
  readonly token: string | null;
  readonly etag: string | null;
}

interface IfList {
  readonly href: string | null;
  readonly conditions: readonly Condition[];
}

interface Scope {
  readonly target: DavTarget;
  readonly membership: boolean;
  readonly subtree: boolean;
}

function malformed(): DavError {
  return new DavError(400, 'The If header is not valid.');
}

class IfParser {
  private readonly lists: IfList[] = [];
  private href: string | null = null;
  private open: Condition[] | null = null;
  private negated = false;

  begin(): void {
    if (this.open !== null) throw malformed();
    this.open = [];
  }

  end(): void {
    if (this.open === null || this.open.length === 0) throw malformed();
    this.lists.push({ href: this.href, conditions: this.open });
    this.open = null;
  }

  not(): void {
    this.negated = true;
  }

  condition(token: string | null, etag: string | null): void {
    if (this.open === null) {
      if (token === null) throw malformed();
      this.href = token;
      return;
    }
    this.open.push({ negated: this.negated, token, etag });
    this.negated = false;
  }

  finish(): readonly IfList[] {
    if (this.open !== null || this.lists.length === 0) throw malformed();
    return this.lists;
  }
}

export function parseIf(header: string): readonly IfList[] {
  const parser = new IfParser();
  for (const match of header.matchAll(IF_TOKENS)) {
    const [, reference, begin, end, etag, not, stray] = match;
    if (stray !== undefined) throw malformed();
    if (begin !== undefined) parser.begin();
    else if (end !== undefined) parser.end();
    else if (not !== undefined) parser.not();
    else parser.condition(reference ?? null, etag ?? null);
  }
  return parser.finish();
}

function holds(condition: Condition, target: DavTarget, active: readonly string[]): boolean {
  const matched =
    condition.token === null
      ? target.item !== undefined && matchesEntityTag(condition.etag ?? undefined, target.item.etag)
      : active.includes(condition.token);
  return matched !== condition.negated;
}

interface Preconditions {
  readonly deps: DavDeps;
  readonly locks: LockTable;
  readonly caller: DavCaller;
  readonly request: IncomingMessage;
}

function submittedTokens(call: Preconditions): readonly string[] {
  const header = headerOf(call.request, 'if');
  if (header === undefined) return [];
  const accepted = parseIf(header).filter((list) => {
    const target =
      list.href === null
        ? targetOf(call.deps, call.caller, call.request)
        : targetOfHref(call.deps, call.caller, call.request, list.href);
    const active = call.locks.covering(target.root.id, target.relPath).map((lock) => lock.token);
    return list.conditions.every((condition) => holds(condition, target, active));
  });
  if (accepted.length === 0) {
    throw new DavError(412, 'None of the conditions in the If header holds.');
  }
  return accepted
    .flatMap((list) => list.conditions)
    .filter((condition) => !condition.negated && condition.token?.startsWith(TOKEN_PREFIX) === true)
    .flatMap((condition) => (condition.token === null ? [] : [condition.token]));
}

type ScopeBuilder = (call: Preconditions, target: DavTarget) => readonly Scope[];

const destinationScope = (call: Preconditions): Scope => ({
  target: destinationOf(call.deps, call.caller, call.request),
  membership: true,
  subtree: true,
});

const SCOPES: Readonly<Record<string, ScopeBuilder>> = {
  PUT: (_call, target) => [{ target, membership: target.item === undefined, subtree: false }],
  MKCOL: (_call, target) => [{ target, membership: true, subtree: false }],
  DELETE: (_call, target) => [{ target, membership: true, subtree: true }],
  MOVE: (call, target) => [{ target, membership: true, subtree: true }, destinationScope(call)],
  COPY: (call) => [destinationScope(call)],
};

function scopesOf(call: Preconditions): readonly Scope[] {
  const target = targetOf(call.deps, call.caller, call.request);
  return SCOPES[call.request.method ?? '']?.(call, target) ?? [];
}

function protect(call: Preconditions, scopes: readonly Scope[]): void {
  const submitted = submittedTokens(call);
  for (const { target, membership, subtree } of scopes) {
    const protection: Protection = {
      submitted,
      profileId: call.caller.actor.profileId,
      membership,
      subtree,
    };
    call.locks.assertWritable(target.root.id, target.relPath, protection);
  }
}

type Mutation = (deps: DavDeps, exchange: DavExchange, caller: DavCaller) => Promise<void>;

const MUTATIONS: Readonly<Record<string, Mutation>> = {
  PUT: handlePut,
  MKCOL: handleMkcol,
  DELETE: handleDelete,
  COPY: handleCopy,
  MOVE: handleMove,
};

const REMOVES_LOCKS: ReadonlySet<string> = new Set(['DELETE', 'COPY', 'MOVE']);

const READS: Readonly<Record<string, (deps: DavDeps, exchange: DavExchange) => Promise<void>>> = {
  PROPFIND: handlePropfind,
  GET: handleRead,
  HEAD: handleRead,
};

function mutate(
  deps: DavDeps,
  locks: LockTable,
  exchange: DavExchange,
  run: Mutation,
): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const call = { deps, locks, caller, request };
    const scopes = scopesOf(call);
    protect(call, scopes);
    await run(deps, exchange, caller);
    if (response.statusCode >= FIRST_FAILURE || !REMOVES_LOCKS.has(request.method ?? '')) return;
    for (const { target } of scopes) locks.dropWithin(target.root.id, target.relPath);
  });
}

function lock(deps: DavDeps, locks: LockTable, exchange: DavExchange): Promise<void> {
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, exchange.request);
    const submitted = submittedTokens({ deps, locks, caller, request: exchange.request });
    const call = { deps, locks, exchange, caller, submitted };
    await (exchange.request.method === 'LOCK' ? handleLock(call) : handleUnlock(call));
  });
}

function refuseMethod(exchange: DavExchange): void {
  const { response } = exchange;
  response.writeHead(405, {
    allow: CLASS2_METHODS.join(', '),
    'content-length': 0,
    'cache-control': 'no-store',
  });
  response.end();
}

export function createDavHandler(deps: DavDeps): (exchange: DavExchange) => Promise<void> {
  const locks = new LockTable(deps.env.now);
  return (exchange) => {
    const method = exchange.request.method ?? '';
    const read = READS[method];
    const mutation = MUTATIONS[method];
    if (method === 'OPTIONS') {
      sendOptions(exchange.response, DAV_COMPLIANCE, CLASS2_METHODS);
      return Promise.resolve();
    }
    if (read !== undefined) return read(deps, exchange);
    if (mutation !== undefined) return mutate(deps, locks, exchange, mutation);
    if (method === 'LOCK' || method === 'UNLOCK') return lock(deps, locks, exchange);
    refuseMethod(exchange);
    return Promise.resolve();
  };
}
