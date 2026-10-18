import type { ComputerFeature, HubFrame, RemoteEarNodeMessage } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { Listeners } from '../listeners';
import type { Store } from '../store/store';

export type EarHostFrame = Extract<
  HubFrame,
  { readonly type: 'ears_open' | 'ears_audio' | 'ears_close' | 'ears' }
>;

export type EarHostSend = (frame: EarHostFrame) => void;

export interface SessionEarHosts {
  readonly join: (
    computerId: string,
    features: readonly ComputerFeature[],
    send: EarHostSend,
  ) => void;
  readonly leave: (computerId: string) => void;
  readonly relayed: (computerId: string, key: string, message: RemoteEarNodeMessage) => void;
}

export interface HostMove {
  readonly from: string | null;
  readonly to: string | null;
}

export interface RelayedEarMessage {
  readonly computerId: string;
  readonly key: string;
  readonly message: RemoteEarNodeMessage;
}

export interface EarHostsOptions {
  readonly store: Pick<Store, 'settings' | 'feed'>;
  readonly log: Logger;
}

export class EarHosts implements SessionEarHosts {
  private readonly links = new Map<string, EarHostSend>();
  private readonly moves = new Listeners<HostMove>();
  private readonly messages = new Listeners<RelayedEarMessage>();
  private chosen: string | null;
  private current: string | null = null;
  private stop: (() => void) | null = null;

  constructor(private readonly options: EarHostsOptions) {
    this.chosen = options.store.settings.read().ear_host_device_id;
  }

  start(): void {
    this.stop = this.options.store.feed.subscribe((change) => {
      if (change.table !== 'settings' || change.record === null) return;
      const next = change.record.ear_host_device_id;
      if (next === this.chosen) return;
      this.chosen = next;
      this.reselect();
    });
  }

  close(): void {
    this.stop?.();
    this.stop = null;
  }

  host(): string | null {
    return this.current;
  }

  sendTo(computerId: string, frame: EarHostFrame): boolean {
    const send = this.links.get(computerId);
    if (send === undefined) return false;
    send(frame);
    return true;
  }

  onMove(listener: (move: HostMove) => void): () => void {
    return this.moves.listen(listener);
  }

  onRelayed(listener: (relayed: RelayedEarMessage) => void): () => void {
    return this.messages.listen(listener);
  }

  join(computerId: string, features: readonly ComputerFeature[], send: EarHostSend): void {
    if (!features.includes('ear_host')) {
      this.leave(computerId);
      return;
    }
    this.links.set(computerId, send);
    this.reselect();
  }

  leave(computerId: string): void {
    if (this.links.delete(computerId)) this.reselect();
  }

  relayed(computerId: string, key: string, message: RemoteEarNodeMessage): void {
    this.messages.emit({ computerId, key, message });
  }

  private reselect(): void {
    const next = this.pick();
    if (next === this.current) return;
    const move = { from: this.current, to: next };
    this.current = next;
    this.options.log.info('ears.host_changed', {
      from: move.from ?? undefined,
      to: move.to ?? undefined,
      chosen: this.chosen === next,
    });
    this.moves.emit(move);
  }

  private pick(): string | null {
    if (this.chosen !== null && this.links.has(this.chosen)) return this.chosen;
    return [...this.links.keys()].sort()[0] ?? null;
  }
}
