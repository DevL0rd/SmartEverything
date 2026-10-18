import type {
  ListeningHubMessage,
  ListeningNodeMessage,
  ListeningRuntimeState,
  ListeningSegment,
  ListeningWakeClaim,
  WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ListeningRegistry } from '../listening/listening-registry';
import type { DeviceSpeech } from '../listening/device-speech';
import type { EndOfSpeechPause } from '../listening/end-of-speech-pause';
import type { EarKeywords } from '../wake-name/keyword-spotter';
import type { OnSuperseded, WakeClaims } from '../wake-name/wake-claims';
import type { WakeTest } from '../wake-name/wake-test';
import { ComputerCallAudio, type ComputerAudio, type EarSend } from './computer-call-audio';
import { pcmOfBase64 } from './ear-pcm';
import { messageOf } from '@smarteverything/logging';

export interface DiscordVoice {
  readonly inVoice: () => boolean;
  readonly changes: (listener: () => void) => () => void;
}

export interface ComputerEarsOptions {
  readonly registry: Pick<
    ListeningRegistry,
    'wanted' | 'sensitivityOf' | 'onSwitched' | 'setState' | 'levels'
  >;
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly pause: Pick<EndOfSpeechPause, 'ms' | 'onChange'>;
  readonly speech: Pick<DeviceSpeech, 'segment' | 'finish'>;
  readonly test: Pick<WakeTest, 'active' | 'onActive' | 'matched' | 'near' | 'segment'>;
  readonly discord: DiscordVoice;
  readonly keywords: (sensitivity: WakeSensitivity) => EarKeywords;
  readonly wake: (
    computerId: string,
    phrase: string,
    heard: () => Int16Array,
    onSuperseded: OnSuperseded,
  ) => Promise<void>;
  readonly log: Logger;
}

interface Plan {
  readonly message: ListeningHubMessage;
  readonly state: ListeningRuntimeState | null;
}

export interface SessionEars {
  readonly online: (computerId: string, send: EarSend) => void;
  readonly offline: (computerId: string) => void;
  readonly heard: (computerId: string, message: ListeningNodeMessage) => void;
}

export class ComputerEars implements SessionEars {
  readonly audio: ComputerAudio;
  private readonly calls: ComputerCallAudio;
  private readonly links = new Map<string, EarSend>();
  private readonly sent = new Map<string, string>();
  private readonly nodeStates = new Map<string, ListeningRuntimeState>();
  private readonly stops: (() => void)[] = [];

  constructor(private readonly options: ComputerEarsOptions) {
    this.calls = new ComputerCallAudio({
      sendOf: (computerId): EarSend | null => this.links.get(computerId) ?? null,
      changed: (computerId, active): void => {
        this.callChanged(computerId, active);
      },
    });
    this.audio = this.calls;
  }

  start(): void {
    const { registry, discord } = this.options;
    this.stops.push(
      registry.onSwitched((key) => {
        this.sync(key);
      }),
      this.options.pause.onChange(() => {
        this.refresh();
      }),
      discord.changes(() => {
        this.refresh();
      }),
      this.options.test.onActive(() => {
        this.refresh();
      }),
      registry.levels.onWatched((key, watched) => {
        this.links.get(key)?.({ kind: 'level', watched });
      }),
    );
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
  }

  refresh(): void {
    this.sent.clear();
    [...this.links.keys()].forEach((computerId) => {
      this.sync(computerId);
    });
  }

  online(computerId: string, send: EarSend): void {
    this.links.set(computerId, send);
    this.sent.delete(computerId);
    if (this.options.registry.levels.watched(computerId)) {
      send({ kind: 'level', watched: true });
    }
    this.sync(computerId);
  }

  offline(computerId: string): void {
    this.links.delete(computerId);
    this.sent.delete(computerId);
    this.nodeStates.delete(computerId);
    this.calls.lost(computerId, 'the computer went offline');
    this.options.speech.finish(computerId);
    this.options.registry.setState(computerId, null);
  }

  heard(computerId: string, message: ListeningNodeMessage): void {
    switch (message.kind) {
      case 'claim':
        this.claimed(computerId, message.claim);
        return;
      case 'segment':
        this.segment(computerId, message.segment);
        return;
      case 'mic':
        this.calls.heard(computerId, pcmOfBase64(message.pcm));
        return;
      case 'level':
        this.options.registry.levels.report(computerId, message.dbfs);
        return;
      case 'state':
        this.nodeStated(computerId, message.state);
        return;
      case 'near':
        this.options.test.near({ kind: 'computer', key: computerId }, message.phrase);
        return;
    }
  }

  private plan(computerId: string): Plan {
    const { registry, discord, keywords } = this.options;
    const stored = registry.wanted(computerId);
    const wanted = {
      wake: stored.wake,
      transcribe: stored.transcribe || this.options.test.active(),
    };
    if (!wanted.wake && !wanted.transcribe) {
      return { message: { kind: 'rest', reason: 'switched_off' }, state: null };
    }
    if (discord.inVoice()) {
      return { message: { kind: 'rest', reason: 'discord_call' }, state: 'discord_call' };
    }
    const sensitivity = registry.sensitivityOf(computerId);
    const { keywords: lines, threshold, nearMissThreshold } = keywords(sensitivity);
    return {
      message: {
        kind: 'config',
        config: {
          ...wanted,
          keywords: [...lines],
          threshold,
          nearMissThreshold,
          sensitivity,
          pause_ms: this.options.pause.ms(),
        },
      },
      state: this.nodeStates.get(computerId) ?? null,
    };
  }

  private sync(computerId: string): void {
    const send = this.links.get(computerId);
    if (send === undefined || this.calls.active(computerId)) {
      return;
    }
    const { message, state } = this.plan(computerId);
    this.options.registry.setState(computerId, state);
    const signature = JSON.stringify(message);
    if (this.sent.get(computerId) === signature) {
      return;
    }
    this.sent.set(computerId, signature);
    send(message);
    this.options.log.debug('computer.ear_configured', { computerId, kind: message.kind });
  }

  private callChanged(computerId: string, active: boolean): void {
    if (active) {
      this.options.registry.setState(computerId, 'in_conversation');
      return;
    }
    this.sent.delete(computerId);
    this.sync(computerId);
  }

  private nodeStated(computerId: string, state: ListeningRuntimeState | null): void {
    if (state === null) {
      this.nodeStates.delete(computerId);
    } else {
      this.nodeStates.set(computerId, state);
    }
    this.sync(computerId);
  }

  private segment(computerId: string, segment: ListeningSegment): void {
    const heard = {
      startedAt: Date.parse(segment.at),
      endedAt: Date.parse(segment.endedAt),
      pcm: pcmOfBase64(segment.pcm),
    };
    this.options.test.segment({ kind: 'computer', key: computerId }, heard);
    if (this.options.registry.wanted(computerId).transcribe) {
      this.options.speech.segment(computerId, heard);
    }
  }

  private claimed(computerId: string, claim: ListeningWakeClaim): void {
    const { claims, log } = this.options;
    this.options.test.matched({ kind: 'computer', key: computerId }, claim.phrase);
    const send = this.links.get(computerId);
    if (send === undefined || this.calls.active(computerId) || !this.wakes(computerId)) {
      log.debug('computer.claim_ignored', { computerId });
      return;
    }
    const grant = claims.request({
      source: 'computer',
      key: computerId,
      snippetDbfs: claim.snippetDbfs,
    });
    log.info('wake.spotted', {
      computerId,
      phrase: claim.phrase,
      granted: grant.granted,
      snippetDbfs: Math.round(claim.snippetDbfs * 10) / 10,
    });
    if (grant.granted) {
      this.answer(computerId, claim, grant.onSuperseded, send);
    }
  }

  private answer(
    computerId: string,
    claim: ListeningWakeClaim,
    superseded: OnSuperseded,
    send: EarSend,
  ): void {
    const heard = this.calls.begin(computerId, pcmOfBase64(claim.preroll));
    if (heard === null) {
      return;
    }
    const register: OnSuperseded = (stop) => {
      superseded((winner) => {
        send({
          kind: 'superseded',
          superseded: { winner: { source: winner.source, key: winner.key } },
        });
        stop(winner);
      });
    };
    this.options.wake(computerId, claim.phrase, heard, register).catch((cause: unknown) => {
      this.options.log.warn('computer.wake_failed', { computerId, reason: messageOf(cause) });
      this.calls.end(computerId);
    });
  }

  private wakes(computerId: string): boolean {
    return this.options.registry.wanted(computerId).wake && !this.options.discord.inVoice();
  }
}
