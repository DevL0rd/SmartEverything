import { addContributor } from './window-bus';
import { CounterDelta, round1, type WindowFields } from './window-math';

const MEGABYTE = 1048576;

const CUMULATIVE: Readonly<Record<string, string>> = {
  js_numGCs: 'gcN',
  js_gcTime: 'gcMs',
  js_gcCPUTime: 'gcCpuMs',
  js_totalAllocatedBytes: 'allocMb',
};

const LEVELS: Readonly<Record<string, string>> = {
  js_heapSize: 'heapMb',
  js_allocatedBytes: 'liveMb',
  js_externalBytes: 'extMb',
  js_mallocSizeEstimate: 'mallocMb',
  js_vaSize: 'vaMb',
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function hermesStats(): Readonly<Record<string, number>> | null {
  const hermes: unknown = Reflect.get(globalThis, 'HermesInternal');
  const read: unknown = isRecord(hermes) ? hermes['getInstrumentedStats'] : undefined;
  if (typeof read !== 'function') {
    return null;
  }
  const stats: unknown = Reflect.apply(read, hermes, []);
  if (!isRecord(stats)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(stats).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function scaled(key: string, value: number): number {
  if (key.endsWith('Bytes') || key.endsWith('Size') || key.endsWith('Estimate')) {
    return round1(value / MEGABYTE);
  }
  return key.endsWith('Time') ? Math.round(value * 1000) : value;
}

export function gcFields(
  stats: Readonly<Record<string, number>>,
  delta: Readonly<Record<string, number>> | null,
): WindowFields {
  const fields: WindowFields = {};
  Object.entries(LEVELS).forEach(([key, name]) => {
    const value = stats[key];
    if (value !== undefined) {
      fields[name] = scaled(key, value);
    }
  });
  Object.entries(CUMULATIVE).forEach(([key, name]) => {
    const value = delta?.[key];
    if (value !== undefined) {
      fields[name] = scaled(key, value);
    }
  });
  return fields;
}

export function startGcProbe(): () => void {
  const counters = new CounterDelta();
  const first = hermesStats();
  if (first === null) {
    return addContributor('gc', { fields: () => ({ gc: 'unavailable' }) });
  }
  counters.next(first);
  return addContributor('gc', {
    fields: () => {
      const stats = hermesStats();
      return stats === null ? {} : gcFields(stats, counters.next(stats));
    },
  });
}
