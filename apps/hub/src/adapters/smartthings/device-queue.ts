import {
  MAX_COMMANDS_PER_REQUEST,
  nextRequestAt,
  outcomesOf,
  pruneHistory,
  takeBatch,
  type CommandOutcome,
  type QueuedCommand,
  type SmartThingsCommand,
} from '@smarteverything/smartthings';
import type { SmartThingsApi } from './http';

type CommandBuilder = () => readonly SmartThingsCommand[];
interface CommandIntent {
  readonly ticket: Ticket;
  readonly build: CommandBuilder;
}

interface Ticket {
  readonly resolve: (outcomes: readonly CommandOutcome[]) => void;
  readonly reject: (cause: unknown) => void;
}

type Work =
  | { readonly kind: 'commands'; readonly entry: CommandIntent }
  | { readonly kind: 'request'; readonly run: () => Promise<void> };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class DeviceQueue {
  private history: readonly number[] = [];
  private queue: Work[] = [];
  private draining = false;

  constructor(
    private readonly deviceId: string,
    private readonly api: SmartThingsApi,
    private readonly now: () => Date,
  ) {}

  commands(
    commands: readonly SmartThingsCommand[] | CommandBuilder,
  ): Promise<readonly CommandOutcome[]> {
    const build =
      typeof commands === 'function' ? commands : (): readonly SmartThingsCommand[] => commands;
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'commands', entry: { ticket: { resolve, reject }, build } });
      this.drain();
    });
  }

  request<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        kind: 'request',
        run: () => task().then(resolve, reject),
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    void this.loop();
  }

  private async loop(): Promise<void> {
    while (this.queue.length > 0) {
      const at = nextRequestAt(this.history, this.now().getTime());
      const delay = at - this.now().getTime();
      if (delay > 0) {
        await wait(delay);
      }
      const sentAt = this.now().getTime();
      this.history = [...pruneHistory(this.history, sentAt), sentAt];
      await this.runNext();
    }
    this.draining = false;
  }

  private async runNext(): Promise<void> {
    const head = this.queue[0];
    if (head?.kind === 'request') {
      this.queue = this.queue.slice(1);
      await head.run();
      return;
    }
    const leading: CommandIntent[] = [];
    for (const work of this.queue) {
      if (work.kind !== 'commands') {
        break;
      }
      leading.push(work.entry);
    }
    const materialized = this.materialize(leading);
    const { batch } = takeBatch(materialized);
    const selected = new Set(batch.tickets);
    const dispatchable = new Set(materialized.map((entry) => entry.ticket));
    const remaining = leading.filter(
      (entry) => dispatchable.has(entry.ticket) && !selected.has(entry.ticket),
    );
    this.queue = [
      ...remaining.map((entry) => ({ kind: 'commands' as const, entry })),
      ...this.queue.slice(leading.length),
    ];
    if (batch.tickets.length === 0) {
      return;
    }
    await this.send(
      leading.filter((entry) => selected.has(entry.ticket)),
      materialized.filter((entry) => selected.has(entry.ticket)),
    );
  }

  private materialize(intents: readonly CommandIntent[]): readonly QueuedCommand<Ticket>[] {
    return intents.flatMap((intent) => {
      try {
        const commands = intent.build();
        if (commands.length === 0 || commands.length > MAX_COMMANDS_PER_REQUEST) {
          throw new CommandIntentSizeError(this.deviceId, commands.length);
        }
        return [{ ticket: intent.ticket, commands }];
      } catch (cause) {
        intent.ticket.reject(cause);
        return [];
      }
    });
  }

  private async send(
    intents: readonly CommandIntent[],
    initial: readonly QueuedCommand<Ticket>[],
  ): Promise<void> {
    let active = initial;
    let remainingIntents = intents;
    const buildBody = (): { readonly commands: readonly SmartThingsCommand[] } => {
      active = this.materialize(remainingIntents);
      const surviving = new Set(active.map((entry) => entry.ticket));
      remainingIntents = remainingIntents.filter((entry) => surviving.has(entry.ticket));
      const { batch, rest } = takeBatch(active);
      if (batch.tickets.length === 0 || rest.length > 0) {
        throw new CommandBatchUnavailableError(this.deviceId);
      }
      return { commands: batch.commands };
    };
    try {
      const body = await this.api.request({
        method: 'POST',
        path: `/v1/devices/${this.deviceId}/commands`,
        body: { commands: initial.flatMap((entry) => entry.commands) },
        buildBody,
      });
      const outcomes = outcomesOf(
        body,
        active.reduce((count, entry) => count + entry.commands.length, 0),
      );
      let offset = 0;
      active.forEach((entry) => {
        entry.ticket.resolve(outcomes.slice(offset, offset + entry.commands.length));
        offset += entry.commands.length;
      });
    } catch (cause) {
      active.forEach((entry) => {
        entry.ticket.reject(cause);
      });
    }
  }
}
class CommandBatchUnavailableError extends Error {
  override readonly name = 'CommandBatchUnavailableError';
  constructor(readonly deviceId: string) {
    super('The queued command batch no longer has a safe dispatchable shape.');
  }
}

class CommandIntentSizeError extends Error {
  override readonly name = 'CommandIntentSizeError';
  constructor(
    readonly deviceId: string,
    readonly count: number,
  ) {
    super(
      `The queued intent has ${String(count)} commands; expected 1–${String(MAX_COMMANDS_PER_REQUEST)}.`,
    );
  }
}
