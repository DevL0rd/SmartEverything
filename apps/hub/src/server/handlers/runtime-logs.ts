import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { directClient, profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';
import type { LogAccess, LogSourceInfo } from '../../store/repositories/runtime-log-types';

const HOUR_MS = 3_600_000;

const DAY_MS = 24 * HOUR_MS;

const WEEK_MS = 7 * DAY_MS;

const FAILURE_LEVELS = ['warn', 'error', 'exception'] as const;

type RuntimeLogContext = Pick<ServerContext, 'store'>;
type WriteName =
  'ingestRuntimeLogs' | 'ingestDesktopRuntimeLogs' | 'reportRuntimeLogGap' | 'dropRuntimeLogs';
type ReadName =
  | 'searchRuntimeLogs'
  | 'readRuntimeLogsAround'
  | 'readRuntimeLogSources'
  | 'readRuntimeLogComponents'
  | 'readRuntimeLogSignatures'
  | 'readRuntimeLogPlatforms'
  | 'readRuntimeLogGaps';

type LogRoutes<Name extends ReadName | WriteName> = {
  readonly [Key in Name]: Bound<(typeof E)[Key]>;
};

function accessOf(context: RuntimeLogContext, caller: Caller): LogAccess {
  if (caller.kind === 'anonymous') {
    return { owner: false, profileId: null };
  }
  return {
    owner: roleOfCaller(caller) === 'owner',
    profileId: profileIdOf(context.store, caller),
  };
}

function sourceOf(context: RuntimeLogContext, caller: Caller): LogSourceInfo {
  const client = directClient(caller);
  if (client === undefined) {
    throw new ApiError('forbidden', 'Only a paired app may send its logs.');
  }
  return {
    source: `app:${client.id}`,
    runtime: 'app',
    platform: client.platform === 'desktop' ? 'web' : client.platform,
    deviceId: client.id,
    clientId: profileIdOf(context.store, caller),
  };
}

function sinceOf(since: string | undefined, now: Date, fallbackMs: number): string {
  return since ?? new Date(now.getTime() - fallbackMs).toISOString();
}

function desktopSourceOf(caller: Caller): LogSourceInfo {
  const client = directClient(caller);
  if (client?.platform !== 'desktop' || client.role !== 'owner') {
    throw new ApiError('forbidden', 'Only a paired owner desktop may send desktop process logs.');
  }
  return {
    source: `desktop:${client.id}`,
    runtime: 'desktop',
    platform: 'server',
    deviceId: client.id,
    clientId: null,
  };
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'LogAccessError') {
      throw new ApiError('forbidden', 'Only an owner may read the logs of another profile.');
    }
    throw cause;
  }
}

function writeRoutes(context: RuntimeLogContext, now: () => Date): LogRoutes<WriteName> {
  const logs = context.store.runtimeLogs;
  return {
    ingestDesktopRuntimeLogs: bound(E.ingestDesktopRuntimeLogs, ({ body, caller }) => {
      const source = desktopSourceOf(caller);
      return logs.ingest({
        access: { owner: true, profileId: null },
        batch: body,
        source,
        deviceId: source.deviceId,
        now: now().toISOString(),
      });
    }),
    ingestRuntimeLogs: bound(E.ingestRuntimeLogs, ({ body, caller }) => {
      const source = sourceOf(context, caller);
      if (body.clientId !== source.deviceId || body.profileId !== source.clientId) {
        throw new ApiError(
          'conflict',
          'The active profile or paired device changed before the logs arrived.',
        );
      }
      return guarded(() =>
        logs.ingest({
          access: accessOf(context, caller),
          batch: body,
          source,
          deviceId: source.deviceId,
          now: now().toISOString(),
        }),
      );
    }),
    reportRuntimeLogGap: bound(E.reportRuntimeLogGap, ({ body, caller }) =>
      guarded(() => {
        logs.recordGap(sourceOf(context, caller), body.firstSentAt, body.lastSentAt);
        return DONE_REPLY;
      }),
    ),
    dropRuntimeLogs: bound(E.dropRuntimeLogs, ({ query, caller }) =>
      guarded(() => ({ dropped: logs.drop(accessOf(context, caller), query.before) })),
    ),
  };
}

function readRoutes(context: RuntimeLogContext, now: () => Date): LogRoutes<ReadName> {
  const logs = context.store.runtimeLogs;
  return {
    searchRuntimeLogs: bound(E.searchRuntimeLogs, ({ query, caller }) =>
      guarded(() => logs.search(accessOf(context, caller), query)),
    ),
    readRuntimeLogsAround: bound(E.readRuntimeLogsAround, ({ query, caller }) =>
      guarded(() => {
        const around = logs.around(accessOf(context, caller), query);
        if (around === null) {
          throw new ApiError('not_found', 'There is no log record at that moment.');
        }
        return around;
      }),
    ),
    readRuntimeLogSources: bound(E.readRuntimeLogSources, ({ caller }) =>
      guarded(() => logs.sources(accessOf(context, caller))),
    ),
    readRuntimeLogComponents: bound(E.readRuntimeLogComponents, ({ query, caller }) =>
      guarded(() =>
        logs.components(
          accessOf(context, caller),
          sinceOf(query.since, now(), DAY_MS),
          query.levels ?? FAILURE_LEVELS,
        ),
      ),
    ),
    readRuntimeLogSignatures: bound(E.readRuntimeLogSignatures, ({ query, caller }) =>
      guarded(() =>
        logs.signatures(
          accessOf(context, caller),
          sinceOf(query.since, now(), WEEK_MS),
          query.component,
        ),
      ),
    ),
    readRuntimeLogPlatforms: bound(E.readRuntimeLogPlatforms, ({ caller }) =>
      guarded(() => logs.platforms(accessOf(context, caller))),
    ),
    readRuntimeLogGaps: bound(E.readRuntimeLogGaps, ({ caller }) =>
      guarded(() => logs.gaps(accessOf(context, caller))),
    ),
  };
}

export function runtimeLogRoutes(
  context: RuntimeLogContext,
  now: () => Date,
): LogRoutes<ReadName | WriteName> {
  return { ...writeRoutes(context, now), ...readRoutes(context, now) };
}
