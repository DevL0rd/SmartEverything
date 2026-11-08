import type { BrowserConsoleEvent, BrowserConsoleMessage } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';

const CONSOLE_BYTES = 256 * 1024;
const ENTRY_BYTES = 128;

export interface BrowserConsoleRow extends BrowserConsoleMessage {
  readonly sequence: number;
}

interface ConsoleSnapshot {
  readonly rows: readonly BrowserConsoleRow[];
  readonly bytes: number;
  readonly dropped: number;
}

const EMPTY: ConsoleSnapshot = { rows: [], bytes: 0, dropped: 0 };

function consoleBytes(message: BrowserConsoleMessage): number {
  return ENTRY_BYTES + (message.message.length + message.source.length) * 2;
}

function appendConsole(before: ConsoleSnapshot, row: BrowserConsoleRow): ConsoleSnapshot {
  const size = consoleBytes(row);
  if (size > CONSOLE_BYTES) return { ...before, dropped: before.dropped + 1 };
  let bytes = before.bytes + size;
  let first = 0;
  for (const old of before.rows) {
    if (bytes <= CONSOLE_BYTES) break;
    bytes -= consoleBytes(old);
    first += 1;
  }
  return { rows: [...before.rows.slice(first), row], bytes, dropped: before.dropped + first };
}

type ConsoleListener = (row: BrowserConsoleMessage, history: readonly BrowserConsoleRow[]) => void;

export class BrowserConsoleStore {
  private sequence = 0;
  private readonly snapshots = new ValueStore<ReadonlyMap<string, ConsoleSnapshot>>(new Map());
  private readonly sent = new Map<string, Set<string>>();
  private readonly listeners = new Map<string, ConsoleListener>();
  readonly subscribe = this.snapshots.subscribe;

  read(id: string): ConsoleSnapshot {
    return this.snapshots.get().get(id) ?? EMPTY;
  }

  record(event: BrowserConsoleEvent): void {
    if (event.kind === 'navigation') {
      this.sent.delete(event.id);
      this.clear(event.id);
      return;
    }
    const next = appendConsole(this.read(event.id), { ...event, sequence: ++this.sequence });
    this.write(event.id, next);
    this.listeners.get(event.id)?.(event, next.rows);
  }

  listen(id: string, listener: ConsoleListener): () => void {
    this.listeners.set(id, listener);
    return (): void => {
      if (this.listeners.get(id) === listener) this.listeners.delete(id);
    };
  }

  claim(error: BrowserConsoleMessage): boolean {
    if (error.level !== 'error') return false;
    const key = JSON.stringify([error.source, error.line, error.message]);
    const sent = this.sent.get(error.id) ?? new Set<string>();
    if (sent.has(key)) return false;
    sent.add(key);
    this.sent.set(error.id, sent);
    return true;
  }

  clear(id: string): void {
    if (!this.snapshots.get().has(id)) return;
    const next = new Map(this.snapshots.get());
    next.delete(id);
    this.snapshots.set(next);
  }

  forget(id: string): void {
    this.clear(id);
    this.sent.delete(id);
    this.listeners.delete(id);
  }

  reset(): void {
    this.snapshots.set(new Map());
    this.sent.clear();
    this.listeners.clear();
  }

  private write(id: string, snapshot: ConsoleSnapshot): void {
    this.snapshots.set(new Map(this.snapshots.get()).set(id, snapshot));
  }
}

export const browserConsole = new BrowserConsoleStore();
