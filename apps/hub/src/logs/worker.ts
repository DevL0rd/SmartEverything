import { parentPort, workerData } from 'node:worker_threads';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { Sql } from '../store/sql';
import { LOG_REQUEST, type LogReply, type LogRequest } from './messages';
import { RUNTIME_LOG_SWEEP_SLACK_MS, sweepRuntimeLogs } from './retention';
import { openLogWriter } from './schema';
import { LogWrites } from './writes';

const DATA = z.strictObject({ path: z.string().min(1) });

const port = parentPort;
if (port === null) throw new Error('The runtime log writer must run in a worker thread.');

const sql = new Sql(openLogWriter(DATA.parse(workerData).path));
let clock = new Date(0);
const writes = new LogWrites(sql, () => clock.toISOString());
let dueAt = 0;

function reply(message: LogReply): void {
  port?.postMessage(message);
}

function handled(request: LogRequest): LogReply {
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
      return { id: request.id, changed: writes.drop(request.access, request.before ?? undefined) };
  }
}

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

const REQUEST_ID = z.object({ id: z.int() });

port.on('message', (raw: unknown) => {
  const parsed = LOG_REQUEST.safeParse(raw);
  if (!parsed.success) {
    reply({ id: REQUEST_ID.parse(raw).id, failure: z.prettifyError(parsed.error) });
    return;
  }
  const request = parsed.data;
  clock = new Date(request.clock);
  try {
    reply(handled(request));
  } catch (cause) {
    reply({ id: request.id, failure: messageOf(cause) });
  }
  sweepWhenDue();
});
