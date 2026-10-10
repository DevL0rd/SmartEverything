import type { Logger } from '@smarteverything/logging';
import type { Go2rtcClient } from '../cameras/go2rtc-client';
import type { OggFeed, TalkFeeds } from './feeds';
import type { PacketSink } from './transmission';

const SPEAKER_CODECS = ['opus', 'pcma'] as const;

const REOPENS_MAX = 5;

type SpeakerCodec = (typeof SPEAKER_CODECS)[number];

export type SpeakerOwner = 'talk' | 'assistant';

export interface CameraSpeakerOptions {
  readonly go2rtc: Pick<Go2rtcClient, 'play'>;
  readonly feeds: TalkFeeds;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly log: Logger;
}

class CameraSpeakerRefusedError extends Error {
  override readonly name = 'CameraSpeakerRefusedError';

  constructor(cameraId: string, reasons: readonly string[]) {
    super(`go2rtc would not play the channel on camera ${cameraId}: ${reasons.join('; ')}`);
  }
}

function sourceOf(feed: OggFeed, codec: SpeakerCodec): string {
  return `ffmpeg:${feed.url}#input=file#audio=${codec}`;
}

interface SessionIds {
  readonly cameraId: string;
  readonly sessionId: string;
  readonly owner: SpeakerOwner;
}

class SpeakerSession {
  private feed: OggFeed;
  private reopens = 0;
  private ended = false;

  constructor(
    private readonly ids: SessionIds,
    private readonly speakers: CameraSpeakers,
    private readonly released: () => void,
  ) {
    this.feed = this.connect();
  }

  readonly packet = (packet: Uint8Array): void => {
    this.feed.packet(packet);
  };

  readonly end = (): void => {
    if (!this.ended) {
      this.ended = true;
      this.released();
      this.feed.end();
    }
  };

  private connect(): OggFeed {
    const feed = this.speakers.feedFor(() => {
      this.lost(feed);
    });
    this.speakers.start(this.ids, feed, this.end);
    return feed;
  }

  private lost(feed: OggFeed): void {
    if (this.ended || feed !== this.feed) {
      return;
    }
    if (this.reopens >= REOPENS_MAX) {
      this.speakers.failed(this.ids, `the camera dropped the speaker ${String(REOPENS_MAX)} times`);
      this.end();
      return;
    }
    this.reopens += 1;
    this.speakers.reopened(this.ids, this.reopens);
    this.feed = this.connect();
    feed.end();
  }
}

export class CameraSpeakers {
  private readonly codecs = new Map<string, SpeakerCodec>();
  private readonly active = new Map<string, SpeakerOwner>();

  constructor(private readonly options: CameraSpeakerOptions) {}

  open(cameraId: string, sessionId: string, owner: SpeakerOwner): PacketSink | null {
    const holder = this.active.get(cameraId);
    if (holder !== undefined) {
      this.options.log.warn('talk.camera_speaker_busy', { cameraId, sessionId, holder, owner });
      return null;
    }
    this.active.set(cameraId, owner);
    const session = new SpeakerSession({ cameraId, sessionId, owner }, this, () => {
      this.active.delete(cameraId);
    });
    return { packet: session.packet, end: session.end };
  }

  feedFor(left: () => void): OggFeed {
    return this.options.feeds.open(left);
  }

  start(ids: SessionIds, feed: OggFeed, end: () => void): void {
    this.play(ids.cameraId, feed).then(
      (codec) => {
        this.options.log.info('talk.camera_speaker_started', { ...ids, codec });
      },
      (cause: unknown) => {
        this.failed(ids, cause instanceof Error ? cause.message : String(cause));
        end();
      },
    );
  }

  reopened(ids: SessionIds, count: number): void {
    this.options.log.warn('talk.camera_speaker_reopened', { ...ids, count });
  }

  failed(ids: SessionIds, reason: string): void {
    this.options.log.warn('talk.camera_speaker_failed', { ...ids, reason });
  }

  private async play(cameraId: string, feed: OggFeed): Promise<SpeakerCodec> {
    await this.options.ready(cameraId);
    const known = this.codecs.get(cameraId);
    const order = known === undefined ? SPEAKER_CODECS : [known];
    const reasons: string[] = [];
    for (const codec of order) {
      try {
        await this.options.go2rtc.play(cameraId, sourceOf(feed, codec));
        this.codecs.set(cameraId, codec);
        return codec;
      } catch (cause) {
        reasons.push(`${codec}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    throw new CameraSpeakerRefusedError(cameraId, reasons);
  }
}
