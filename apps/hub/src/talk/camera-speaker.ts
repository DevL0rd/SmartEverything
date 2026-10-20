import type { Logger } from '@smarteverything/logging';
import type { Go2rtcClient } from '../cameras/go2rtc-client';
import type { Clock } from '../clock';
import type { OggFeed, TalkFeeds } from './feeds';
import type { SpeakerOwner } from './speaker-mix';
import { CameraOutput, type SpeakerSink } from './speaker-output';
import { messageOf } from '@smarteverything/logging';

const SPEAKER_CODECS = ['opus', 'pcma'] as const;

type SpeakerCodec = (typeof SPEAKER_CODECS)[number];

export interface CameraSpeakerOptions {
  readonly go2rtc: Pick<Go2rtcClient, 'play' | 'backchannel'>;
  readonly feeds: Pick<TalkFeeds, 'open'>;
  readonly ready: (cameraId: string) => Promise<void>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
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

export class CameraSpeakers {
  private readonly codecs = new Map<string, SpeakerCodec>();
  private readonly outputs = new Map<string, CameraOutput>();

  constructor(private readonly options: CameraSpeakerOptions) {}

  open(cameraId: string, sessionId: string, owner: SpeakerOwner): SpeakerSink {
    return this.output(cameraId).attach(sessionId, owner);
  }

  standby(cameraId: string): () => void {
    return this.output(cameraId).hold();
  }

  reprime(cameraId: string): void {
    this.outputs.get(cameraId)?.reopen();
  }

  private output(cameraId: string): CameraOutput {
    const known = this.outputs.get(cameraId);
    if (known !== undefined) {
      return known;
    }
    const output: CameraOutput = new CameraOutput(
      cameraId,
      {
        feeds: this.options.feeds,
        play: (id, feed) => this.play(id, feed),
        linked: (id, feed) => this.options.go2rtc.backchannel(id, feed.url),
        clock: this.options.clock,
        log: this.options.log,
      },
      () => {
        if (this.outputs.get(cameraId) === output) {
          this.outputs.delete(cameraId);
        }
      },
    );
    this.outputs.set(cameraId, output);
    return output;
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
        reasons.push(`${codec}: ${messageOf(cause)}`);
      }
    }
    throw new CameraSpeakerRefusedError(cameraId, reasons);
  }
}
