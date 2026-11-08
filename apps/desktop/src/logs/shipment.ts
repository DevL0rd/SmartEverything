import {
  API_ENDPOINTS,
  LOG_RECORD,
  RUNTIME_LOG_ACK,
  type DesktopServer,
  type RuntimeLogBatch,
  type RuntimeLogRecord,
} from '@smarteverything/domain';
import { Logger, shippedRecord, type LogRecord, type LogSink } from '@smarteverything/logging';
import {
  EMPTY_OUTBOX,
  appendOutbox,
  appendRecord,
  nextBatch,
  outboxPath,
  readOutbox,
  writeOutbox,
  type DesktopOutbox,
} from './outbox.js';

const SCOPE = 'desktop.log-shipment';
const REQUEST_TIMEOUT_MS = 15_000;
const log = new Logger(SCOPE);

class ScopeOutbox {
  #saved: DesktopOutbox | null = null;
  #pending: DesktopOutbox = EMPTY_OUTBOX;
  #scheduled = false;

  constructor(
    readonly path: string,
    readonly server: DesktopServer,
  ) {}

  add(record: RuntimeLogRecord): void {
    this.#pending = appendRecord(this.#pending, record);
  }

  schedule(): boolean {
    if (this.#scheduled) return false;
    this.#scheduled = true;
    return true;
  }

  async persist(): Promise<DesktopOutbox> {
    this.#scheduled = false;
    const saved = this.#saved ?? (await readOutbox(this.path));
    this.#saved = saved;
    const incoming = this.#pending;
    if (incoming.entries.length === 0 && incoming.dropped === 0) return saved;
    this.#pending = EMPTY_OUTBOX;
    try {
      const joined = appendOutbox(saved, incoming);
      await this.save(joined);
      return joined;
    } catch (cause) {
      this.#pending = appendOutbox(incoming, this.#pending);
      throw cause;
    }
  }

  async save(state: DesktopOutbox): Promise<void> {
    await writeOutbox(this.path, state);
    this.#saved = state;
  }
}

interface ShippingOptions {
  readonly directory: string;
  readonly fetch: typeof fetch;
}

function shouldShip(record: LogRecord): boolean {
  return (
    record.runtime === 'desktop' &&
    record.scope !== SCOPE &&
    (record.level === 'warn' || record.level === 'error' || record.level === 'exception')
  );
}

async function upload(
  fetcher: typeof fetch,
  server: DesktopServer,
  batch: RuntimeLogBatch,
  signal: AbortSignal,
): Promise<void> {
  const endpoint = API_ENDPOINTS.ingestDesktopRuntimeLogs;
  const response = await fetcher(new URL(endpoint.path, server.url), {
    method: endpoint.method,
    headers: { authorization: `Bearer ${server.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(batch),
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
  if (!response.ok)
    throw new Error(`The hub did not accept desktop logs (HTTP ${String(response.status)}).`);
  const ack = RUNTIME_LOG_ACK.parse(await response.json());
  if (ack.accepted + ack.alreadyStored !== batch.records.length)
    throw new Error('The hub did not acknowledge every desktop log record.');
}

export class DesktopLogShipping {
  #scope: ScopeOutbox | null = null;
  #online = false;
  #closed = false;
  #work = Promise.resolve();
  #abort = new AbortController();
  readonly #base: LogSink | null;

  constructor(private readonly options: ShippingOptions) {
    this.#base = Logger.sink;
    Logger.configure({
      sink: (record): void => {
        try {
          if (this.#base === null) Logger.write(record);
          else this.#base(record);
        } finally {
          this.record(record);
        }
      },
    });
  }

  follow(server: DesktopServer | null): void {
    if (this.#closed) return;
    if (server === null) {
      this.pause();
      this.#scope = null;
      return;
    }
    const path = outboxPath(this.options.directory, server);
    if (this.#scope?.path !== path) {
      this.pause();
      this.#scope = new ScopeOutbox(path, server);
    }
    this.#online = true;
    this.#schedule(this.#scope);
  }

  pause(): void {
    this.#online = false;
    this.#abort.abort();
    this.#abort = new AbortController();
  }

  record(record: LogRecord): void {
    const scope = this.#scope;
    if (scope === null || this.#closed || !shouldShip(record)) return;
    try {
      scope.add(LOG_RECORD.parse(shippedRecord(record, 'server')));
      this.#schedule(scope);
    } catch (cause) {
      log.warn('logs.not_queued', { failure: cause instanceof Error ? cause.name : 'unknown' });
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    Logger.configure({ sink: this.#base });
    this.pause();
    if (this.#scope !== null) this.#schedule(this.#scope);
    await this.#work;
  }

  #schedule(scope: ScopeOutbox): void {
    if (!scope.schedule()) return;
    this.#work = this.#work
      .then(
        () =>
          new Promise<void>((resolve) => {
            setImmediate(resolve);
          }),
      )
      .then(async () => {
        if (await this.#flush(scope)) this.#schedule(scope);
      })
      .catch((cause: unknown) => {
        log.warn('logs.not_sent', { failure: cause instanceof Error ? cause.name : 'unknown' });
      });
  }

  async #flush(scope: ScopeOutbox): Promise<boolean> {
    const saved = await scope.persist();
    if (this.#scope !== scope || !this.#online) return false;
    const batch = nextBatch(saved);
    if (batch === null) return false;
    await upload(this.options.fetch, scope.server, batch, this.#abort.signal);
    const remaining = { entries: saved.entries.slice(batch.records.length), dropped: 0 };
    await scope.save(remaining);
    return remaining.entries.length > 0;
  }
}
