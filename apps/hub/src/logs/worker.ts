import { parentPort, workerData } from 'node:worker_threads';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { Sql } from '../store/sql';
import { RuntimeLogReads } from '../store/repositories/runtime-log-reads';
import {
  LOG_READ_REQUEST,
  LOG_REQUEST,
  type LogRead,
  type LogReply,
  type LogRequest,
} from './messages';
import { RUNTIME_LOG_SWEEP_SLACK_MS, sweepRuntimeLogs } from './retention';
import { openLogReader, openLogWriter } from './schema';
import { LogWrites } from './writes';

const DATA = z.strictObject({ path: z.string().min(1), mode: z.enum(['write', 'read']) });

const port = parentPort;
if (port === null) throw new Error('The runtime log worker must run in a worker thread.');

const data = DATA.parse(workerData);

function reply(message: LogReply): void {
  port?.postMessage(message);
}

const REQUEST_ID = z.object({ id: z.int() });

function readWith(reads: RuntimeLogReads, read: LogRead): unknown {
  switch (read.method) {
    case 'search':
      return reads.search(read.access, read.search);
    case 'around':
      return reads.around(read.access, read.around);
    case 'sources':
      return reads.sources(read.access);
    case 'components':
      return reads.components(read.access, read.since, read.levels);
    case 'signatures':
      return reads.signatures(read.access, read.since, read.component);
    case 'platforms':
      return reads.platforms(read.access);
    case 'gaps':
      return reads.gaps(read.access);
    case 'clientOf':
      return reads.clientOf(read.logId);
  }
}

function serveReads(path: string): void {
  const reads = new RuntimeLogReads(new Sql(openLogReader(path)));
  port?.on('message', (raw: unknown) => {
    const parsed = LOG_READ_REQUEST.safeParse(raw);
    if (!parsed.success) {
      reply({ id: REQUEST_ID.parse(raw).id, failure: z.prettifyError(parsed.error) });
      return;
    }
    try {
      reply({ id: parsed.data.id, value: readWith(reads, parsed.data.read) });
    } catch (cause) {
      reply({ id: parsed.data.id, failure: messageOf(cause) });
    }
  });
}

function handled(writes: LogWrites, request: LogRequest): LogReply {
  switch (request.op) {
    case 'append': {
      const appended = writes.append(request.records, request.clientId, request.observe);
      writes.touch(request.source, request.at, appended.kept, 0);
      return { id: request.id, ...appended, ack: null };
    }
    case 'ingest': {
      const { ack, evidence } = writes.ingest(request);
      return { id: request.id, kept: ack.stored, evidence, ack };
    }
    case 'gap':
      return {
        id: request.id,
        changed: writes.recordGap(request.source, request.firstSentAt, request.lastSentAt),
      };
    case 'drop':
      return {
        id: request.id,
        changed: writes.drop(request.access, request.before ?? undefined),
      };
  }
}

function serveWrites(path: string): void {
  const sql = new Sql(openLogWriter(path));
  reply({ ready: true });
  let clock = new Date(0);
  const writes = new LogWrites(sql, () => clock.toISOString());
  let dueAt = 0;

  function sweepWhenDue(): void {
    const now = clock;
    if (now.getTime() < dueAt) return;
    const started = performance.now();
    try {
      const sweep = sweepRuntimeLogs(sql, now);
      dueAt = sweep.dueAt;
      reply({ swept: sweep.removed, durationMs: performance.now() - started });
    } catch (cause) {
      dueAt = now.getTime() + RUNTIME_LOG_SWEEP_SLACK_MS;
      reply({ sweepFailure: messageOf(cause) });
    }
  }

  port?.on('message', (raw: unknown) => {
    const parsed = LOG_REQUEST.safeParse(raw);
    if (!parsed.success) {
      reply({ id: REQUEST_ID.parse(raw).id, failure: z.prettifyError(parsed.error) });
      return;
    }
    const request = parsed.data;
    clock = new Date(request.clock);
    try {
      reply(handled(writes, request));
    } catch (cause) {
      reply({ id: request.id, failure: messageOf(cause) });
    }
    sweepWhenDue();
  });
}

if (data.mode === 'read') serveReads(data.path);
else serveWrites(data.path);
