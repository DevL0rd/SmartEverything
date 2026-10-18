import { patchAll, patchMember, type AnyFunction } from './patch-global';
import { addContributor, logEvent } from './window-bus';
import { TallyTable, round1, type WindowFields } from './window-math';
import { background } from '@smarteverything/logging';

const TOP = 8;
const CLASS_NAME = /^[A-Z]/;
const WATCHED_MODULES = new Set(['HubNetwork', 'HealthConnect', 'ExpoCrypto']);
const SKIPPED = new Set([
  'constructor',
  'addListener',
  'removeListener',
  'removeAllListeners',
  'removeSubscription',
  'emit',
  'listenerCount',
  'startObserving',
  'stopObserving',
]);

function isObject(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

export function functionNames(target: object): string[] {
  const names = new Set<string>();
  let level: unknown = target;
  while (isObject(level) && level !== Object.prototype && level !== Function.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(level);
    Object.entries(descriptors).forEach(([name, descriptor]) => {
      if (!SKIPPED.has(name) && !CLASS_NAME.test(name) && typeof descriptor.value === 'function') {
        names.add(name);
      }
    });
    level = Reflect.getPrototypeOf(level);
  }
  return [...names];
}

function expoModules(): [string, object][] {
  const expo: unknown = Reflect.get(globalThis, 'expo');
  const modules: unknown = isObject(expo) ? Reflect.get(expo, 'modules') : null;
  if (!isObject(modules)) {
    return [];
  }
  return Object.keys(modules).flatMap((name): [string, object][] => {
    if (!WATCHED_MODULES.has(name)) {
      return [];
    }
    const module: unknown = Reflect.get(modules, name);
    return isObject(module) ? [[name, module]] : [];
  });
}

function timedCall(table: TallyTable, label: string): (original: AnyFunction) => AnyFunction {
  return (original) =>
    function (this: unknown, ...args: unknown[]): unknown {
      const start = performance.now();
      const result: unknown = Reflect.apply(original, this, args);
      if (!(result instanceof Promise)) {
        table.add(label, performance.now() - start, 0);
        return result;
      }
      const settle = (): void => {
        table.add(label, performance.now() - start, 0);
      };
      background(result.then(settle, settle), 'bridge_probe.background_failed');
      return result;
    };
}

export function startBridgeProbe(): () => void {
  const calls = new TallyTable();
  const modules = expoModules();
  const patches = patchAll(
    modules.flatMap(([name, module]) =>
      functionNames(module).map((member) =>
        patchMember(module, member, timedCall(calls, `${name}.${member}`)),
      ),
    ),
  );
  logEvent('perf.bridge_ready', { modules: modules.length, failed: patches.failed });
  const remove = addContributor('bridge', {
    fields: (): WindowFields => {
      const total = calls.total();
      return { nCalls: total.count, nCallMs: round1(total.ms), nCallMax: round1(total.worstMs) };
    },
    details: () => {
      const top = calls.encode(TOP, (row) => row.ms);
      calls.clear();
      return [{ kind: 'bridge', top }];
    },
  });
  return (): void => {
    remove();
    patches.stop();
  };
}
