import {
  nextRequestAt,
  outcomesOf,
  pruneHistory,
  takeBatch,
  type CommandOutcome,
  type QueuedCommand,
  type SmartThingsCommand,
} from '@smarteverything/smartthings';
import type { SmartThingsApi } from './http';

interface Ticket {
  readonly resolve: (outcomes: readonly CommandOutcome[]) => void;
  readonly reject: (cause: unknown) => void;
}

type Work =
  | { readonly kind: 'commands'; readonly entry: QueuedCommand<Ticket> }
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

  commands(commands: readonly SmartThingsCommand[]): Promise<readonly CommandOutcome[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'commands', entry: { ticket: { resolve, reject }, commands } });
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
    const leading: QueuedCommand<Ticket>[] = [];
    for (const work of this.queue) {
      if (work.kind !== 'commands') {
        break;
      }
      leading.push(work.entry);
    }
    const { batch, rest } = takeBatch(leading);
    this.queue = [
      ...rest.map((entry) => ({ kind: 'commands' as const, entry })),
      ...this.queue.slice(leading.length),
    ];
    await this.send(batch.tickets, batch.commands, leading);
  }

  private async send(
    tickets: readonly Ticket[],
    commands: readonly SmartThingsCommand[],
    entries: readonly QueuedCommand<Ticket>[],
  ): Promise<void> {
    try {
      const body = await this.api.request({
        method: 'POST',
        path: `/v1/devices/${this.deviceId}/commands`,
        body: { commands },
      });
      const outcomes = outcomesOf(body, commands.length);
      let offset = 0;
      entries.slice(0, tickets.length).forEach((entry) => {
        entry.ticket.resolve(outcomes.slice(offset, offset + entry.commands.length));
        offset += entry.commands.length;
      });
    } catch (cause) {
      tickets.forEach((ticket) => {
        ticket.reject(cause);
      });
    }
  }
}
