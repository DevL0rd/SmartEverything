import type { ClaudeCapabilities, ClaudeSession } from '@smarteverything/domain';
import type { IndexFile } from './desktop-index';
import type { LiveFile } from './live-files';
import { isoOf } from './tolerant';

export interface LiveSource {
  readonly file: LiveFile;
  readonly present: boolean;
  readonly alive: boolean | null;
}

export interface SessionSources {
  readonly id: string;
  readonly live: LiveSource | null;
  readonly index: IndexFile | null;
}

export interface RowFacts {
  readonly context: number | null;
  readonly waiting: number;
  readonly capabilities: (running: boolean) => ClaudeCapabilities;
}

function liveKey(file: LiveFile): string {
  return file.sessionId ?? `pid:${String(file.pid)}:${file.procStart ?? ''}`;
}

function rank(source: LiveSource): number {
  return (source.alive === true ? 2 : 0) + (source.present ? 1 : 0);
}

function newerOf(left: LiveSource, right: LiveSource): LiveSource {
  const difference = rank(right) - rank(left);
  if (difference !== 0) {
    return difference > 0 ? right : left;
  }
  return (right.file.statusUpdatedAt ?? 0) > (left.file.statusUpdatedAt ?? 0) ? right : left;
}

function bestLiveByKey(live: readonly LiveSource[]): Map<string, LiveSource> {
  const best = new Map<string, LiveSource>();
  for (const source of live) {
    const key = liveKey(source.file);
    const known = best.get(key);
    best.set(key, known === undefined ? source : newerOf(known, source));
  }
  return best;
}

export function mergeSources(
  live: readonly LiveSource[],
  index: readonly IndexFile[],
): SessionSources[] {
  const bestLive = bestLiveByKey(live);
  const keyByHost = new Map(
    [...bestLive].flatMap(([key, source]) =>
      source.file.hostSessionId === undefined ? [] : [[source.file.hostSessionId, key] as const],
    ),
  );
  const merged = new Map<string, SessionSources>(
    [...bestLive].map(([id, source]) => [id, { id, live: source, index: null }]),
  );
  for (const entry of index) {
    const own = entry.cliSessionId ?? entry.sessionId;
    const id = merged.has(own) ? own : (keyByHost.get(entry.sessionId) ?? own);
    merged.set(id, { id, live: merged.get(id)?.live ?? null, index: entry });
  }
  return [...merged.values()];
}

function stateOf(live: LiveSource | null): Pick<ClaudeSession, 'state' | 'last_state'> {
  if (live === null) {
    return { state: 'stopped', last_state: null };
  }
  const status = live.file.status ?? 'unknown';
  if (!live.present || live.alive === false) {
    return { state: 'stopped', last_state: status };
  }
  return { state: live.alive === null ? 'unknown' : status, last_state: null };
}

function latest(...moments: readonly (number | undefined)[]): number | undefined {
  const known = moments.filter((moment) => moment !== undefined);
  return known.length === 0 ? undefined : Math.max(...known);
}

export function isRunning(source: SessionSources): boolean {
  return source.live !== null && source.live.present && source.live.alive === true;
}

function namesOf(source: SessionSources): Pick<ClaudeSession, 'id' | 'desktop_id' | 'title'> {
  const { live, index } = source;
  return {
    id: source.id,
    desktop_id: index?.sessionId ?? live?.file.hostSessionId ?? null,
    title: index?.title ?? live?.file.name ?? null,
  };
}

function placeOf(source: SessionSources): Pick<ClaudeSession, 'cwd' | 'entrypoint'> {
  const { live, index } = source;
  return { cwd: live?.file.cwd ?? index?.cwd ?? null, entrypoint: live?.file.entrypoint ?? null };
}

function settingsOf(
  index: IndexFile | null,
): Pick<ClaudeSession, 'archived' | 'model' | 'permission_mode'> {
  return {
    archived: index?.isArchived === true,
    model: index?.model ?? null,
    permission_mode: index?.permissionMode ?? 'unknown',
  };
}

function timesOf(source: SessionSources): Pick<ClaudeSession, 'started_at' | 'updated_at'> {
  const { live, index } = source;
  return {
    started_at: isoOf(live?.file.startedAt ?? index?.createdAt),
    updated_at: isoOf(
      latest(index?.lastActivityAt, live?.file.statusUpdatedAt, live?.file.updatedAt),
    ),
  };
}

export function sessionOf(source: SessionSources, facts: RowFacts): ClaudeSession {
  const running = isRunning(source);
  return {
    ...namesOf(source),
    ...placeOf(source),
    ...settingsOf(source.index),
    ...stateOf(source.live),
    ...timesOf(source),
    pid: running ? (source.live?.file.pid ?? null) : null,
    waiting_prompts: facts.waiting,
    context_used: running ? facts.context : null,
    capabilities: facts.capabilities(running),
  };
}
