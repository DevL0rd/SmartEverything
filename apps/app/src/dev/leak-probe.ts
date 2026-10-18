import { DeviceEventEmitter } from 'react-native';
import { patchAll, patchMember, type AnyFunction } from './patch-global';
import { addContributor, currentScreen, logEvent } from './window-bus';
import type { WindowFields } from './window-math';

const TREE_EVERY_WINDOWS = 6;
const TOP_EVENTS = 6;
const HOST_TAGS = new Set([5, 6]);

export interface QueryCounts {
  readonly queries: number;
  readonly observers: number;
  readonly fetching: number;
}

export class ListenerTable {
  private readonly alive = new Map<string, number>();
  private readonly byScreen = new Map<string, number>();

  open(event: string, screen: string): () => void {
    this.alive.set(event, (this.alive.get(event) ?? 0) + 1);
    this.byScreen.set(screen, (this.byScreen.get(screen) ?? 0) + 1);
    let open = true;
    return (): void => {
      if (!open) {
        return;
      }
      open = false;
      this.alive.set(event, (this.alive.get(event) ?? 1) - 1);
      this.byScreen.set(screen, (this.byScreen.get(screen) ?? 1) - 1);
    };
  }

  total(): number {
    let sum = 0;
    this.alive.forEach((count) => {
      sum += count;
    });
    return sum;
  }

  left(screen: string): number {
    let sum = 0;
    this.byScreen.forEach((count, owner) => {
      sum += owner === screen || owner === 'start' ? 0 : count;
    });
    return sum;
  }

  topEvents(): string {
    return [...this.alive]
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_EVENTS)
      .map(([event, count]) => `${event.slice(0, 22)}:${String(count)}`)
      .join(',');
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function countTree(root: unknown): { fibers: number; host: number } {
  let fibers = 0;
  let host = 0;
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const fiber = stack.pop();
    if (!isRecord(fiber)) {
      continue;
    }
    fibers += 1;
    host += HOST_TAGS.has(Number(fiber['tag'])) ? 1 : 0;
    stack.push(fiber['sibling'], fiber['child']);
  }
  return { fibers, host };
}

function fiberRoots(): unknown[] {
  const hook: unknown = Reflect.get(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__');
  const renderers: unknown = isRecord(hook) ? hook['renderers'] : null;
  const read: unknown = isRecord(hook) ? hook['getFiberRoots'] : null;
  if (!(renderers instanceof Map) || typeof read !== 'function') {
    return [];
  }
  return [...renderers.keys()].flatMap((id: unknown) => {
    const roots: unknown = Reflect.apply(read, hook, [id]);
    return roots instanceof Set
      ? [...roots].map((root: unknown) => (isRecord(root) ? root['current'] : null))
      : [];
  });
}

function treeFields(): WindowFields {
  const sum = { fibers: 0, host: 0 };
  fiberRoots().forEach((root) => {
    const counted = countTree(root);
    sum.fibers += counted.fibers;
    sum.host += counted.host;
  });
  return { fibers: sum.fibers, hostViews: sum.host };
}

function tracking(table: ListenerTable): (original: AnyFunction) => AnyFunction {
  return (original) =>
    function (this: unknown, ...args: unknown[]): unknown {
      const subscription: unknown = Reflect.apply(original, this, args);
      const close = table.open(String(args[0]), currentScreen());
      patchMember(
        isRecord(subscription) ? subscription : {},
        'remove',
        (remove) =>
          function (this: unknown, ...removeArgs: unknown[]): unknown {
            close();
            return Reflect.apply(remove, this, removeArgs);
          },
      );
      return subscription;
    };
}

let queryReader: (() => QueryCounts) | null = null;

export function setQueryReader(reader: (() => QueryCounts) | null): void {
  queryReader = reader;
}

export function startLeakProbe(): () => void {
  const table = new ListenerTable();
  const patches = patchAll([patchMember(DeviceEventEmitter, 'addListener', tracking(table))]);
  if (patches.failed > 0) {
    logEvent('perf.probe_partial', { probe: 'leaks', failed: patches.failed });
  }
  let windows = 0;
  const remove = addContributor('leaks', {
    fields: () => {
      const queries = queryReader?.() ?? null;
      const fields: WindowFields = {
        listeners: table.total(),
        listenersLeft: table.left(currentScreen()),
        ...(queries === null
          ? {}
          : {
              queries: queries.queries,
              qObservers: queries.observers,
              qFetching: queries.fetching,
            }),
      };
      windows += 1;
      return windows % TREE_EVERY_WINDOWS === 1 ? { ...fields, ...treeFields() } : fields;
    },
    details: () => [{ kind: 'listeners', top: table.topEvents() }],
  });
  return (): void => {
    remove();
    patches.stop();
  };
}
