import {
  PRINTER_DAY,
  addDays,
  dayNumber,
  forecastSupply,
  type PrinterDay,
  type PrinterGap,
  type SupplyForecast,
  type SupplySample,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PluginRecords } from '../contract';
import { dayKeyOf, hourOf, minuteOfDayOf, type HomeClock } from './clock';
import {
  EVENT_RECORD,
  JOB_RECORD,
  MARK_RECORD,
  STATE_SPAN,
  SUPPLY_DAY,
  type EventRecord,
  type JobRecord,
  type MarkRecord,
  type StateSpan,
  type SupplyDayRecord,
} from './records';

const EVENTS_KEPT = 100;
const SPANS_KEPT_DAYS = 14;
const DAY_SECONDS = 86_400;
const DAY_MS = 86_400_000;
const FORECAST_DAYS = 60;
const MINUTES_PER_DAY = 1440;
const SUPPLY_WRITE_MS = 60_000;

export interface LedgerStores {
  readonly days: PluginRecords;
  readonly jobs: PluginRecords;
  readonly supplyDays: PluginRecords;
  readonly marks: PluginRecords;
  readonly events: PluginRecords;
  readonly spans: PluginRecords;
}

export type LedgerState = StateSpan['state'];

function blankDay(day: string): PrinterDay {
  return {
    day,
    jobs: 0,
    canceled: 0,
    failed: 0,
    pages: 0,
    sheets: 0,
    mono: 0,
    color: 0,
    duplexPages: 0,
    activeSeconds: 0,
    onlineSeconds: 0,
    offlineSeconds: 0,
    restarts: 0,
    errors: 0,
    jams: 0,
    hours: new Array<number>(24).fill(0),
    counterPages: null,
    estimatedPages: null,
    gaps: [],
  };
}

function load<T>(
  records: PluginRecords,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
  log: Logger,
): Map<string, T> {
  const found = new Map<string, T>();
  for (const entry of records.list()) {
    const parsed = parse(entry.value);
    if (parsed.success) found.set(entry.key, parsed.data);
    else log.warn('printer.record_invalid', { key: entry.key });
  }
  return found;
}

export class PrinterLedger {
  readonly #days: Map<string, PrinterDay>;
  readonly #jobs: Map<string, JobRecord>;
  readonly #supplyDays: Map<string, SupplyDayRecord>;
  readonly #marks: Map<string, MarkRecord>;
  readonly #spans: Map<string, StateSpan>;
  #events: EventRecord[];
  readonly #supplyWrittenAt = new Map<string, number>();
  #sequence = 0;

  constructor(
    private readonly stores: LedgerStores,
    private readonly clock: HomeClock,
    log: Logger,
  ) {
    this.#days = load(stores.days, (value) => PRINTER_DAY.safeParse(value), log);
    this.#jobs = load(stores.jobs, (value) => JOB_RECORD.safeParse(value), log);
    this.#supplyDays = load(stores.supplyDays, (value) => SUPPLY_DAY.safeParse(value), log);
    this.#marks = load(stores.marks, (value) => MARK_RECORD.safeParse(value), log);
    this.#spans = load(stores.spans, (value) => STATE_SPAN.safeParse(value), log);
    this.#events = [
      ...load(stores.events, (value) => EVENT_RECORD.safeParse(value), log).values(),
    ].sort((left, right) => (left.at < right.at ? -1 : 1));
  }

  get zone(): string {
    return this.clock.timeZone();
  }

  dayKey(at: Date): string {
    return dayKeyOf(at, this.zone);
  }

  days(): readonly PrinterDay[] {
    return [...this.#days.values()].sort((left, right) => (left.day < right.day ? -1 : 1));
  }

  day(key: string): PrinterDay {
    return this.#days.get(key) ?? blankDay(key);
  }

  #saveDay(day: PrinterDay): void {
    const pages = day.counterPages === null ? null : Math.max(0, day.counterPages - day.pages);
    const next = { ...day, estimatedPages: pages };
    this.#days.set(day.day, next);
    this.stores.days.put(day.day, next);
  }

  #change(at: Date, edit: (day: PrinterDay) => PrinterDay): void {
    this.#saveDay(edit(this.day(this.dayKey(at))));
  }

  jobs(): readonly JobRecord[] {
    return [...this.#jobs.values()];
  }

  job(key: string): JobRecord | null {
    return this.#jobs.get(key) ?? null;
  }

  removeJob(key: string): void {
    this.#jobs.delete(key);
    this.stores.jobs.remove(key);
  }

  saveJob(record: JobRecord): void {
    const previous = this.#jobs.get(record.key);
    const terminal = ['completed', 'canceled', 'aborted'].includes(record.state);
    const counted = previous?.counted === true || (terminal && this.#count(record));
    const next = { ...record, counted };
    this.#jobs.set(record.key, next);
    this.stores.jobs.put(record.key, next);
  }

  #count(record: JobRecord): boolean {
    const at = new Date(record.completedAt ?? record.createdAt ?? this.clock.now().toISOString());
    const pages = record.pages ?? record.sheets ?? 0;
    this.#change(at, (day) => this.#withJob(day, record, pages, at));
    return true;
  }

  #withJob(day: PrinterDay, record: JobRecord, pages: number, at: Date): PrinterDay {
    if (record.state === 'canceled') return { ...day, canceled: day.canceled + 1 };
    if (record.state === 'aborted') return { ...day, failed: day.failed + 1 };
    const hours = day.hours.map((value, hour) =>
      hour === hourOf(at, this.zone) ? value + pages : value,
    );
    return {
      ...day,
      jobs: day.jobs + 1,
      pages: day.pages + pages,
      sheets: day.sheets + (record.sheets ?? pages),
      color: day.color + (record.color ?? 0),
      mono: day.mono + (record.mono ?? 0),
      duplexPages: day.duplexPages + (record.sides?.startsWith('two-sided') === true ? pages : 0),
      hours,
    };
  }

  addCounterDelta(at: Date, delta: number): void {
    if (delta <= 0) return;
    this.#change(at, (day) => ({ ...day, counterPages: (day.counterPages ?? 0) + delta }));
  }

  markCounters(at: Date): void {
    this.#change(at, (day) => ({ ...day, counterPages: day.counterPages ?? 0 }));
  }

  addSeconds(at: Date, kind: 'online' | 'offline' | 'active', seconds: number): void {
    if (seconds <= 0) return;
    this.#change(at, (day) => {
      const clamped = Math.min(seconds, DAY_SECONDS);
      if (kind === 'online') return { ...day, onlineSeconds: day.onlineSeconds + clamped };
      if (kind === 'offline') return { ...day, offlineSeconds: day.offlineSeconds + clamped };
      return { ...day, activeSeconds: day.activeSeconds + clamped };
    });
  }

  count(at: Date, kind: 'restarts' | 'errors' | 'jams'): void {
    this.#change(at, (day) => ({ ...day, [kind]: day[kind] + 1 }));
  }

  addGap(from: Date, to: Date): readonly PrinterGap[] {
    const first = this.dayKey(from);
    const last = this.dayKey(to);
    const added: PrinterGap[] = [];
    for (let key = first; key <= last; key = addDays(key, 1)) {
      const start = key === first ? minuteOfDayOf(from, this.zone) : 0;
      const end = key === last ? minuteOfDayOf(to, this.zone) : MINUTES_PER_DAY;
      if (end <= start) continue;
      const gap = { from: start, to: end };
      added.push(gap);
      this.#saveDay({ ...this.day(key), gaps: [...this.day(key).gaps, gap] });
    }
    return added;
  }

  supplyDay(key: string): SupplyDayRecord {
    return this.#supplyDays.get(key) ?? {};
  }

  recordSupply(supplyKey: string, level: number, at: Date): void {
    const last = this.#supplyWrittenAt.get(supplyKey) ?? 0;
    if (at.getTime() - last < SUPPLY_WRITE_MS) return;
    this.#supplyWrittenAt.set(supplyKey, at.getTime());
    const key = this.dayKey(at);
    const day = this.supplyDay(key);
    const known = day[supplyKey];
    const next: SupplyDayRecord = {
      ...day,
      [supplyKey]:
        known === undefined
          ? { close: level, min: level, max: level, samples: 1 }
          : {
              close: level,
              min: Math.min(known.min, level),
              max: Math.max(known.max, level),
              samples: known.samples + 1,
            },
    };
    this.#supplyDays.set(key, next);
    this.stores.supplyDays.put(key, next);
  }

  supplyDays(): ReadonlyMap<string, SupplyDayRecord> {
    return this.#supplyDays;
  }

  addMark(mark: MarkRecord): void {
    const key = `${mark.at}:${mark.key}:${mark.kind}`;
    this.#marks.set(key, mark);
    this.stores.marks.put(key, mark);
  }

  marks(): readonly MarkRecord[] {
    return [...this.#marks.values()].sort((left, right) => (left.at < right.at ? -1 : 1));
  }

  forecast(key: string, consumed: boolean, now: Date): SupplyForecast | null {
    const lastReplaced = this.marks()
      .filter((mark) => mark.key === key && mark.kind === 'replaced')
      .map((mark) => Date.parse(mark.at))
      .at(-1);
    const from = Math.max(lastReplaced ?? 0, now.getTime() - FORECAST_DAYS * DAY_MS);
    let pages = 0;
    const samples: SupplySample[] = [];
    for (const [dayKey, day] of [...this.#supplyDays].sort(([a], [b]) => (a < b ? -1 : 1))) {
      pages += this.day(dayKey).pages;
      const entry = day[key];
      const at = dayNumber(dayKey) * DAY_MS + DAY_MS / 2;
      if (entry === undefined || at < from) continue;
      samples.push({ at, level: consumed ? entry.close : 100 - entry.close, pages });
    }
    return forecastSupply(samples);
  }

  note(kind: string, text: string, at: Date): void {
    this.#sequence += 1;
    const entry = { at: at.toISOString(), kind, text };
    this.#events = [...this.#events, entry].slice(-EVENTS_KEPT);
    this.stores.events.put(`${entry.at}#${String(this.#sequence).padStart(6, '0')}`, entry);
    const dropped = this.stores.events.list().length - EVENTS_KEPT;
    if (dropped > 0) {
      for (const stale of this.stores.events.list().slice(0, dropped))
        this.stores.events.remove(stale.key);
    }
  }

  events(): readonly EventRecord[] {
    return this.#events;
  }

  transition(state: LedgerState, at: Date): void {
    const open = [...this.#spans.entries()].find(([, span]) => span.to === null);
    if (open?.[1].state === state) return;
    const iso = at.toISOString();
    if (open !== undefined) this.#putSpan(open[0], { ...open[1], to: iso });
    this.#putSpan(`${iso}:${state}`, { state, from: iso, to: null });
    const cutoff = new Date(at.getTime() - SPANS_KEPT_DAYS * DAY_MS).toISOString();
    for (const [key, span] of this.#spans) {
      if (span.to !== null && span.to < cutoff) {
        this.#spans.delete(key);
        this.stores.spans.remove(key);
      }
    }
  }

  #putSpan(key: string, span: StateSpan): void {
    this.#spans.set(key, span);
    this.stores.spans.put(key, span);
  }

  spans(): readonly StateSpan[] {
    return [...this.#spans.values()].sort((left, right) => (left.from < right.from ? -1 : 1));
  }

  clear(): void {
    const stores: readonly PluginRecords[] = [
      this.stores.days,
      this.stores.jobs,
      this.stores.supplyDays,
      this.stores.marks,
      this.stores.events,
      this.stores.spans,
    ];
    for (const store of stores) for (const entry of store.list()) store.remove(entry.key);
    this.#days.clear();
    this.#jobs.clear();
    this.#supplyDays.clear();
    this.#marks.clear();
    this.#spans.clear();
    this.#events = [];
  }
}
