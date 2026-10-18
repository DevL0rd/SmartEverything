import AsyncStorage from '@react-native-async-storage/async-storage';
import { patchAll, patchMember, type AnyFunction } from './patch-global';
import { addContributor } from './window-bus';
import { TallyTable, kilobytes, round1, type WindowFields } from './window-math';
import { background } from '@smarteverything/logging';

const TOP = 6;
const KEY_MAX = 18;
const WRITES = new Set([
  'setItem',
  'mergeItem',
  'multiSet',
  'multiMerge',
  'removeItem',
  'multiRemove',
  'clear',
]);
const METHODS = [...WRITES, 'getItem', 'multiGet', 'getAllKeys'];

export function textBytes(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }
  return Array.isArray(value)
    ? value.reduce((sum: number, item: unknown) => sum + textBytes(item), 0)
    : 0;
}

export function keyLabel(method: string, args: readonly unknown[]): string {
  const first = args[0];
  const key =
    typeof first === 'string' ? first : Array.isArray(first) ? `${String(first.length)} keys` : '';
  return `${method}:${key.slice(0, KEY_MAX)}`;
}

class StorageTally {
  readonly reads = new TallyTable();
  readonly writes = new TallyTable();

  fields(): WindowFields {
    const reads = this.reads.total();
    const writes = this.writes.total();
    return {
      stR: reads.count,
      stRKb: kilobytes(reads.bytes),
      stW: writes.count,
      stWKb: kilobytes(writes.bytes),
      stMs: round1(reads.ms + writes.ms),
      stMaxMs: round1(Math.max(reads.worstMs, writes.worstMs)),
    };
  }

  top(): string {
    const top = [
      this.writes.encode(TOP, (row) => row.bytes),
      this.reads.encode(TOP, (row) => row.bytes),
    ]
      .filter((part) => part !== '')
      .join(',');
    this.reads.clear();
    this.writes.clear();
    return top;
  }
}

function timedStorage(tally: StorageTally, method: string): (original: AnyFunction) => AnyFunction {
  const table = WRITES.has(method) ? tally.writes : tally.reads;
  return (original) =>
    function (this: unknown, ...args: unknown[]): unknown {
      const start = performance.now();
      const label = keyLabel(method, args);
      const sent = textBytes(args[1] ?? args[0]);
      const result: unknown = Reflect.apply(original, this, args);
      if (result instanceof Promise) {
        background(
          result.then(
            (value: unknown) => {
              table.add(label, performance.now() - start, sent + textBytes(value));
            },
            () => {
              table.add(`${label}!`, performance.now() - start, sent);
            },
          ),
          'storage_probe.background_failed',
        );
      }
      return result;
    };
}

export function startStorageProbe(): () => void {
  const tally = new StorageTally();
  const patches = patchAll(
    METHODS.map((method) => patchMember(AsyncStorage, method, timedStorage(tally, method))),
  );
  const remove = addContributor('storage', {
    fields: () => tally.fields(),
    details: () => [{ kind: 'storage', top: tally.top() }],
  });
  return (): void => {
    remove();
    patches.stop();
  };
}
