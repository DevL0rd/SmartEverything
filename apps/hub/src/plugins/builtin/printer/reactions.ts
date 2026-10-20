import type { PrinterProblem } from '@smarteverything/domain';
import type { PrinterStatus } from '@smarteverything/ipp';
import type { Logger } from '@smarteverything/logging';
import { counterDelta } from './counters';
import type { PrinterEmitter } from './emitter';
import type { JobNotice } from './job-observer';
import type { PrinterLedger } from './ledger';
import type { PrinterModel, SupplyRow } from './model';
import type { PrinterRecord } from './records';
import type { WatchState } from './watch-state';
import { ProblemTracker, SupplyTracker, type SupplySignal } from './trackers';

const CONFIG_REREAD_MS = 60_000;

export interface ReactionPorts {
  readonly record: () => PrinterRecord;
  readonly update: (patch: Partial<PrinterRecord>) => void;
  readonly name: () => string;
  readonly ledger: PrinterLedger;
  readonly emitter: PrinterEmitter;
  readonly log: Logger;
  readonly describe: () => Promise<void>;
  readonly backfill: () => Promise<number>;
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown';
}

export class Reactions {
  readonly #problems: ProblemTracker;
  readonly #supplies: SupplyTracker;
  #lastConfigRead = 0;
  #alerts: Set<string>;
  #saved: string;

  constructor(private readonly ports: ReactionPorts) {
    const { watch, markerChange } = ports.record();
    this.#problems = new ProblemTracker(watch);
    this.#supplies = new SupplyTracker(watch, markerChange);
    this.#alerts = new Set(watch.alerts);
    this.#saved = JSON.stringify(watch);
  }

  #persist(): void {
    const watch: WatchState = {
      ...this.#problems.snapshot(),
      ...this.#supplies.snapshot(),
      alerts: [...this.#alerts],
    };
    const text = JSON.stringify(watch);
    if (text === this.#saved) return;
    this.#saved = text;
    this.ports.update({ watch });
  }

  restarted(status: PrinterStatus, now: Date): boolean {
    const before = this.ports.record().lastUpTime;
    if (status.upTime === null || before === null || status.upTime >= before) return false;
    this.ports.update({ epoch: this.ports.record().epoch + 1 });
    this.ports.ledger.count(now, 'restarts');
    this.ports.emitter.emit({
      kind: 'restarted',
      text: `${this.ports.name()} restarted`,
      data: {},
      cap: 'config',
    });
    return true;
  }

  counters(status: PrinterStatus, restarted: boolean, now: Date): void {
    const reading = counterDelta(this.ports.record().counters, status.counters, restarted);
    if (reading.next !== null) this.ports.ledger.markCounters(now);
    this.ports.ledger.addCounterDelta(now, reading.delta);
    this.ports.update({ counters: reading.next });
  }

  async reconnected(now: Date): Promise<void> {
    const seen = this.ports.record().lastSeen;
    this.ports.ledger.note('online', `${this.ports.name()} is online`, now);
    if (seen === null || this.ports.ledger.addGap(new Date(seen), now).length === 0) return;
    try {
      await this.ports.backfill();
    } catch (cause) {
      this.ports.log.warn('printer.backfill_failed', { reason: reasonOf(cause) });
    }
  }

  async configChange(status: PrinterStatus, now: Date): Promise<void> {
    const moved =
      status.configChangeTime !== null &&
      status.configChangeTime !== this.ports.record().configChange;
    if (!moved || now.getTime() - this.#lastConfigRead < CONFIG_REREAD_MS) return;
    this.#lastConfigRead = now.getTime();
    this.ports.emitter.emit({
      kind: 'config_changed',
      text: `${this.ports.name()} changed its settings`,
      data: {},
      cap: 'config',
    });
    await this.ports.describe();
  }

  observe(model: PrinterModel, status: PrinterStatus, now: Date): number | null {
    const changes = this.#problems.observe(model.problems, now.getTime());
    for (const problem of changes.added) this.#problemAdded(problem, now);
    for (const problem of changes.cleared) this.#problemCleared(problem);
    for (const supply of model.supplies) {
      if (supply.level !== null) this.ports.ledger.recordSupply(supply.key, supply.level, now);
    }
    const signals = this.#supplies.observe(model.supplies, status.markerChangeTime, now.getTime());
    for (const signal of signals) this.#supplySignal(signal, status, now);
    this.#alertEvents(status);
    this.#persist();
    return changes.recheckInMs;
  }

  #problemAdded(problem: PrinterProblem, now: Date): void {
    if (this.ports.record().settings.notify.problem) {
      this.ports.emitter.emit({
        kind: 'problem_added',
        text: `${problem.title} on ${this.ports.name()}`,
        data: { keyword: problem.keyword, severity: problem.severity, part: problem.part },
        cap: 'problem',
        subject: problem.keyword,
      });
    }
    this.ports.ledger.count(now, problem.keyword.includes('jam') ? 'jams' : 'errors');
  }

  #problemCleared(problem: PrinterProblem): void {
    this.ports.emitter.emit({
      kind: 'problem_cleared',
      text: `${problem.title} cleared on ${this.ports.name()}`,
      data: { keyword: problem.keyword, part: problem.part },
      cap: 'problem',
      subject: problem.keyword,
    });
  }

  #supplySignal(signal: SupplySignal, status: PrinterStatus, now: Date): void {
    const { row } = signal;
    const at =
      signal.kind === 'supply_replaced' && signal.acrossGap ? this.#replacedAt(status, now) : now;
    const mark = { key: row.key, at: at.toISOString(), pages: status.counters.pages };
    const data = { supply: row.slot, key: row.key, level: row.level ?? -1 };
    if (signal.kind === 'supply_replaced') {
      this.ports.ledger.addMark({
        ...mark,
        kind: 'replaced',
        before: null,
        after: row.level,
        certain: signal.certain,
      });
      this.#supplyEvent(
        'supply_replaced',
        row,
        `${row.name} was replaced on ${this.ports.name()}`,
        { ...data, certain: signal.certain },
      );
      return;
    }
    const low = signal.kind === 'supply_low';
    this.ports.ledger.addMark({
      ...mark,
      kind: low ? 'low' : 'empty',
      before: row.level,
      after: null,
      certain: true,
    });
    const { notify } = this.ports.record().settings;
    if (low ? notify.low : notify.empty) {
      this.#supplyEvent(
        signal.kind,
        row,
        `${row.name} is ${low ? 'low' : 'empty'} on ${this.ports.name()}`,
        data,
      );
    }
  }

  #replacedAt(status: PrinterStatus, now: Date): Date {
    const { upTime, markerChangeTime } = status;
    const before = this.ports.record().lastUpTime;
    const sameRun = upTime !== null && before !== null && upTime >= before;
    if (!sameRun || markerChangeTime === null || markerChangeTime > upTime) return now;
    return new Date(now.getTime() - (upTime - markerChangeTime) * 1000);
  }

  #supplyEvent(
    kind: 'supply_low' | 'supply_empty' | 'supply_replaced',
    row: SupplyRow,
    text: string,
    data: Readonly<Record<string, string | number | boolean>>,
  ): void {
    this.ports.emitter.emit({ kind, text, data, cap: 'supply', subject: `${row.key}:${kind}` });
  }

  #alertEvents(status: PrinterStatus): void {
    const keyOf = (alert: PrinterStatus['alerts'][number]): string =>
      `${alert.code}:${alert.group ?? ''}:${String(alert.groupIndex ?? '')}`;
    for (const alert of status.alerts) {
      if (this.#alerts.has(keyOf(alert)) || alert.severity === 'report') continue;
      this.ports.emitter.emit({
        kind: 'alert',
        text: alert.description ?? alert.code,
        data: { code: alert.code, group: alert.group ?? '', severity: alert.severity },
        cap: 'alert',
        subject: keyOf(alert),
      });
    }
    this.#alerts = new Set(status.alerts.map(keyOf));
  }

  jobNotice(notice: JobNotice): void {
    const { job } = notice;
    const data = { pages: job.pages ?? 0, person: job.person ?? '' };
    if (notice.kind === 'job_started') {
      this.ports.emitter.emit({
        kind: 'job_started',
        text: `Printing started on ${this.ports.name()}`,
        data,
        cap: 'job',
        subject: job.key,
      });
      return;
    }
    this.ports.emitter.emit({
      kind: 'job_finished',
      text: `Print job ${job.state} on ${this.ports.name()}`,
      data: { ...data, result: job.state },
      cap: 'job',
      subject: job.key,
    });
  }
}
