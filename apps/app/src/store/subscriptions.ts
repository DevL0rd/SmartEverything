import { workKey, type Turn, type Turns } from './chat-turns';
import type { DeviceValueIndex } from './device-values';
import type { DeviceValues, LedgerEntry, StoreState, Tables } from './state';

export type Slice = string;

const TABLES = 'tables';
const WORK = 'turnWork';

const KEYED_SLICES: ReadonlySet<string> = new Set(['deviceValues', 'ledger', 'turns']);

const tableSlice = (name: string): Slice => `${TABLES}.${name}`;

const deviceOfSlot = (slot: string): string => slot.slice(0, slot.lastIndexOf('/'));

interface Recorder {
  readonly reads: Set<Slice>;
}

let active: Recorder | null = null;
let current: StoreState | null = null;
let stateView: StoreState | null = null;
let tablesView: Tables | null = null;

function recordRead(slice: Slice): void {
  active?.reads.add(slice);
}

function readable(
  view: object,
  slice: (key: string) => Slice,
  read: (key: string) => unknown,
): void {
  for (const key of Object.keys(view)) {
    Object.defineProperty(view, key, {
      enumerable: false,
      get: (): unknown => {
        const name = slice(key);
        if (name !== '') active?.reads.add(name);
        return read(key);
      },
    });
  }
}

function viewsFor(state: StoreState): StoreState {
  if (stateView !== null && tablesView !== null) return stateView;
  const tables = { ...state.tables };
  const view = { ...state, tables };
  readable(tables, tableSlice, (key) => Reflect.get(current?.tables ?? state.tables, key));
  readable(
    view,
    (key) => (key === TABLES ? '' : key),
    (key) => (key === TABLES ? tables : Reflect.get(current ?? state, key)),
  );
  stateView = view;
  tablesView = tables;
  return view;
}

export class TrackedViewLeakError extends Error {
  override readonly name = 'TrackedViewLeakError';

  constructor() {
    super('A selector returned state.tables itself; select the rows it needs instead.');
  }
}

export function rawState(state: StoreState): StoreState {
  return state === stateView && current !== null ? current : state;
}

export interface Tracked<T> {
  readonly value: T;
  readonly reads: ReadonlySet<Slice>;
}

export function trackReads<T>(state: StoreState, select: (state: StoreState) => T): Tracked<T> {
  const target = rawState(state);
  const view = viewsFor(target);
  const outerActive = active;
  const outerState = current;
  const recorder: Recorder = { reads: new Set() };
  active = recorder;
  current = target;
  try {
    const value = select(view);
    if (value === tablesView) throw new TrackedViewLeakError();
    return { value, reads: recorder.reads };
  } finally {
    active = outerActive;
    current = outerState;
  }
}

const sliceNames = new Map<string, Map<string, Slice>>();

function keyedSlice(prefix: string, key: string): Slice {
  const names = sliceNames.get(prefix) ?? new Map<string, Slice>();
  sliceNames.set(prefix, names);
  const known = names.get(key);
  if (known !== undefined) return known;
  const name = `${prefix}/${key}`;
  names.set(key, name);
  return name;
}

export function deviceValuesRecord(state: StoreState, deviceId: string): DeviceValues | undefined {
  recordRead(keyedSlice('deviceValues', deviceId));
  return rawState(state).deviceValues.get(deviceId);
}

export function ledgerOfDevice(state: StoreState, deviceId: string): StoreState['ledger'] {
  recordRead(keyedSlice('ledger', deviceId));
  return rawState(state).ledger;
}

export function ledgerEntry(state: StoreState, slot: string): LedgerEntry | undefined {
  recordRead(`ledger/${deviceOfSlot(slot)}`);
  return rawState(state).ledger[slot];
}

export function turnsSlice(chatId: string): Slice {
  return keyedSlice('turns', chatId);
}

export function turnsOfChat(state: StoreState, chatId: string): Turns {
  recordRead(turnsSlice(chatId));
  const own: Record<string, Turn> = {};
  for (const [id, turn] of Object.entries(rawState(state).turns)) {
    if (turn.chatId === chatId) own[id] = turn;
  }
  return own;
}

export function messagesSlice(chatId: string): Slice {
  return keyedSlice('messages', chatId);
}

export function messagesTable(
  state: StoreState,
  chatId: string,
): StoreState['tables']['assistant_messages'] {
  recordRead(messagesSlice(chatId));
  return rawState(state).tables.assistant_messages;
}

export function pluginStreamSlice(key: string): Slice {
  return keyedSlice('plugin_streams', key);
}

export function pluginStreamRow(
  state: StoreState,
  key: string,
): StoreState['tables']['plugin_streams']['byId'][string] | undefined {
  recordRead(pluginStreamSlice(key));
  return rawState(state).tables.plugin_streams.byId[key];
}

export function workingTurns(state: StoreState): Turns {
  recordRead(WORK);
  return rawState(state).turns;
}

function workChanged(previous: Turns, next: Turns): boolean {
  for (const id in next) {
    const turn = next[id];
    const before = previous[id];
    if (before !== turn && workKey(before) !== workKey(turn)) return true;
  }
  for (const id in previous) {
    if (!(id in next) && workKey(previous[id]) !== null) return true;
  }
  return false;
}

interface Versions<V> {
  readonly previous: Readonly<Record<string, V>>;
  readonly next: Readonly<Record<string, V>>;
}

function keyedChanges<V>(
  slice: string,
  { previous, next }: Versions<V>,
  subkey: (key: string, value: V) => string,
  out: Set<Slice>,
): void {
  if (previous === next) return;
  out.add(slice);
  for (const key in next) {
    const value = next[key];
    const before = previous[key];
    if (before === value || value === undefined) continue;
    out.add(`${slice}/${subkey(key, value)}`);
    if (before !== undefined) out.add(`${slice}/${subkey(key, before)}`);
  }
  for (const key in previous) {
    const value = previous[key];
    if (value !== undefined && !(key in next)) out.add(`${slice}/${subkey(key, value)}`);
  }
}

function valueChanges(previous: DeviceValueIndex, next: DeviceValueIndex, out: Set<Slice>): void {
  if (previous === next) return;
  out.add('deviceValues');
  previous.changedIds(next, (deviceId) => out.add(keyedSlice('deviceValues', deviceId)));
}

function syncChanged(previous: StoreState['sync'], next: StoreState['sync']): boolean {
  return (
    previous.status !== next.status ||
    previous.problem !== next.problem ||
    previous.outdated !== next.outdated ||
    previous.offlineSince !== next.offlineSince
  );
}

function plainChanges(previous: StoreState, next: StoreState, out: Set<Slice>): void {
  for (const key of Object.keys(next)) {
    if (key === TABLES || key === 'sync' || KEYED_SLICES.has(key)) continue;
    if (!Object.is(Reflect.get(previous, key), Reflect.get(next, key))) out.add(key);
  }
  if (syncChanged(previous.sync, next.sync)) out.add('sync');
}

function turnChanges(previous: Turns, next: Turns, out: Set<Slice>): void {
  keyedChanges('turns', { previous, next }, (_, turn) => turn.chatId, out);
  if (previous !== next && workChanged(previous, next)) out.add(WORK);
}

function messageChanges(
  previous: StoreState['tables']['assistant_messages'],
  next: StoreState['tables']['assistant_messages'],
  out: Set<Slice>,
): void {
  for (const [id, row] of Object.entries(next.byId)) {
    if (previous.byId[id] !== row) out.add(messagesSlice(row.chat_id));
  }
  for (const [id, row] of Object.entries(previous.byId)) {
    if (!(id in next.byId)) out.add(messagesSlice(row.chat_id));
  }
}

function pluginStreamChanges(
  previous: StoreState['tables']['plugin_streams'],
  next: StoreState['tables']['plugin_streams'],
  out: Set<Slice>,
): void {
  for (const [key, row] of Object.entries(next.byId)) {
    if (previous.byId[key] !== row) out.add(pluginStreamSlice(key));
  }
  for (const key of Object.keys(previous.byId)) {
    if (!(key in next.byId)) out.add(pluginStreamSlice(key));
  }
}

function tableChanges(
  previous: StoreState['tables'],
  next: StoreState['tables'],
  out: Set<Slice>,
): void {
  if (previous === next) return;
  if (previous.assistant_messages !== next.assistant_messages) {
    messageChanges(previous.assistant_messages, next.assistant_messages, out);
  }
  if (previous.plugin_streams !== next.plugin_streams) {
    pluginStreamChanges(previous.plugin_streams, next.plugin_streams, out);
  }
  for (const name of Object.keys(next)) {
    if (Reflect.get(previous, name) !== Reflect.get(next, name)) out.add(tableSlice(name));
  }
}

export function changedSlices(previous: StoreState, next: StoreState): ReadonlySet<Slice> {
  const changed = new Set<Slice>();
  plainChanges(previous, next, changed);
  valueChanges(previous.deviceValues, next.deviceValues, changed);
  keyedChanges('ledger', { previous: previous.ledger, next: next.ledger }, deviceOfSlot, changed);
  turnChanges(previous.turns, next.turns, changed);
  tableChanges(previous.tables, next.tables, changed);
  return changed;
}

export interface Subscriber {
  readonly reads: ReadonlySet<Slice>;
  readonly wake: () => void;
}

export class SubscriptionManager {
  private epoch = 0;
  private readonly changedAt = new Map<Slice, number>();
  private readonly subscribers = new Set<Subscriber>();
  private pending = new Set<Slice>();

  get version(): number {
    return this.epoch;
  }

  get size(): number {
    return this.subscribers.size;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  readonly add = (subscriber: Subscriber): (() => void) => {
    this.subscribers.add(subscriber);
    return (): void => {
      this.subscribers.delete(subscriber);
    };
  };

  mark(changed: ReadonlySet<Slice>): void {
    if (changed.size === 0) return;
    this.epoch += 1;
    for (const slice of changed) {
      this.changedAt.set(slice, this.epoch);
      this.pending.add(slice);
    }
  }

  isFresh(reads: ReadonlySet<Slice>, readAt: number): boolean {
    if (reads.size === 0) return false;
    for (const slice of reads) {
      if ((this.changedAt.get(slice) ?? 0) > readAt) return false;
    }
    return true;
  }

  flush(): number {
    const changed = this.pending;
    this.pending = new Set();
    if (changed.size === 0) return 0;
    let woken = 0;
    for (const subscriber of this.subscribers) {
      if (dependsOn(subscriber.reads, changed)) {
        woken += 1;
        subscriber.wake();
      }
    }
    return woken;
  }
}

function dependsOn(reads: ReadonlySet<Slice>, changed: ReadonlySet<Slice>): boolean {
  if (reads.size === 0) return true;
  const [small, large] = reads.size <= changed.size ? [reads, changed] : [changed, reads];
  for (const slice of small) {
    if (large.has(slice)) return true;
  }
  return false;
}
