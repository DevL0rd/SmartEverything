import { randomUUID } from 'node:crypto';
import type { ComputerFeature, HubFrame, RemoteEarNodeMessage } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { base64OfPcm } from '../computers/ear-pcm';
import { Listeners } from '../listeners';
import type { Store } from '../store/store';

export type EarHostFrame = Extract<
  HubFrame,
  { readonly type: 'ears_open' | 'ears_audio' | 'ears_close' | 'ears' | 'ears_score' }
>;

export class NoEarHostError extends Error {
  override readonly name = 'NoEarHostError';

  constructor() {
    super('No computer is hosting ears right now, so the speech could not be scored.');
  }
}

export class EarHostLostError extends Error {
  override readonly name = 'EarHostLostError';

  constructor(readonly computerId: string) {
    super(`The computer ${computerId} stopped hosting ears before it scored the speech.`);
  }
}

export class EarScoreFailedError extends Error {
  override readonly name = 'EarScoreFailedError';

  constructor(
    readonly computerId: string,
    readonly reason: string,
  ) {
    super(`The computer ${computerId} could not score the speech: ${reason}`);
  }
}

export interface EarScoreRequest {
  readonly keywords: readonly string[];
  readonly threshold: number;
  readonly pcm: Int16Array;
}

interface Scoring {
  readonly computerId: string;
  readonly resolve: (heard: boolean) => void;
  readonly reject: (cause: Error) => void;
}

export type EarHostSend = (frame: EarHostFrame) => void;

export interface SessionEarHosts {
  readonly join: (
    computerId: string,
    features: readonly ComputerFeature[],
    send: EarHostSend,
  ) => void;
  readonly leave: (computerId: string) => void;
  readonly relayed: (computerId: string, key: string, message: RemoteEarNodeMessage) => void;
  readonly scored: (computerId: string, id: string, heard: boolean) => void;
  readonly scoreFailed: (computerId: string, id: string, reason: string) => void;
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
  private readonly scoring = new Map<string, Scoring>();
  private chosen: string | null;
  private current: string | null = null;
  private stop: (() => void) | null = null;

  constructor(private readonly options: EarHostsOptions) {
    this.chosen = options.store.settings.read().ear_host_device_id;
  }

  start(): void {
    if (this.current === null) this.warnMissing(null);
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
    try {
      send(frame);
    } catch (cause) {
      this.options.log.warn('ears.send_failed', {
        computerId,
        frame: frame.type,
        reason: messageOf(cause),
      });
      return false;
    }
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
    this.scoring.forEach((pending, id) => {
      if (pending.computerId !== computerId) return;
      this.scoring.delete(id);
      pending.reject(new EarHostLostError(computerId));
    });
    if (this.links.delete(computerId)) this.reselect();
  }

  relayed(computerId: string, key: string, message: RemoteEarNodeMessage): void {
    this.messages.emit({ computerId, key, message });
  }

  score(request: EarScoreRequest): Promise<boolean> {
    const computerId = this.current;
    if (computerId === null) return Promise.reject(new NoEarHostError());
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.scoring.set(id, { computerId, resolve, reject });
      const failure = this.deliver(computerId, request, id);
      if (failure === null) return;
      this.scoring.delete(id);
      reject(failure);
    });
  }

  scored(computerId: string, id: string, heard: boolean): void {
    const pending = this.scoring.get(id);
    if (pending?.computerId !== computerId) {
      this.options.log.warn('ears.score_unexpected', { computerId, id });
      return;
    }
    this.scoring.delete(id);
    pending.resolve(heard);
  }

  scoreFailed(computerId: string, id: string, reason: string): void {
    const pending = this.scoring.get(id);
    if (pending?.computerId !== computerId) {
      this.options.log.warn('ears.score_unexpected', { computerId, id });
      return;
    }
    this.scoring.delete(id);
    pending.reject(new EarScoreFailedError(computerId, reason));
  }

  private deliver(computerId: string, request: EarScoreRequest, id: string): Error | null {
    const sent = this.sendTo(computerId, {
      type: 'ears_score',
      id,
      keywords: [...request.keywords],
      threshold: request.threshold,
      pcm: base64OfPcm(request.pcm),
    });
    return sent ? null : new EarHostLostError(computerId);
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
    if (next === null) this.warnMissing(move.from);
    this.moves.emit(move);
  }

  private warnMissing(from: string | null): void {
    this.options.log.warn('ears.host_missing', {
      from: from ?? undefined,
      chosen: this.chosen ?? undefined,
      consequence:
        'no computer is running the keyword model, so wake words, Talk transcripts and call listening do not work until one connects',
    });
  }

  private pick(): string | null {
    if (this.chosen !== null && this.links.has(this.chosen)) return this.chosen;
    return [...this.links.keys()].sort()[0] ?? null;
  }
}
