import {
  completeProcessRow,
  processKey,
  type ComputerLiveNotice,
  type ComputerPartName,
  type ComputerParts,
  type ComputerPartsUpdate,
  type ProcessRow,
  type ProcessRowUpdate,
  type ProcessesPart,
  type ProcessesUpdate,
} from '@smarteverything/domain';
import { ValueStore, usePausable } from '../design/external-store';
import { computerRings, type ComputerRings } from './computer-rings';
import { liveWatch, type LiveWatchRegistry } from './live-watch';
import { sameJson } from './same-json';

export const IDLE_DROP_MS = 60_000;

const PART_NAMES = [
  'summary',
  'cpu',
  'gpu',
  'memory',
  'disks',
  'network',
  'sensors',
  'power',
  'processes',
  'audio',
  'displays',
  'system',
  'windows',
  'services',
  'session',
] as const satisfies readonly ComputerPartName[];

export interface DeviceLive {
  readonly at: string | null;
  readonly parts: ComputerParts;
}

const EMPTY: DeviceLive = { at: null, parts: {} };

function sharedRow(known: ReadonlyMap<string, ProcessRow>, update: ProcessRowUpdate): ProcessRow[] {
  const before = known.get(processKey(update));
  const row = completeProcessRow(before, update);
  if (row === null) return [];
  return before !== undefined && sameJson(before, row) ? [before] : [row];
}

function mergeProcesses(prev: ProcessesPart | undefined, next: ProcessesUpdate): ProcessesPart {
  const known = new Map((prev?.rows ?? []).map((row) => [processKey(row), row] as const));
  const incoming = new Map(
    next.rows.flatMap((update) =>
      sharedRow(known, update).map((row) => [processKey(row), row] as const),
    ),
  );
  const rows = next.order.flatMap((key) => incoming.get(key) ?? known.get(key) ?? []);
  const merged: ProcessesPart = { total: next.total, offset: next.offset, order: next.order, rows };
  return prev !== undefined && sameJson(prev, merged) ? prev : merged;
}

export function mergeParts(prev: ComputerParts, incoming: ComputerPartsUpdate): ComputerParts {
  let next = prev;
  for (const name of PART_NAMES) {
    const value = incoming[name];
    if (value === undefined) continue;
    const kept =
      name === 'processes' && incoming.processes !== undefined
        ? mergeProcesses(prev.processes, incoming.processes)
        : value;
    if (!sameJson(prev[name], kept)) next = Object.assign({}, next, { [name]: kept });
  }
  return next;
}

function heldParts(
  parts: ComputerParts,
  incoming: ComputerPartsUpdate,
  wanted: ReadonlySet<string>,
): ComputerParts {
  const held: ComputerParts = {};
  for (const name of PART_NAMES) {
    if (parts[name] !== undefined && (incoming[name] !== undefined || wanted.has(name)))
      Object.assign(held, { [name]: parts[name] });
  }
  return held;
}

export class ComputerLiveStore {
  private readonly stores = new Map<string, ValueStore<DeviceLive>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly watch: LiveWatchRegistry,
    private readonly rings: ComputerRings,
    private readonly idleMs: number,
  ) {
    watch.follow((deviceId, demanded) => {
      if (demanded) this.keep(deviceId);
      else this.expire(deviceId);
    });
  }

  store(deviceId: string): ValueStore<DeviceLive> {
    const known = this.stores.get(deviceId);
    if (known !== undefined) return known;
    const created = new ValueStore(EMPTY);
    this.stores.set(deviceId, created);
    return created;
  }

  receive(notice: ComputerLiveNotice): void {
    const store = this.store(notice.deviceId);
    const current = store.get();
    const parts = mergeParts(current.parts, notice.parts);
    this.rings.feed(
      notice.deviceId,
      Date.parse(notice.at),
      heldParts(parts, notice.parts, this.watch.topicsOf(notice.deviceId)),
    );
    if (parts !== current.parts) store.set({ at: notice.at, parts });
  }

  private keep(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(deviceId);
  }

  private expire(deviceId: string): void {
    this.keep(deviceId);
    this.timers.set(
      deviceId,
      setTimeout(() => {
        this.timers.delete(deviceId);
        this.store(deviceId).set(EMPTY);
        this.rings.drop(deviceId);
      }, this.idleMs),
    );
  }
}

export const computerLive = new ComputerLiveStore(liveWatch, computerRings, IDLE_DROP_MS);

export function useComputerPart<K extends ComputerPartName>(
  deviceId: string,
  part: K,
): ComputerParts[K] {
  const store = computerLive.store(deviceId);
  return usePausable(store.subscribe, () => store.get().parts[part]);
}
