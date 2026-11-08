import {
  LOG_LEVEL,
  LOG_PLATFORM,
  LOG_RUNTIME,
  type RUNTIME_LOG_AROUND,
  type RUNTIME_LOG_COMPONENTS,
  type RUNTIME_LOG_GAPS,
  type RUNTIME_LOG_PAGE,
  type RUNTIME_LOG_PLATFORMS,
  RUNTIME_LOG_ROW,
  type RUNTIME_LOG_SIGNATURES,
  type RUNTIME_LOG_SOURCES,
  type RuntimeLogRow,
  type RuntimeLogSignature,
  type RuntimeLogSource,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { allOf, inList, type SqlFilter, type SqlParameters } from '../sql';
import type { LogAccess, LogAround, LogSearch } from './runtime-log-types';

const STORED = z.object({
  id: z.int(),
  at: z.string(),
  source: z.string(),
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  device_id: z.string().nullable(),
  component: z.string(),
  level: LOG_LEVEL,
  scope: z.string(),
  event: z.string(),
  payload: z.string(),
  failure: z.string().nullable(),
  signature: z.string().nullable(),
  duration_ms: z.number().nullable(),
  recorded_at: z.string(),
  release: z.string().nullable(),
  bundle: z.string().nullable(),
});

const FAILURE = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  cause: z
    .object({ name: z.string(), message: z.string(), stack: z.string().optional() })
    .optional(),
});

const LIMIT = '$limit';

const COLUMNS = `id, at, source, runtime, platform, device_id, component, level, scope, event, payload, failure, signature, duration_ms, recorded_at, release, bundle`;

const SIGNATURE_ROW = z.object({
  signature: z.string(),
  component: z.string(),
  event: z.string(),
  failure: z.string().nullable(),
  occurrences: z.number(),
  first_at: z.string(),
  last_at: z.string(),
  last_id: z.number(),
});

const COMPONENT_ROW = z.object({
  component: z.string(),
  runtime: STORED.shape.runtime,
  last_at: z.string(),
  records: z.number(),
  failures: z.number(),
  last_failure_at: z.string().nullable(),
});

const GAP_ROW = z.object({
  first_at: z.string(),
  last_at: z.string(),
});

const SOURCE_ROW = z.object({
  source: z.string(),
  runtime: STORED.shape.runtime,
  platform: STORED.shape.platform,
  device_id: z.string().nullable(),
  first_at: z.string(),
  last_at: z.string(),
  records: z.number(),
  dropped: z.number(),
});

function signatureOf(row: z.output<typeof SIGNATURE_ROW>): RuntimeLogSignature {
  const failure = row.failure === null ? null : FAILURE.parse(JSON.parse(row.failure));
  return {
    signature: row.signature,
    component: row.component,
    event: row.event,
    name: failure?.name ?? null,
    message: failure?.message ?? null,
    occurrences: row.occurrences,
    firstAt: row.first_at,
    lastAt: row.last_at,
    lastId: row.last_id,
  };
}

function sourceOf(row: z.output<typeof SOURCE_ROW>): RuntimeLogSource {
  return {
    source: row.source,
    runtime: row.runtime,
    platform: row.platform,
    deviceId: row.device_id,
    firstAt: row.first_at,
    lastAt: row.last_at,
    records: row.records,
    dropped: row.dropped,
  };
}

function signatureQuery(
  access: LogAccess,
  since: string,
  component: string | undefined,
): SqlFilter {
  return allOf([
    readFilter(access),
    { text: 'signature is not null', parameters: {} },
    { text: 'at >= $since', parameters: { since } },
    ...(component === undefined
      ? []
      : [{ text: 'component like $component', parameters: { component: `${component}%` } }]),
  ]);
}

const WORDS = /[\p{L}\p{N}]+/gu;

const SEARCH = 'runtime_logs_search';

function rowOf(stored: z.output<typeof STORED>): RuntimeLogRow {
  const failure = stored.failure === null ? null : FAILURE.parse(JSON.parse(stored.failure));
  return {
    id: stored.id,
    at: stored.at,
    source: stored.source,
    runtime: stored.runtime,
    platform: stored.platform,
    deviceId: stored.device_id,
    component: stored.component,
    level: stored.level,
    scope: stored.scope,
    event: stored.event,
    payload: RUNTIME_LOG_ROW.shape.payload.parse(JSON.parse(stored.payload)),
    failure,
    signature: stored.signature,
    durationMs: stored.duration_ms,
    recordedAt: stored.recorded_at,
    release: stored.release,
    bundle: stored.bundle,
  };
}

function nearestAt(
  target: number,
  earlier: RuntimeLogRow | undefined,
  later: RuntimeLogRow | undefined,
): RuntimeLogRow | null {
  if (earlier === undefined) return later ?? null;
  if (later === undefined) return earlier;
  return target - Date.parse(earlier.at) <= Date.parse(later.at) - target ? earlier : later;
}

const QUOTE = /["*()]/g;

function matchOf(text: string): string | null {
  const tokens = (text.replace(QUOTE, ' ').match(WORDS) ?? []).filter(
    (token) => token.toLowerCase() !== 'and',
  );
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"`).join(' AND ');
}

export class LogAccessError extends Error {
  override readonly name = 'LogAccessError';

  constructor() {
    super('Only the owner may read the logs of another profile.');
  }
}

export function readFilter(access: LogAccess): SqlFilter {
  if (access.owner) {
    return { text: '1 = 1', parameters: {} };
  }
  if (access.profileId === null) {
    throw new LogAccessError();
  }
  return { text: 'client_id = $profileId', parameters: { profileId: access.profileId } };
}

function timeParts(search: LogSearch): SqlFilter[] {
  const parts: SqlFilter[] = [{ text: 'at >= $from', parameters: { from: search.from ?? '' } }];
  if (search.to !== undefined) {
    parts.push(
      search.toId === undefined
        ? { text: 'at < $to', parameters: { to: search.to } }
        : {
            text: '(at < $to or (at = $to and id < $toId))',
            parameters: { to: search.to, toId: search.toId },
          },
    );
  }
  return parts;
}

function searchParts(search: LogSearch): SqlFilter[] {
  const parts = timeParts(search);
  if (search.level !== undefined) {
    parts.push({ text: 'level = $level', parameters: { level: search.level } });
  }
  if (search.scope !== undefined) {
    parts.push({ text: 'scope = $scope', parameters: { scope: search.scope } });
  }
  if (search.runtime !== undefined) {
    parts.push({ text: 'runtime = $runtime', parameters: { runtime: search.runtime } });
  }
  if (search.source !== undefined) {
    parts.push({ text: 'source = $source', parameters: { source: search.source } });
  }
  if (search.signature !== undefined) {
    parts.push({ text: 'signature = $signature', parameters: { signature: search.signature } });
  }
  if (search.component !== undefined) {
    parts.push({
      text: 'component like $component',
      parameters: { component: search.component + '%' },
    });
  }
  if (search.deviceIds !== undefined) {
    parts.push(inList('device_id', 'deviceIds', search.deviceIds));
  }
  return parts;
}

function searchFilter(search: LogSearch): SqlFilter {
  return allOf(searchParts(search));
}

export class RuntimeLogReads {
  constructor(protected readonly context: StoreContext) {}

  search(access: LogAccess, search: LogSearch): z.output<typeof RUNTIME_LOG_PAGE> {
    const filter = allOf([readFilter(access), searchFilter(search)]);
    const words = search.text === undefined ? undefined : matchOf(search.text);
    if (words === null) {
      return { rows: [], more: false };
    }
    const matching =
      words === undefined
        ? filter.text
        : `${filter.text} and id in (select rowid from ${SEARCH} where ${SEARCH} match $words)`;
    const rows = this.rows(`${matching} order by at desc, id desc`, {
      ...filter.parameters,
      ...(words === undefined ? {} : { $words: words }),
      [LIMIT]: search.limit + 1,
    });
    return { rows: rows.slice(0, search.limit), more: rows.length > search.limit };
  }

  around(access: LogAccess, around: LogAround): z.output<typeof RUNTIME_LOG_AROUND> | null {
    const anchor = this.anchor(access, around);
    if (anchor === null) return null;
    const anchorAt = anchor.at;
    const anchorId = anchor.id;
    const filter = allOf([searchFilter({ ...around, limit: 1 }), readFilter(access)]);
    const before = this.rows(
      `${filter.text} and (at, id) < ($anchorAt, $anchorId) order by at desc, id desc`,
      { ...filter.parameters, $anchorAt: anchorAt, $anchorId: anchorId, [LIMIT]: around.before },
    ).reverse();
    const after = this.rows(
      `${filter.text} and (at, id) > ($anchorAt, $anchorId) order by at asc, id asc`,
      { ...filter.parameters, $anchorAt: anchorAt, $anchorId: anchorId, [LIMIT]: around.after },
    );
    return { anchor, before, after };
  }

  sources(access: LogAccess): z.output<typeof RUNTIME_LOG_SOURCES> {
    const filter = readFilter(access);
    const rows = this.context.sql.all(
      SOURCE_ROW,
      `select source, runtime, platform, device_id, first_at, last_at, records, dropped
       from runtime_log_sources where ${filter.text} order by last_at desc`,
      filter.parameters,
    );
    return { sources: rows.map(sourceOf) };
  }

  components(
    access: LogAccess,
    since: string,
    levels: readonly string[],
  ): z.output<typeof RUNTIME_LOG_COMPONENTS> {
    const filter = allOf([readFilter(access), { text: 'at >= $since', parameters: { since } }]);
    const rows = this.context.sql.all(
      COMPONENT_ROW,
      `select component, runtime, max(at) as last_at, count(*) as records,
         sum(case when signature is not null then 1 else 0 end) as failures,
         max(case when signature is not null then at end) as last_failure_at
       from runtime_logs where ${filter.text} and level in (select value from json_each($levels))
       group by component, runtime order by last_failure_at desc nulls last, last_at desc`,
      { ...filter.parameters, levels: JSON.stringify(levels) },
    );
    return {
      components: rows.map((row) => ({
        component: row.component,
        runtime: row.runtime,
        lastAt: row.last_at,
        records: row.records,
        failures: row.failures,
        lastFailureAt: row.last_failure_at,
      })),
    };
  }

  signatures(
    access: LogAccess,
    since: string,
    component: string | undefined,
  ): z.output<typeof RUNTIME_LOG_SIGNATURES> {
    const filter = signatureQuery(access, since, component);
    const rows = this.context.sql.all(
      SIGNATURE_ROW,
      `select signature, component, event, failure, count(*) as occurrences, min(at) as first_at,
         max(at) as last_at, max(id) as last_id
       from runtime_logs where ${filter.text} group by signature order by last_at desc`,
      filter.parameters,
    );
    return { signatures: rows.map(signatureOf) };
  }

  platforms(access: LogAccess): z.output<typeof RUNTIME_LOG_PLATFORMS> {
    const filter = readFilter(access);
    const rows = this.context.sql.all(
      z.object({ platform: STORED.shape.platform }),
      `select distinct platform from runtime_log_sources where ${filter.text} order by platform`,
      filter.parameters,
    );
    return { platforms: rows.map((row) => row.platform) };
  }

  gaps(access: LogAccess): z.output<typeof RUNTIME_LOG_GAPS> {
    const filter = readFilter(access);
    const gaps = this.context.sql.all(
      GAP_ROW,
      `select first_at, last_at from runtime_log_gaps where ${filter.text}
       order by last_at desc limit 50`,
      filter.parameters,
    );
    return { gaps: gaps.map((row) => ({ firstAt: row.first_at, lastAt: row.last_at })) };
  }

  drop(access: LogAccess, before: string | undefined): number {
    const filter = allOf([
      readFilter(access),
      ...(before === undefined ? [] : [{ text: 'at < $before', parameters: { before } }]),
    ]);
    return this.context.sql.run(
      'forget runtime logs',
      `delete from runtime_logs where ${filter.text}`,
      filter.parameters,
    );
  }

  private anchor(access: LogAccess, around: LogAround): RuntimeLogRow | null {
    const filter = readFilter(access);
    if (around.id !== undefined) {
      const byId = allOf([filter, { text: 'id = $id', parameters: { id: around.id } }]);
      const found = this.context.sql.all(
        STORED,
        `select ${COLUMNS} from runtime_logs where ${byId.text}`,
        byId.parameters,
      );
      return found.map(rowOf)[0] ?? null;
    }
    if (around.at === undefined) return null;
    const target = new Date(around.at);
    const bounded = allOf([filter, searchFilter({ ...around, limit: 1 })]);
    const parameters = {
      ...bounded.parameters,
      $targetAt: target.toISOString(),
      [LIMIT]: 1,
    };
    const [earlier] = this.rows(
      `${bounded.text} and at <= $targetAt order by at desc, id desc`,
      parameters,
    );
    const [later] = this.rows(
      `${bounded.text} and at > $targetAt order by at asc, id asc`,
      parameters,
    );
    return nearestAt(target.getTime(), earlier, later);
  }

  private rows(clause: string, parameters: SqlParameters): RuntimeLogRow[] {
    return this.context.sql
      .all(STORED, `select ${COLUMNS} from runtime_logs where ${clause} limit ${LIMIT}`, parameters)
      .map(rowOf);
  }
}
