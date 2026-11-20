import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUNTIME_LOG_BATCH, type LOG_RECORD } from '@smarteverything/domain';
import { errorSignature } from '@smarteverything/logging';
import { z } from 'zod';
import {
  PER_RUNTIME_BYTES,
  PER_RUNTIME_ROWS,
  RUNTIME_LOG_KEEP_MS,
  RUNTIME_LOG_SWEEP_SLACK_MS,
  SERVICE_LOG_LINE_BYTES,
  sweepRuntimeLogs,
} from '../../src/logs/retention';
import { openLogWriter } from '../../src/logs/schema';
import { checkIngestAccess, LogWrites, type IngestRequest } from '../../src/logs/writes';
import { RuntimeLogReads } from '../../src/store/repositories/runtime-log-reads';
import type { LogSourceInfo } from '../../src/store/repositories/runtime-log-types';
import { Sql } from '../../src/store/sql';
import { captureLogs } from '../support/logs';

const NOW = '2026-11-05T09:00:00.000Z';

const COUNTED = z.object({ n: z.number() });

const HELD = z.object({ payload: z.string() });

const OWNER = { owner: true, profileId: 'profile-owner' };

const MEMBER = { owner: false, profileId: 'client-phone' };

const PHONE_CLIENT = 'client-phone';

const PHONE: LogSourceInfo = {
  source: `app:${PHONE_CLIENT}`,
  runtime: 'app',
  platform: 'android',
  deviceId: null,
  clientId: PHONE_CLIENT,
};

const HUB: LogSourceInfo = {
  source: 'hub:service',
  runtime: 'hub',
  platform: 'server',
  deviceId: null,
  clientId: null,
};

const LINE = {
  timestamp: NOW,
  level: 'info',
  runtime: 'hub',
  platform: 'server',
  scope: 'hub.service',
  event: 'store.opened',
  payload: { version: 165 },
} as const;

let sql: Sql;

class TestLogs extends RuntimeLogReads {
  private readonly writes: LogWrites;

  constructor(held: Sql) {
    super(held);
    this.writes = new LogWrites(held, () => NOW);
  }

  ingest(request: IngestRequest): ReturnType<LogWrites['ingest']>['ack'] {
    checkIngestAccess(request);
    return this.writes.ingest(request).ack;
  }

  recordGap(source: LogSourceInfo, firstSentAt: string, lastSentAt: string): number {
    return this.writes.recordGap(source, firstSentAt, lastSentAt);
  }
}

let logs: TestLogs;

function build(): void {
  captureLogs();
  sql = new Sql(openLogWriter(':memory:'));
  logs = new TestLogs(sql);
}

function batchOf(
  records: readonly z.input<typeof LOG_RECORD>[],
): z.output<typeof RUNTIME_LOG_BATCH> {
  return RUNTIME_LOG_BATCH.parse({ dropped: 0, records });
}

function stored(): number {
  return sql.get(COUNTED, 'select count(*) as n from runtime_logs')?.n ?? 0;
}

function at(seconds: number): string {
  return new Date(Date.parse(NOW) - seconds * 1000).toISOString();
}

function many(count: number): readonly z.input<typeof LOG_RECORD>[] {
  return Array.from({ length: count }, (_, index) => ({ ...LINE, timestamp: at(count - index) }));
}

beforeEach(build);

afterEach(() => {
  sql.database.close();
});

describe('runtime log store', () => {
  it('keeps an uploaded record as it was sent, positions and all, with the secret fields hidden', () => {
    const stack = 'Error: api_key=examplekey\n    at request (index.android.bundle:16:3)';
    logs.ingest({
      access: MEMBER,
      batch: batchOf([
        {
          ...LINE,
          payload: { detail: [{ note: 'email somebody@example.test', password: 'notstored' }] },
          failure: { name: 'Error', message: 'api_key=examplekey', stack },
        },
      ]),
      source: PHONE,
      deviceId: null,
      now: NOW,
    });
    const [row] = logs.search(MEMBER, { limit: 1 }).rows;
    expect(row?.payload).toEqual({
      detail: [{ note: 'email somebody@example.test', password: '[redacted]' }],
    });
    expect(row?.failure).toMatchObject({ message: 'api_key=examplekey', stack });
    expect(logs.search(MEMBER, { text: 'examplekey', limit: 1 }).rows).toHaveLength(1);
  });

  it('keeps the build that sent a record, so a report can be traced to a release', () => {
    logs.ingest({
      access: OWNER,
      batch: batchOf([{ ...LINE, release: '0.1.4', bundle: 'web-77' }]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    const [withRelease] = logs.search(OWNER, { limit: 10 }).rows;
    expect(withRelease?.release).toBe('0.1.4');
    expect(withRelease?.bundle).toBe('web-77');
    logs.ingest({
      access: OWNER,
      batch: batchOf([{ ...LINE, timestamp: at(1) }]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    const [, without] = logs.search(OWNER, { limit: 10 }).rows;
    expect(without?.release).toBeNull();
    expect(without?.bundle).toBeNull();
  });

  it('files a record under its component and its error signature', () => {
    const failure = { name: 'TimeoutError', message: 'The hub did not answer' };
    logs.ingest({
      access: OWNER,
      batch: batchOf([{ ...LINE, level: 'error', scope: 'hub.claude', failure }]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    const [row] = logs.search(OWNER, { limit: 10 }).rows;
    expect(row?.component).toBe('claude\u0000hub:service');
    expect(row?.signature).toBe(
      errorSignature({
        component: 'claude\u0000hub:service',
        event: 'store.opened',
        failureName: 'TimeoutError',
        failureMessage: 'The hub did not answer',
      }),
    );
    const names = logs.signatures(OWNER, '2026-11-01T00:00:00.000Z', undefined);
    expect(names.signatures.map((one) => one.name)).toEqual(['TimeoutError']);
  });

  it('counts each source once and reports what each recorded', () => {
    const warn = { ...LINE, level: 'warn' as const, timestamp: at(1) };
    const ack = logs.ingest({
      access: OWNER,
      batch: batchOf([LINE, warn]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    expect(ack).toMatchObject({ stored: 2, accepted: 2, overflowed: false });
    expect(logs.sources(OWNER).sources).toEqual([
      {
        source: 'hub:service',
        runtime: 'hub',
        platform: 'server',
        deviceId: null,
        firstAt: NOW,
        lastAt: NOW,
        records: 2,
        dropped: 0,
      },
    ]);
  });

  it('keeps a source out of the list once it has sent nothing for a day', () => {
    logs.ingest({ access: OWNER, batch: batchOf([LINE]), source: HUB, deviceId: null, now: NOW });
    const sweep = sweepRuntimeLogs(sql, new Date('2026-11-07T09:00:00.000Z'));
    expect(sweep.removed['runtime_log_sources']).toBe(1);
    expect(logs.sources(OWNER).sources).toEqual([]);
  });

  it('stores a resent record once and says how much of the batch it already held', () => {
    logs.ingest({ access: OWNER, batch: batchOf([LINE]), source: HUB, deviceId: null, now: NOW });
    const ack = logs.ingest({
      access: OWNER,
      batch: batchOf([LINE]),
      source: HUB,
      deviceId: null,
      now: '2026-11-05T09:02:00.000Z',
    });
    expect(ack).toMatchObject({ stored: 0, accepted: 0, alreadyStored: 1 });
    expect(stored()).toBe(1);
    expect(logs.sources(OWNER).sources[0]?.records).toBe(1);
  });

  it('finds a record by a word in its payload and by its component', () => {
    const reset = {
      ...LINE,
      scope: 'hub.cameras',
      event: 'capture.failed',
      payload: { detail: 'go2rtc reset' },
    };
    logs.ingest({ access: OWNER, batch: batchOf([reset]), source: HUB, deviceId: null, now: NOW });
    expect(logs.search(OWNER, { text: 'go2rtc', limit: 10 }).rows).toHaveLength(1);
    expect(logs.search(OWNER, { text: 'nothing-here', limit: 10 }).rows).toHaveLength(0);
    expect(logs.search(OWNER, { component: 'cameras', limit: 10 }).rows).toHaveLength(1);
  });

  it('shows a member only the records of their own device', () => {
    logs.ingest({
      access: MEMBER,
      batch: batchOf([{ ...LINE, runtime: 'app', scope: 'app.cameras' }]),
      source: PHONE,
      deviceId: 'phone',
      now: NOW,
    });
    logs.ingest({ access: OWNER, batch: batchOf([LINE]), source: HUB, deviceId: null, now: NOW });
    expect(logs.search(MEMBER, { limit: 10 }).rows.map((row) => row.source)).toEqual([
      'app:client-phone',
    ]);
    expect(logs.search(OWNER, { limit: 10 }).rows).toHaveLength(2);
  });

  it('uses the authenticated source runtime and platform rather than the submitted tags', () => {
    logs.ingest({
      access: MEMBER,
      batch: batchOf([LINE]),
      source: PHONE,
      deviceId: 'phone',
      now: NOW,
    });
    expect(logs.search(OWNER, { runtime: 'hub', limit: 10 }).rows).toHaveLength(0);
    const [row] = logs.search(OWNER, { runtime: 'app', limit: 10 }).rows;
    expect(row).toMatchObject({ platform: 'android', deviceId: 'phone' });
  });

  it('refuses a member shipping records for another profile', () => {
    expect(() =>
      logs.ingest({
        access: MEMBER,
        batch: batchOf([LINE]),
        source: HUB,
        deviceId: null,
        now: NOW,
      }),
    ).toThrow(/owner/i);
    expect(stored()).toBe(0);
  });

  it('answers around a record with the records before and after it', () => {
    const times = [at(120), at(60), at(0)];
    logs.ingest({
      access: OWNER,
      batch: batchOf(times.map((timestamp) => ({ ...LINE, timestamp }))),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    const anchor = logs.search(OWNER, { limit: 10 }).rows[1];
    expect(anchor).toBeDefined();
    const around = logs.around(OWNER, {
      ...(anchor === undefined ? {} : { id: anchor.id }),
      before: 5,
      after: 5,
    });
    expect(around?.before.map((row) => row.at)).toEqual([times[0]]);
    expect(around?.after.map((row) => row.at)).toEqual([times[2]]);
  });

  it('records a reported gap without deleting records already received in that range', () => {
    const received = {
      ...LINE,
      timestamp: '2026-11-05T08:05:00.000Z',
      runtime: 'app' as const,
      scope: 'app.cameras',
    };
    logs.ingest({
      access: MEMBER,
      batch: batchOf([received]),
      source: PHONE,
      deviceId: 'phone',
      now: NOW,
    });
    logs.recordGap(PHONE, '2026-11-05T08:00:00.000Z', '2026-11-05T08:06:00.000Z');
    expect(stored()).toBe(1);
    expect(logs.gaps(MEMBER).gaps).toEqual([
      { firstAt: '2026-11-05T08:00:00.000Z', lastAt: '2026-11-05T08:06:00.000Z' },
    ]);
  });

  it('records a batch gap only when records were dropped and preserves the accepted batch', () => {
    const first = '2026-11-05T08:00:00.000Z';
    const received = '2026-11-05T08:05:00.000Z';
    const ship = (dropped: number, timestamp: string): void => {
      logs.ingest({
        access: MEMBER,
        batch: { ...batchOf([{ ...LINE, timestamp }]), oldestSentAt: first, dropped },
        source: PHONE,
        deviceId: 'phone',
        now: NOW,
      });
    };
    ship(0, received);
    expect(logs.gaps(MEMBER).gaps).toEqual([]);
    ship(2, NOW);
    expect(stored()).toBe(2);
    expect(logs.gaps(MEMBER).gaps).toEqual([{ firstAt: first, lastAt: NOW }]);
  });

  it('hides the secret fields of a payload at any depth and stores the rest', () => {
    const recorded = {
      ...LINE,
      payload: {
        password: 'hunter2',
        token: 'sk-live-123',
        nested: { api_key: 'k-9' },
        detail: 'kept',
      },
    };
    logs.ingest({
      access: OWNER,
      batch: batchOf([recorded]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    const held = sql.get(HELD, 'select payload from runtime_logs')?.payload ?? '';
    expect(JSON.parse(held)).toEqual({
      password: '[redacted]',
      token: '[redacted]',
      nested: { api_key: '[redacted]' },
      detail: 'kept',
    });
  });

  it('keeps a native or JS failure with its component and signature', () => {
    const crash = {
      ...LINE,
      timestamp: at(0),
      level: 'exception',
      runtime: 'app',
      platform: 'android',
      scope: 'app.health',
      event: 'native.crashed',
      payload: { thread: 'main' },
      failure: { name: 'NativeCrash', message: 'java.lang.IllegalStateException: refused' },
    } as const;
    expect(
      logs.ingest({
        access: OWNER,
        batch: batchOf([crash]),
        source: PHONE,
        deviceId: 'phone',
        now: NOW,
      }).stored,
    ).toBe(1);
    const [row] = logs.search(OWNER, { limit: 10 }).rows;
    expect(row?.component).toBe('health\u0000app:client-phone');
    expect(row?.failure?.name).toBe('NativeCrash');
    expect(row?.signature).toBe(
      errorSignature({
        component: 'health\u0000app:client-phone',
        event: 'native.crashed',
        failureName: 'NativeCrash',
        failureMessage: 'java.lang.IllegalStateException: refused',
      }),
    );
  });
});

describe('runtime log retention', () => {
  it('bounds each runtime at the whole hub log measured on this machine', () => {
    expect(SERVICE_LOG_LINE_BYTES).toBe(410);
    expect(PER_RUNTIME_ROWS).toBe(108_000);
    expect(PER_RUNTIME_BYTES).toBe(PER_RUNTIME_ROWS * SERVICE_LOG_LINE_BYTES);
  });

  it('forgets records and gaps older than the kept window and drops them from search', () => {
    const old = new Date(Date.parse(NOW) - RUNTIME_LOG_KEEP_MS - 1000).toISOString();
    logs.ingest({
      access: OWNER,
      batch: batchOf([
        { ...LINE, timestamp: old, payload: { detail: 'ancient' } },
        { ...LINE, payload: { detail: 'recent' } },
      ]),
      source: HUB,
      deviceId: null,
      now: NOW,
    });
    sql.run('age a gap', 'insert into runtime_log_gaps values ($s, null, $at, $at, $at)', {
      s: 'hub:service',
      at: old,
    });
    const sweep = sweepRuntimeLogs(sql, new Date(NOW));
    expect(sweep.removed['runtime_logs']).toBe(1);
    expect(sweep.removed['runtime_log_gaps']).toBe(1);
    expect(logs.search(OWNER, { text: 'ancient', limit: 10 }).rows).toHaveLength(0);
    expect(logs.search(OWNER, { text: 'recent', limit: 10 }).rows).toHaveLength(1);
    expect(sweep.dueAt).toBe(Date.parse(NOW) + RUNTIME_LOG_KEEP_MS + RUNTIME_LOG_SWEEP_SLACK_MS);
  });

  it('finds a resent record through an index that does not hold the payload', () => {
    const plan = sql.database
      .prepare(
        "explain query plan select 1 from runtime_logs where source = 'a' and at = 'b' and event = 'c' and scope = 'd' and payload = '{}'",
      )
      .all()
      .map((row) => JSON.stringify(row));
    expect(plan.join(' ')).toContain('runtime_logs_once');
    const columns = sql.database
      .prepare("select name from pragma_index_info('runtime_logs_once')")
      .all()
      .map((row) => JSON.stringify(row));
    expect(columns.join(' ')).not.toContain('payload');
  });

  it('keeps the newest PER_RUNTIME_ROWS records of a runtime and forgets the rest', () => {
    const records = many(PER_RUNTIME_ROWS + 4100);
    for (let start = 0; start < records.length; start += 2000) {
      logs.ingest({
        access: OWNER,
        batch: batchOf(records.slice(start, start + 2000)),
        source: HUB,
        deviceId: null,
        now: NOW,
      });
    }
    expect(stored()).toBe(PER_RUNTIME_ROWS + 4100);
    expect(sweepRuntimeLogs(sql, new Date(NOW)).removed['runtime_logs']).toBe(4100);
    expect(stored()).toBe(PER_RUNTIME_ROWS);
    expect(logs.search(OWNER, { limit: 1 }).rows[0]?.at).toBe(at(1));
    expect(logs.search(OWNER, { limit: 100 }).rows.at(-1)?.at).toBe(at(100));
  });

  it('ranks a runtime from its own index instead of scanning and sorting the whole table', () => {
    const plan = sql.database
      .prepare(
        "explain query plan select id from runtime_logs where runtime = 'hub' order by at desc, id desc",
      )
      .all()
      .map((row) => JSON.stringify(row));
    expect(plan.join(' ')).toContain('runtime_logs_runtime_at');
    expect(plan.join(' ')).not.toContain('TEMP B-TREE');
  });
});
