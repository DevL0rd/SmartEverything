import {
  isVacuumCleaningResult,
  jsonEquals,
  type JsonValue,
  type StateRow,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { laneKey } from './command-queue';

export interface SentCommand {
  readonly commandId: string;
  readonly deviceId: string;
  readonly capability: string;
  readonly value: JsonValue;
  readonly sentAt: number;
  readonly budgetMs: number;
}

export interface CommandConfirmationsOptions {
  readonly store: Pick<Store, 'feed' | 'host'>;
  readonly clock: Pick<Clock, 'at'>;
  readonly log: Logger;
}

interface ConfirmationRule {
  readonly capability: string;
  readonly confirms: (sent: JsonValue, reported: JsonValue) => boolean;
}

const CONFIRMATION_RULES: readonly ConfirmationRule[] = [
  {
    capability: 'cleaning',
    confirms: (sent, reported) =>
      typeof sent === 'string' && isVacuumCleaningResult(sent, reported),
  },
];

export function isConfirmedBy(capability: string, sent: JsonValue, reported: JsonValue): boolean {
  return (
    jsonEquals(reported, sent) ||
    CONFIRMATION_RULES.some(
      (rule) => rule.capability === capability && rule.confirms(sent, reported),
    )
  );
}

interface Waiting {
  readonly sent: SentCommand;
  readonly cancel: Cancel;
}

export class CommandConfirmations {
  private readonly waiting = new Map<string, Waiting>();
  private stopFeed: (() => void) | undefined;
  private readonly reads = new Set<Promise<void>>();

  constructor(private readonly options: CommandConfirmationsOptions) {}

  expect(sent: SentCommand): void {
    const key = laneKey(sent.deviceId, sent.capability);
    this.clear(key);
    const cancel = this.options.clock.at(new Date(sent.sentAt + sent.budgetMs), () => {
      this.missed(key);
    });
    const waiting = { sent, cancel };
    this.waiting.set(key, waiting);
    this.stopFeed ??= this.options.store.feed.subscribe((change) => {
      if (change.table === 'device_state' && change.record !== null) this.observe(change.record);
    });
    this.track(this.alreadyConfirmed(key, waiting), sent);
  }

  async settled(): Promise<void> {
    while (this.reads.size > 0) await Promise.allSettled([...this.reads]);
  }

  private track(read: Promise<void>, sent: SentCommand): void {
    const held = read.finally(() => {
      this.reads.delete(held);
    });
    this.reads.add(held);
    background(held, 'command.confirmation_read_failed', { correlationId: sent.commandId });
  }

  private async alreadyConfirmed(key: string, waiting: Waiting): Promise<void> {
    const { deviceId, capability, value } = waiting.sent;
    const current = await this.options.store.host.call('state', 'value', deviceId, capability);
    if (this.waiting.get(key) !== waiting) return;
    if (current !== undefined && isConfirmedBy(capability, value, current)) this.clear(key);
  }

  private observe(row: StateRow): void {
    const key = laneKey(row.device_id, row.capability);
    const waiting = this.waiting.get(key);
    if (
      waiting === undefined ||
      Date.parse(row.observed_at) < waiting.sent.sentAt ||
      !isConfirmedBy(row.capability, waiting.sent.value, row.value)
    )
      return;
    this.clear(key);
    this.options.log.debug('command.confirmed', () => ({
      correlationId: waiting.sent.commandId,
      deviceId: row.device_id,
      capability: row.capability,
      confirmMs: Date.parse(row.observed_at) - waiting.sent.sentAt,
    }));
  }

  private missed(key: string): void {
    const waiting = this.waiting.get(key);
    if (waiting === undefined) return;
    this.waiting.delete(key);
    this.release();
    this.track(this.reportMissed(waiting.sent), waiting.sent);
  }

  private async reportMissed(sent: SentCommand): Promise<void> {
    const { commandId, deviceId, capability, value, budgetMs } = sent;
    const reported = await this.options.store.host.call('state', 'value', deviceId, capability);
    this.options.log.warn('command.not_confirmed', {
      correlationId: commandId,
      deviceId,
      capability,
      budgetMs,
      sent: value,
      reported: reported ?? null,
    });
  }

  close(): void {
    for (const { cancel } of this.waiting.values()) cancel();
    this.waiting.clear();
    this.release();
  }

  private clear(key: string): void {
    this.waiting.get(key)?.cancel();
    this.waiting.delete(key);
    this.release();
  }

  private release(): void {
    if (this.waiting.size > 0) return;
    this.stopFeed?.();
    this.stopFeed = undefined;
  }
}
