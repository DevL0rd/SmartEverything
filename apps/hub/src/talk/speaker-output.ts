import { TALK_FRAME_MS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { OPUS_SILENCE } from '../reach/voice-pacing';
import type { OggFeed, TalkFeeds } from './feeds';
import { SPEAKER_PRIORITY, SpeakerMix, type MixSource, type SpeakerOwner } from './speaker-mix';
import type { PacketSink } from './transmission';
import { messageOf } from '@smarteverything/logging';

export const KEEPALIVE_MS = 5000;
const PRIMING_MS = TALK_FRAME_MS;
export const SOURCE_QUIET_MS = 60_000;
const RETRY_AFTER_MS = [1000, 5000, 30_000] as const;

export interface OutputDeps {
  readonly feeds: Pick<TalkFeeds, 'open'>;
  readonly play: (cameraId: string, feed: OggFeed) => Promise<string>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

type OutputState = 'closed' | 'connecting' | 'ready' | 'waiting';

type Ending = 'ended' | 'expired';

export class CameraOutput {
  private readonly mix = new SpeakerMix();
  private readonly waits = new Map<MixSource, number>();
  private holds = 0;
  private feed: OggFeed | null = null;
  private state: OutputState = 'closed';
  private timer: Cancel | null = null;
  private sentAt = Number.NEGATIVE_INFINITY;
  private reopens = 0;
  private failures = 0;

  constructor(
    readonly cameraId: string,
    private readonly deps: OutputDeps,
    private readonly unused: () => void,
  ) {}

  hold(): () => void {
    this.holds += 1;
    this.deps.log.info('talk.camera_speaker_standby', { cameraId: this.cameraId, on: true });
    this.ensure();
    let held = true;
    return (): void => {
      if (held) {
        held = false;
        this.holds -= 1;
        this.deps.log.info('talk.camera_speaker_standby', { cameraId: this.cameraId, on: false });
        this.settle();
      }
    };
  }

  attach(sessionId: string, owner: SpeakerOwner): PacketSink {
    const source = this.mix.attach(sessionId, owner, this.now());
    if (this.state === 'ready') {
      this.waits.set(source, 0);
    }
    this.deps.log.info('talk.camera_speaker_attached', {
      cameraId: this.cameraId,
      sourceId: sessionId,
      owner,
      priority: SPEAKER_PRIORITY[owner],
      ready: this.state === 'ready',
      sources: this.mix.size,
    });
    this.ensure();
    return {
      packet: (packet): void => {
        if (this.mix.admit(source, packet, this.now())) {
          this.send(packet);
        }
      },
      end: (): void => {
        this.detach(source, 'ended');
      },
    };
  }

  private detach(source: MixSource, ending: Ending): void {
    if (!this.mix.detach(source)) {
      return;
    }
    const fields = {
      cameraId: this.cameraId,
      sourceId: source.sessionId,
      owner: source.owner,
      priority: SPEAKER_PRIORITY[source.owner],
      waitMs: this.waits.get(source) ?? null,
      playedMs: source.played * TALK_FRAME_MS,
      heldMs: source.held * TALK_FRAME_MS,
      durationMs: this.now() - source.attachedAt,
      ending,
    };
    this.waits.delete(source);
    if (ending === 'expired') {
      this.deps.log.warn('talk.camera_speaker_played', fields);
    } else {
      this.deps.log.info('talk.camera_speaker_played', fields);
    }
    this.settle();
  }

  private send(packet: Uint8Array): void {
    this.feed?.packet(packet);
    this.sentAt = this.now();
  }

  private settle(): void {
    if (this.holds > 0 || this.mix.size > 0) {
      return;
    }
    this.timer?.();
    this.timer = null;
    this.feed?.end();
    this.feed = null;
    this.state = 'closed';
    this.unused();
  }

  private ensure(): void {
    if (this.state === 'closed') {
      this.connect();
    }
  }

  private connect(): void {
    const begun = this.now();
    const feed = this.deps.feeds.open(() => {
      this.lost(feed);
    });
    this.feed = feed;
    this.state = 'connecting';
    this.schedule(PRIMING_MS);
    this.deps.play(this.cameraId, feed).then(
      (codec) => {
        this.started(feed, codec, begun);
      },
      (cause: unknown) => {
        this.failed(feed, messageOf(cause));
      },
    );
  }

  private started(feed: OggFeed, codec: string, begun: number): void {
    if (feed !== this.feed) {
      return;
    }
    const now = this.now();
    this.state = 'ready';
    this.failures = 0;
    this.deps.log.info('talk.camera_speaker_started', {
      cameraId: this.cameraId,
      codec,
      startMs: now - begun,
      standby: this.holds > 0,
      sources: this.mix.size,
      reopens: this.reopens,
    });
    this.mix.all().forEach((source) => {
      if (!this.waits.has(source)) {
        this.waits.set(source, now - source.attachedAt);
      }
    });
    this.schedule(KEEPALIVE_MS);
  }

  private lost(feed: OggFeed): void {
    if (feed !== this.feed) {
      return;
    }
    this.reopens += 1;
    this.deps.log.warn('talk.camera_speaker_reopened', {
      cameraId: this.cameraId,
      count: this.reopens,
      standby: this.holds > 0,
      sources: this.mix.size,
    });
    this.restart();
  }

  private failed(feed: OggFeed, reason: string): void {
    if (feed !== this.feed) {
      return;
    }
    const retryInMs = RETRY_AFTER_MS[Math.min(this.failures, RETRY_AFTER_MS.length - 1)] ?? 0;
    this.failures += 1;
    this.deps.log.warn('talk.camera_speaker_failed', {
      cameraId: this.cameraId,
      reason,
      retryInMs,
    });
    feed.end();
    this.feed = null;
    this.state = 'waiting';
    this.timer?.();
    this.timer = this.deps.clock.at(new Date(this.now() + retryInMs), () => {
      this.timer = null;
      this.state = 'closed';
      this.ensure();
    });
  }

  private restart(): void {
    const old = this.feed;
    this.timer?.();
    this.timer = null;
    this.state = 'closed';
    this.connect();
    old?.end();
  }

  private schedule(periodMs: number): void {
    this.timer?.();
    this.timer = this.deps.clock.at(new Date(this.now() + periodMs), () => {
      this.timer = null;
      this.tick();
    });
  }

  private tick(): void {
    const now = this.now();
    this.mix.stale(now, SOURCE_QUIET_MS).forEach((source) => {
      this.detach(source, 'expired');
    });
    if (this.state !== 'connecting' && this.state !== 'ready') {
      return;
    }
    const periodMs = this.state === 'ready' ? KEEPALIVE_MS : PRIMING_MS;
    if (now - this.sentAt >= periodMs) {
      this.send(OPUS_SILENCE);
    }
    this.schedule(periodMs);
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
