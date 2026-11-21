import type { LiveChange, LiveMessage } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { SLOW_CLIENT_BYTES, logTooSlow, watchBacklog, type LoggedConnection } from './live-log';
import type { LiveTally } from './live-stats';
import { liveText } from './live-wire';
import { SAME_VIEW, type LiveViewJob, type LiveViewOf, type LiveViewsInput } from './live-views';

export type OutboundKind =
  | { readonly kind: 'direct'; readonly message: LiveMessage }
  | { readonly kind: 'change'; readonly change: LiveChange }
  | { readonly kind: 'seen'; readonly message: LiveMessage }
  | { readonly kind: 'drive'; readonly message: LiveMessage }
  | { readonly kind: 'profile'; readonly message: LiveMessage; readonly profileId: string };

type StoreJob = Exclude<OutboundKind, { kind: 'direct' }>;

export interface OutboundJob<C> {
  readonly connections: readonly C[];
  readonly job: OutboundKind;
}

const VIEW_FAILED = 1011;

class LiveViewMissingError extends Error {
  override readonly name = 'LiveViewMissingError';

  constructor(readonly index: number) {
    super(`The live views reply has no entry ${String(index)}.`);
  }
}

function viewAt<T>(views: readonly (T | undefined)[], index: number): T {
  const view = views[index];
  if (view === undefined) throw new LiveViewMissingError(index);
  return view;
}

export interface LiveOutboundOptions {
  readonly views: (input: LiveViewsInput) => Promise<LiveViewOf[][]>;
  readonly tally: () => LiveTally;
  readonly log: Logger;
}

export class LiveOutbound<C extends LoggedConnection> {
  private outbound: OutboundJob<C>[] = [];
  private draining = false;

  constructor(private readonly options: LiveOutboundOptions) {}

  enqueue(connections: readonly C[], job: OutboundKind): void {
    if (connections.length === 0) return;
    if (job.kind === 'direct' && !this.draining && this.outbound.length === 0) {
      connections.forEach((connection) => {
        this.transmit(connection, job.message);
      });
      return;
    }
    this.outbound.push({ connections, job });
    if (!this.draining) background(this.drain(), 'live.drain_failed');
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.outbound.length > 0) {
        const batch = this.outbound;
        this.outbound = [];
        await this.deliverBatch(batch);
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliverBatch(batch: readonly OutboundJob<C>[]): Promise<void> {
    const hearers = new Map<C, number>();
    const jobs: LiveViewJob[] = [];
    const viewed = batch.filter(
      (item): item is OutboundJob<C> & { readonly job: StoreJob } => item.job.kind !== 'direct',
    );
    for (const { connections, job } of viewed) {
      const indexes = connections.map((connection) => {
        const known = hearers.get(connection);
        if (known !== undefined) return known;
        hearers.set(connection, hearers.size);
        return hearers.size - 1;
      });
      jobs.push({ ...job, hearers: indexes });
    }
    const views = jobs.length === 0 ? [] : await this.viewsOf([...hearers.keys()], jobs, viewed);
    let next = 0;
    for (const { connections, job } of batch) {
      if (job.kind === 'direct') {
        connections.forEach((connection) => {
          this.transmit(connection, job.message);
        });
        continue;
      }
      next += 1;
      if (views === null) continue;
      const shown = viewAt(views, next - 1);
      const source = job.kind === 'change' ? job.change : job.message;
      connections.forEach((connection, index) => {
        const view = viewAt(shown, index);
        this.shown(connection, view === SAME_VIEW ? source : view);
      });
    }
  }

  private async viewsOf(
    hearers: readonly C[],
    jobs: readonly LiveViewJob[],
    viewed: readonly OutboundJob<C>[],
  ): Promise<LiveViewOf[][] | null> {
    try {
      return await this.options.views({
        hearers: hearers.map(({ client, tables }) => ({ client, tables })),
        jobs,
      });
    } catch (cause) {
      const failed = new Set(viewed.flatMap(({ connections }) => connections));
      this.options.log.error('live.views_failed', cause, {
        jobs: jobs.length,
        sockets: failed.size,
        closeCode: VIEW_FAILED,
      });
      for (const connection of failed) {
        connection.stats.closedBy('hub:view_failed');
        connection.socket.close(VIEW_FAILED, 'live view failed');
      }
      return null;
    }
  }

  private shown(connection: C, message: LiveMessage | null): void {
    if (message !== null) {
      this.transmit(connection, message);
      return;
    }
    this.skipped(connection);
  }

  private skipped(connection: C): void {
    connection.stats.skipped();
    this.options.tally().skipped();
  }

  private transmit(connection: C, message: LiveMessage): void {
    if (connection.socket.readyState !== connection.socket.OPEN) return;
    const buffered = connection.socket.bufferedAmount;
    connection.stats.buffered(buffered);
    if (buffered > SLOW_CLIENT_BYTES) {
      connection.stats.closedBy('hub:client_too_slow');
      logTooSlow(this.options.log, connection, buffered, message.type);
      connection.socket.terminate();
      return;
    }
    watchBacklog(this.options.log, connection, buffered, message.type);
    const text = liveText(connection.client.role, message);
    if (text === null) {
      this.skipped(connection);
      return;
    }
    connection.socket.send(text);
    connection.stats.delivered(text.length);
    this.options.tally().delivered(message.type, text.length);
  }
}
