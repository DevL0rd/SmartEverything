import { SYNCTHING_EVENTS, type SyncthingEvent } from './rest-schemas';
import type { SyncthingRest } from './rest-client';

const LONG_POLL_SECONDS = 55;
const WATCHDOG_MS = 65_000;
const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;

type EventStreamKind = 'main' | 'disk';

interface EventStreamHandlers {
  readonly onEvents: (events: readonly SyncthingEvent[], bootstrap: boolean) => void;
  readonly onGap: () => void;
  readonly onUp: () => void;
  readonly onDown: (error: unknown) => void;
}

const STREAMS: Readonly<
  Record<EventStreamKind, { readonly path: string; readonly bootstrapLimit: number }>
> = {
  main: { path: '/rest/events', bootstrapLimit: 256 },
  disk: { path: '/rest/events/disk', bootstrapLimit: 100 },
};

export function newestEventId(
  events: readonly SyncthingEvent[],
  cursor: number,
): { newest: number; gap: boolean } {
  let newest = cursor;
  let gap = false;
  for (const event of events) {
    gap ||= newest > 0 && event.id > newest + 1;
    newest = Math.max(newest, event.id);
  }
  return { newest, gap };
}

export class SyncthingEventStreams {
  #generation: AbortController | null = null;
  #retryMs = RETRY_FIRST_MS;
  #retry: NodeJS.Timeout | null = null;
  #up = false;
  #stopped = false;

  constructor(
    private readonly rest: SyncthingRest,
    private readonly handlers: EventStreamHandlers,
  ) {}

  start(): void {
    if (this.#stopped) {
      return;
    }
    const generation = new AbortController();
    this.#generation = generation;
    void this.#follow('main', generation);
    void this.#follow('disk', generation);
  }

  stop(): void {
    this.#stopped = true;
    this.#generation?.abort();
    if (this.#retry !== null) {
      clearTimeout(this.#retry);
    }
  }

  async #follow(kind: EventStreamKind, generation: AbortController): Promise<void> {
    let cursor = 0;
    let bootstrap = true;
    try {
      while (!generation.signal.aborted) {
        cursor = await this.#readOnce(kind, cursor, bootstrap, generation.signal);
        bootstrap = false;
      }
    } catch (error) {
      if (!generation.signal.aborted) {
        this.#fail(error, generation);
      }
    }
  }

  async #readOnce(
    kind: EventStreamKind,
    cursor: number,
    bootstrap: boolean,
    signal: AbortSignal,
  ): Promise<number> {
    const stream = STREAMS[kind];
    const query = bootstrap
      ? { since: '0', limit: String(stream.bootstrapLimit), timeout: '0' }
      : { since: String(cursor), timeout: String(LONG_POLL_SECONDS) };
    const events = await this.rest.read(stream.path, SYNCTHING_EVENTS, {
      query,
      timeoutMs: WATCHDOG_MS,
      signal,
    });
    if (signal.aborted) {
      return cursor;
    }
    this.#markUp();
    const { newest, gap } = newestEventId(events, cursor);
    if (gap && !bootstrap) {
      this.handlers.onGap();
    }
    this.handlers.onEvents(events, bootstrap);
    return newest;
  }

  #markUp(): void {
    this.#retryMs = RETRY_FIRST_MS;
    if (!this.#up) {
      this.#up = true;
      this.handlers.onUp();
    }
  }

  #fail(error: unknown, generation: AbortController): void {
    generation.abort();
    this.#up = false;
    this.handlers.onDown(error);
    const wait = this.#retryMs;
    this.#retryMs = Math.min(RETRY_MAX_MS, this.#retryMs * 2);
    this.#retry = setTimeout(() => {
      this.#retry = null;
      this.start();
    }, wait);
  }
}
