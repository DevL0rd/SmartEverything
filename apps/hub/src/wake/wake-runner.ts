import { leastTrustedOrigin, type PluginOrigin, type WakeAiAction } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { ActionOrigin } from '../automations/automation-ai';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import type { WakeRefusal } from './wake-refusal';
import type { WakeLines } from './wake-text';
import { failureLine } from '@smarteverything/logging';

export const WAKE_GATHER_MS = 1000;

export interface WakeTurnInput {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly title: string;
  readonly text: string;
  readonly plugin: PluginOrigin | null;
}

interface WakeTurns {
  readonly run: (input: WakeTurnInput) => Promise<{ readonly chatId: string }>;
}

export interface WakeRunnerOptions {
  readonly store: Pick<Store, 'host'>;
  readonly turns: WakeTurns;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

class WakeRefusedError extends Error {
  override readonly name = 'WakeRefusedError';
}

interface WakeOutcome {
  readonly state: 'woke' | 'refused' | 'failed';
  readonly reason: string | null;
  readonly chatId: string | null;
}

interface Gathered {
  readonly action: WakeAiAction;
  readonly origin: ActionOrigin;
  readonly lines: WakeLines;
  readonly settle: (error: Error | null) => void;
}

interface Batch {
  readonly profileId: string;
  readonly chatId: string | null;
  readonly title: string;
  readonly items: Gathered[];
  readonly cancel: Cancel;
}

function batchKey(action: WakeAiAction, origin: ActionOrigin): string {
  return action.chatId ?? `new|${action.profileId}|${origin.automationId}`;
}

export class WakeRunner {
  private readonly batches = new Map<string, Batch>();

  constructor(private readonly options: WakeRunnerOptions) {}

  async wake(action: WakeAiAction, origin: ActionOrigin): Promise<void> {
    const { refusal, lines } = await this.options.store.host.read('wakeRead', {
      action,
      origin,
      occasion: {
        automationName: origin.name,
        signal: origin.signal,
        instruction: action.instruction,
        at: this.options.clock.now(),
        profileId: action.profileId,
      },
    });
    return this.gather({ action, origin, lines }, refusal);
  }

  private gather(
    wake: {
      readonly action: WakeAiAction;
      readonly origin: ActionOrigin;
      readonly lines: WakeLines;
    },
    refusal: WakeRefusal | null,
  ): Promise<void> {
    const { action, origin, lines } = wake;
    if (refusal !== null) {
      if (refusal.recorded) {
        this.record(action, origin, lines, {
          state: 'refused',
          reason: refusal.reason,
          chatId: null,
        });
      }
      this.options.log.warn('wake.refused', {
        automationId: origin.automationId,
        reason: refusal.reason,
      });
      return Promise.reject(new WakeRefusedError(refusal.reason));
    }
    return new Promise((resolve, reject) => {
      const batch = this.batchFor(action, origin);
      this.options.log.debug('wake.gathering', {
        automationId: origin.automationId,
        profileId: action.profileId,
        chatId: action.chatId,
        batched: batch.items.length + 1,
        textChars: lines.text.length,
      });
      batch.items.push({
        action,
        origin,
        lines,
        settle: (error): void => {
          if (error === null) {
            resolve();
          } else {
            reject(error);
          }
        },
      });
    });
  }

  stop(): void {
    this.options.log.info('wake.stopping', { batches: this.batches.size });
    for (const batch of this.batches.values()) {
      batch.cancel();
      for (const item of batch.items) {
        item.settle(new WakeRefusedError('The server stopped before the AI woke up.'));
      }
    }
    this.batches.clear();
  }

  private batchFor(action: WakeAiAction, origin: ActionOrigin): Batch {
    const key = batchKey(action, origin);
    const existing = this.batches.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const due = new Date(this.options.clock.now().getTime() + WAKE_GATHER_MS);
    const batch: Batch = {
      profileId: action.profileId,
      chatId: action.chatId,
      title: origin.name,
      items: [],
      cancel: this.options.clock.at(due, () => {
        this.flush(key);
      }),
    };
    this.batches.set(key, batch);
    return batch;
  }

  private flush(key: string): void {
    const batch = this.batches.get(key);
    this.batches.delete(key);
    if (batch === undefined) {
      return;
    }
    background(this.started(batch), 'wake.flush_failed', { chatId: batch.chatId });
  }

  private async started(batch: Batch): Promise<void> {
    this.options.log.info('wake.flushing', {
      profileId: batch.profileId,
      chatId: batch.chatId,
      items: batch.items.length,
    });
    try {
      const { chatId } = await this.options.turns.run({
        profileId: batch.profileId,
        chatId: batch.chatId,
        title: batch.title,
        text: batch.items.map((item) => item.lines.text).join('\n\n'),
        plugin: leastTrustedOrigin(batch.items.flatMap((item) => item.origin.plugin ?? [])),
      });
      this.options.log.info('wake.turn_started', {
        profileId: batch.profileId,
        chatId,
        items: batch.items.length,
      });
      this.settleAll(batch, { state: 'woke', reason: null, chatId }, null);
    } catch (cause) {
      const reason = failureLine(cause);
      this.options.log.error('wake.turn_failed', cause, { chatId: batch.chatId });
      this.settleAll(batch, { state: 'failed', reason, chatId: batch.chatId }, new Error(reason));
    }
  }

  private settleAll(batch: Batch, outcome: WakeOutcome, error: Error | null): void {
    for (const item of batch.items) {
      this.record(item.action, item.origin, item.lines, outcome);
      item.settle(error);
    }
  }

  private record(
    action: WakeAiAction,
    origin: ActionOrigin,
    lines: WakeLines,
    outcome: WakeOutcome,
  ): void {
    background(
      this.options.store.host.call('aiWakes', 'add', {
        profile_id: action.profileId,
        chat_id: outcome.chatId,
        automation_id: origin.automationId,
        automation_name: origin.name,
        headline: lines.headline,
        instruction: action.instruction,
        state: outcome.state,
        reason: outcome.reason,
      }),
      'wake.record_failed',
      { automationId: origin.automationId },
    );
    this.options.log.info('wake.recorded', {
      automationId: origin.automationId,
      state: outcome.state,
    });
  }
}
