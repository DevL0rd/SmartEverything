import { AppState } from 'react-native';
import { z } from 'zod';
import { SESSION, SNAPSHOT } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally, errorFields } from '../design/log-tally';
import { touchQuietIn } from '../design/touch-activity';
import { jsonText } from '../format/json-text';
import type { EntityStore } from './entity-store';
import {
  CACHE_VERSION,
  CACHED_SHARED_LISTS,
  LIST_DEBOUNCE_MS,
  OWNER_LISTS,
  SHARED_LISTS,
  metaKey,
  metaSlot,
  slotsOf,
  type Slot,
} from './persistence-slots';
import { readStored, removeStored, writeStored } from './snapshot-storage';
import type { StoreState } from './state';

const log = new Logger('app.persistence');
const written = new LogTally(log, 'snapshot.summarised', 10_000);

const TOUCH_QUIET_MS = 1500;

const META = z.looseObject({
  version: z.literal(CACHE_VERSION),
  seq: z.number(),
  session: SESSION,
  tables: z.record(z.string(), z.unknown()),
});

function hashOf(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function keyOf(serverUrl: string): string {
  return `smarteverything.snapshot.${hashOf(serverUrl)}`;
}

function parsedKey(texts: ReadonlyMap<string, string>, key: string): unknown {
  const text = texts.get(key);
  const read = text === undefined ? null : jsonText(text);
  return read?.ok === true ? read.value : undefined;
}

function assemble(base: string, texts: ReadonlyMap<string, string>): unknown {
  const meta = META.safeParse(parsedKey(texts, metaKey(base)));
  if (!meta.success) {
    return undefined;
  }
  const lists = (names: readonly string[], prefix: 't' | 'o'): Record<string, unknown> =>
    Object.fromEntries(names.map((name) => [name, parsedKey(texts, `${base}.${prefix}.${name}`)]));
  const owner = meta.data.session.client.role === 'owner';
  const empty = SHARED_LISTS.filter((name) => !CACHED_SHARED_LISTS.includes(name));
  return {
    seq: meta.data.seq,
    session: meta.data.session,
    firewall: meta.data['firewall'],
    tables: {
      ...Object.fromEntries(empty.map((name) => [name, []])),
      ...lists(CACHED_SHARED_LISTS, 't'),
      ...meta.data.tables,
      device_state: parsedKey(texts, `${base}.device_state`),
    },
    owner: owner ? lists(OWNER_LISTS, 'o') : null,
  };
}

export async function restoreSnapshot(
  serverUrl: string,
  store: Pick<EntityStore, 'get' | 'replace'>,
): Promise<void> {
  const base = keyOf(serverUrl);
  const keys = [metaKey(base), ...slotsOf(base).map((slot) => slot.key)];
  const begun = Date.now();
  const texts = await readStored(keys);
  let chars = 0;
  texts.forEach((text) => {
    chars += text.length;
  });
  const readMs = Date.now() - begun;
  if (texts.size === 0) {
    log.info('snapshot.restore_empty', { keys: keys.length, readMs });
    return;
  }
  const parsed = SNAPSHOT.safeParse(assemble(base, texts));
  if (!parsed.success) {
    log.info('snapshot.discarded', {
      reason: 'version changed or unreadable',
      keys: texts.size,
      chars,
      issues: parsed.error.issues.length,
      firstIssuePath: parsed.error.issues[0]?.path.join('.') ?? '',
    });
    await removeStored(keys);
    return;
  }
  const applied = !store.get().loaded;
  if (applied) {
    store.replace(parsed.data);
  }
  log.info('snapshot.restored', {
    keys: texts.size,
    chars,
    readMs,
    durationMs: Date.now() - begun,
    seq: parsed.data.seq,
    applied,
  });
}

function sameRefs(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}

function ready(state: StoreState): boolean {
  return (
    state.settings !== null &&
    state.session !== null &&
    state.firewall !== null &&
    state.sync.seq !== null
  );
}

class SnapshotWriter {
  private readonly meta: Slot;
  private readonly slots: readonly Slot[];
  private readonly written = new Map<Slot, readonly unknown[]>();
  private readonly wroteAt = new Map<Slot, number>();
  private lastSeq: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(
    base: string,
    private readonly store: EntityStore,
  ) {
    this.meta = metaSlot(base);
    this.slots = slotsOf(base);
  }

  readonly arm = (): void => {
    const state = this.store.get();
    if (this.timer !== null || this.flushing || !ready(state)) {
      return;
    }
    const now = Date.now();
    const waits = [...this.slots, this.meta]
      .filter((slot) => this.isDirty(slot, state))
      .map((slot) => this.dueIn(slot, now));
    if (waits.length > 0) {
      this.timer = setTimeout(this.flush, Math.min(...waits));
    }
  };

  readonly flushNow = (): void => {
    log.debug('snapshot.flush_forced', { seq: this.lastSeq });
    this.cancel();
    this.flushing = false;
    this.start(true);
  };

  readonly cancel = (): void => {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.stepTimer !== null) clearTimeout(this.stepTimer);
    this.timer = null;
    this.stepTimer = null;
  };

  private readonly flush = (): void => {
    this.timer = null;
    const wait = touchQuietIn(TOUCH_QUIET_MS);
    if (wait > 0) {
      this.timer = setTimeout(this.flush, wait);
      return;
    }
    this.start(false);
  };

  private isDirty(slot: Slot, state: StoreState): boolean {
    const before = this.written.get(slot);
    return slot.active(state) && (before === undefined || !sameRefs(before, slot.refs(state)));
  }

  private dueIn(slot: Slot, now: number): number {
    return Math.max(
      LIST_DEBOUNCE_MS,
      (this.wroteAt.get(slot) ?? -Infinity) + slot.intervalMs - now,
    );
  }

  private writeSlot(slot: Slot, state: StoreState, seq: number): void {
    const begun = Date.now();
    const text = slot.text(state, seq);
    const serialiseMs = Date.now() - begun;
    this.written.set(slot, slot.refs(state));
    this.wroteAt.set(slot, Date.now());
    written.bump('slotsWritten');
    written.bump('chars', text.length);
    if (serialiseMs > 30) {
      log.debug('snapshot.slow_serialise', { chars: text.length, durationMs: serialiseMs, seq });
    }
    writeStored(slot.key, text)
      .then(() => {
        const durationMs = Date.now() - begun;
        if (durationMs > 100) {
          log.debug('snapshot.slow_write', { chars: text.length, durationMs, seq });
        }
      })
      .catch((error: unknown) => {
        this.written.delete(slot);
        log.warn('snapshot.not_saved', { chars: text.length, seq, ...errorFields(error) });
      });
  }

  private run(state: StoreState, queue: readonly Slot[], seq: number, chunked: boolean): void {
    const [slot, ...rest] = queue;
    if (slot === undefined) {
      this.flushing = false;
      this.arm();
      return;
    }
    this.writeSlot(slot, state, seq);
    if (chunked) {
      this.stepTimer = setTimeout(() => {
        this.run(state, rest, seq, true);
      }, 0);
    } else {
      this.run(state, rest, seq, false);
    }
  }

  private start(force: boolean): void {
    const state = this.store.get();
    if (!ready(state)) {
      return;
    }
    const now = Date.now();
    const dirty = this.slots.filter((slot) => this.isDirty(slot, state));
    const due = dirty.filter((slot) => force || this.dueIn(slot, now) <= LIST_DEBOUNCE_MS);
    const seq = dirty.length > due.length ? this.lastSeq : state.sync.seq;
    if (seq === null || (due.length === 0 && !this.isDirty(this.meta, state))) {
      this.arm();
      return;
    }
    this.lastSeq = seq;
    this.flushing = true;
    log.debug('snapshot.flush_started', {
      due: due.length,
      dirty: dirty.length,
      seq,
      forced: force,
    });
    this.run(state, [...due, this.meta], seq, !force);
  }
}

export function persistSnapshots(serverUrl: string, store: EntityStore): () => void {
  const writer = new SnapshotWriter(keyOf(serverUrl), store);
  log.info('snapshot.persisting', { key: keyOf(serverUrl) });
  const unsubscribe = store.subscribe(writer.arm);
  const appState = AppState.addEventListener('change', (next) => {
    log.debug('snapshot.app_state', { appState: next });
    if (next !== 'active') writer.flushNow();
  });
  return (): void => {
    log.info('snapshot.persisting_stopped');
    unsubscribe();
    appState.remove();
    writer.cancel();
  };
}
