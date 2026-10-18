import { addContributor, logEvent } from './window-bus';
import { TallyTable, kilobytes, round1, type WindowFields } from './window-math';

const WANTED = ['longtask', 'event', 'resource', 'measure'] as const;
const SLOW_EVENT_MS = 100;
const TOP = 6;

function numberOf(entry: PerformanceEntry, key: string): number {
  const value: unknown = Reflect.get(entry, key);
  return typeof value === 'number' ? value : 0;
}

export class TimelineTally {
  longTasks = 0;
  longTaskMs = 0;
  longTaskMax = 0;
  events = 0;
  slowEvents = 0;
  eventMax = 0;
  delayMax = 0;
  connectMs = 0;
  tlsMs = 0;
  readonly resources = new TallyTable();
  readonly measures = new TallyTable();

  add(entry: PerformanceEntry): void {
    if (entry.entryType === 'longtask') {
      this.longTasks += 1;
      this.longTaskMs += entry.duration;
      this.longTaskMax = Math.max(this.longTaskMax, entry.duration);
      return;
    }
    if (entry.entryType === 'event') {
      this.event(entry);
      return;
    }
    if (entry.entryType === 'resource') {
      this.resource(entry);
      return;
    }
    this.measures.add(entry.name, entry.duration, 0);
  }

  private event(entry: PerformanceEntry): void {
    this.events += 1;
    this.slowEvents += entry.duration > SLOW_EVENT_MS ? 1 : 0;
    this.eventMax = Math.max(this.eventMax, entry.duration);
    this.delayMax = Math.max(this.delayMax, numberOf(entry, 'processingStart') - entry.startTime);
  }

  private resource(entry: PerformanceEntry): void {
    const secure = numberOf(entry, 'secureConnectionStart');
    const connectEnd = numberOf(entry, 'connectEnd');
    this.connectMs += Math.max(0, connectEnd - numberOf(entry, 'connectStart'));
    this.tlsMs += secure > 0 ? Math.max(0, connectEnd - secure) : 0;
    this.resources.add(entry.name, entry.duration, numberOf(entry, 'encodedBodySize'));
  }

  fields(): WindowFields {
    const resources = this.resources.total();
    return {
      obsLt: this.longTasks,
      obsLtMs: Math.round(this.longTaskMs),
      obsLtMax: Math.round(this.longTaskMax),
      evN: this.events,
      evSlow: this.slowEvents,
      evMaxMs: Math.round(this.eventMax),
      evDelayMax: Math.round(this.delayMax),
      resN: resources.count,
      resMs: Math.round(resources.ms),
      resKb: kilobytes(resources.bytes),
      connMs: round1(this.connectMs),
      tlsMs: round1(this.tlsMs),
    };
  }
}

export function startObserverProbe(): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return addContributor('observer', { fields: () => ({ observer: 'unavailable' }) });
  }
  const supported = new Set<string>(PerformanceObserver.supportedEntryTypes);
  const types = WANTED.filter((type) => supported.has(type));
  logEvent('perf.observer_ready', {
    supported: [...supported].join(','),
    observed: types.join(','),
  });
  let tally = new TimelineTally();
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      tally.add(entry);
    });
  });
  types.forEach((type) => {
    observer.observe({ type, buffered: false });
  });
  const remove = addContributor('observer', {
    fields: () => tally.fields(),
    details: () => {
      const top = [
        tally.resources.encode(TOP, (row) => row.ms),
        tally.measures.encode(TOP, (row) => row.ms),
      ];
      tally = new TimelineTally();
      return [
        { kind: 'resources', top: top[0] ?? '' },
        { kind: 'measures', top: top[1] ?? '' },
      ];
    },
  });
  return (): void => {
    remove();
    observer.disconnect();
  };
}
