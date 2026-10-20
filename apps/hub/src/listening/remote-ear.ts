import {
  listeningKeyOf,
  type ListeningConfig,
  type ListeningRuntimeState,
  type ListeningWakeClaim,
  type RemoteEarHubMessage,
  type RemoteEarNodeMessage,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { pcmOfBase64 } from '../computers/ear-pcm';
import type { EarKeywords } from '../wake-name/keyword-lines';
import type {
  OnSuperseded,
  Superseded,
  WakeClaim,
  WakeClaims,
  WakeGrant,
} from '../wake-name/wake-claims';
import type { WakeTest, WakeTestSource } from '../wake-name/wake-test';
import type { EarHosts } from './ear-hosts';
import type { RemoteEar, RemoteEarOptions } from './remote-ears-port';
import type { EndOfSpeechPause } from './end-of-speech-pause';

const RECHECK_MS = 1000;
const SNIPPET_DBFS_STEP = 10;

export interface RemoteEarDeps {
  readonly hosts: Pick<EarHosts, 'sendTo'>;
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly test: Pick<WakeTest, 'near'>;
  readonly pause: Pick<EndOfSpeechPause, 'ms'>;
  readonly names: () => readonly string[];
  readonly keywords: (names: readonly string[], sensitivity: WakeSensitivity) => EarKeywords;
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
  readonly stated: () => void;
  readonly released: (ear: RemoteEarSession) => void;
}

function testSourceOf(options: RemoteEarOptions): WakeTestSource | null {
  const { source, key } = options.claim;
  switch (source) {
    case 'camera':
    case 'phone':
    case 'computer':
      return { kind: source, key };
    case 'talk':
    case 'voice_call':
      return null;
  }
}

function once(pcm: Int16Array): () => Int16Array {
  let pending: Int16Array | null = pcm;
  return (): Int16Array => {
    const given = pending ?? new Int16Array(0);
    pending = null;
    return given;
  };
}

export class RemoteEarSession implements RemoteEar {
  private hostId: string | null = null;
  private said: string | null = null;
  private restSaid = false;
  private nodeState: ListeningRuntimeState | null = null;
  private checkedAt = Number.NEGATIVE_INFINITY;
  private closed = false;
  private closing: Promise<void> | null = null;
  private settle: (() => void) | null = null;

  constructor(
    private readonly options: RemoteEarOptions,
    private readonly deps: RemoteEarDeps,
  ) {}

  get key(): string {
    return this.options.source.key;
  }

  get kind(): RemoteEarOptions['source']['kind'] {
    return this.options.source.kind;
  }

  get listeningKey(): string {
    return listeningKeyOf(this.options.claim.source, this.options.claim.key);
  }

  get host(): string | null {
    return this.hostId;
  }

  state(): ListeningRuntimeState | null {
    return this.hostId === null ? 'no_host' : this.nodeState;
  }

  attach(hostId: string | null): void {
    if (this.closed) {
      if (hostId !== this.hostId) this.finish();
      return;
    }
    if (hostId === this.hostId) return;
    this.leave();
    this.hostId = hostId;
    this.nodeState = null;
    if (hostId !== null) this.open(hostId);
    this.deps.stated();
  }

  packet(opus: Uint8Array): void {
    if (this.closed || this.hostId === null) return;
    this.follow();
    if (this.restSaid) return;
    this.send({
      type: 'ears_audio',
      key: this.key,
      packets: [Buffer.from(opus.buffer, opus.byteOffset, opus.byteLength).toString('base64')],
    });
  }

  refresh(): void {
    this.checkedAt = Number.NEGATIVE_INFINITY;
    if (!this.closed && this.hostId !== null) this.follow();
  }

  close(): Promise<void> {
    if (this.closed) return this.closing ?? Promise.resolve();
    this.closed = true;
    const hostId = this.hostId;
    if (hostId === null || !this.deps.hosts.sendTo(hostId, { type: 'ears_close', key: this.key })) {
      this.finish();
      return Promise.resolve();
    }
    this.closing = new Promise((resolve) => {
      this.settle = resolve;
    });
    return this.closing;
  }

  heard(message: RemoteEarNodeMessage): void {
    switch (message.kind) {
      case 'claim':
        this.claimed(message.claim);
        return;
      case 'segment':
        this.options.speech?.({
          startedAt: Date.parse(message.segment.at),
          endedAt: Date.parse(message.segment.endedAt),
          pcm: pcmOfBase64(message.segment.pcm),
        });
        return;
      case 'near':
        this.neared(message.phrase);
        return;
      case 'state':
        this.nodeState = message.state;
        this.deps.stated();
        return;
      case 'closed':
        this.finish();
        return;
    }
  }

  private finish(): void {
    this.hostId = null;
    this.said = null;
    this.restSaid = false;
    this.deps.released(this);
    this.settle?.();
    this.settle = null;
  }

  private open(hostId: string): void {
    const config = this.config();
    this.said = JSON.stringify(config);
    this.restSaid = false;
    this.checkedAt = this.now();
    this.deps.hosts.sendTo(hostId, {
      type: 'ears_open',
      source: this.options.source,
      codec: this.options.codec,
      config: config.config,
    });
    if (this.options.resting()) this.say(this.rest());
  }

  private leave(): void {
    if (this.hostId !== null) {
      this.deps.hosts.sendTo(this.hostId, { type: 'ears_close', key: this.key });
    }
    this.said = null;
    this.restSaid = false;
  }

  private follow(): void {
    if (this.options.resting()) {
      this.say(this.rest());
      return;
    }
    const now = this.now();
    if (!this.restSaid && now - this.checkedAt < RECHECK_MS) return;
    this.checkedAt = now;
    this.say(this.config());
  }

  private rest(): RemoteEarHubMessage {
    return { kind: 'rest', reason: 'conversation' };
  }

  private config(): Extract<RemoteEarHubMessage, { readonly kind: 'config' }> {
    const sensitivity = this.options.sensitivity();
    const names = [...this.deps.names(), ...(this.options.names?.() ?? [])];
    const { keywords, threshold, nearMissThreshold } = this.deps.keywords(names, sensitivity);
    const config: ListeningConfig = {
      wake: this.options.wake !== null && this.options.wakes?.() !== false,
      transcribe: this.options.speech !== null,
      keywords: [...keywords],
      threshold,
      nearMissThreshold,
      sensitivity,
      pause_ms: this.deps.pause.ms(),
    };
    return { kind: 'config', config };
  }

  private say(message: RemoteEarHubMessage): void {
    const signature = JSON.stringify(message);
    if (signature === this.said) return;
    this.said = signature;
    this.restSaid = message.kind === 'rest';
    this.send({ type: 'ears', key: this.key, ear: message });
  }

  private send(frame: Parameters<EarHosts['sendTo']>[1]): void {
    if (this.hostId !== null) this.deps.hosts.sendTo(this.hostId, frame);
  }

  private claimed(claim: ListeningWakeClaim): void {
    const { wake } = this.options;
    if (wake === null || this.options.wakes?.() === false || this.options.resting()) {
      this.deps.log.debug('ears.claim_ignored', this.options.fields);
      return;
    }
    const grant = this.deps.claims.request({
      ...this.options.claim,
      snippetDbfs: claim.snippetDbfs,
    });
    this.deps.log.info('wake.spotted', {
      ...this.options.fields,
      phrase: claim.phrase,
      sensitivity: this.options.sensitivity(),
      granted: grant.granted,
      snippetDbfs: Math.round(claim.snippetDbfs * SNIPPET_DBFS_STEP) / SNIPPET_DBFS_STEP,
      host: this.hostId ?? undefined,
    });
    if (grant.granted) {
      wake(claim.phrase, once(pcmOfBase64(claim.preroll)), this.forwardSupersede(grant));
    }
  }

  private neared(phrase: string): void {
    const source = testSourceOf(this.options);
    if (source !== null) this.deps.test.near(source, phrase);
  }

  private forwardSupersede(grant: WakeGrant): OnSuperseded {
    const stops: Superseded[] = [];
    let winner: WakeClaim | null = null;
    grant.onSuperseded((won) => {
      winner = won;
      this.send({
        type: 'ears',
        key: this.key,
        ear: {
          kind: 'superseded',
          superseded: { winner: { source: won.source, key: won.key } },
        },
      });
      stops.splice(0).forEach((stop) => {
        stop(won);
      });
    });
    return (stop): void => {
      if (winner === null) stops.push(stop);
      else stop(winner);
    };
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
