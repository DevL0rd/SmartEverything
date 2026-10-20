import { levelOf } from '@smarteverything/domain';
import { concat } from '../assistant-voice/audio';
import type { Cancel, Clock } from '../clock';
import type { SpeechSegment } from '../listening/speech-segment';

const SAMPLES_PER_MS = 16;
const FRAME_SAMPLES = 512;
const PCM_FULL_SCALE = 32_768;
const HOLD_MS = 2500;
const CUT_MS = 4000;
const SHORTEST_MS = 600;
const QUIETEST_PEAK = 10 ** (-30 / 20);
const SEAM = new Int16Array(250 * SAMPLES_PER_MS);

export type Skipped = 'quiet' | 'short';

export interface UtteranceEvents {
  readonly heard: (utterance: SpeechSegment) => void;
  readonly skipped: (reason: Skipped, ms: number) => void;
}

interface Gathering {
  readonly startedAt: number;
  endedAt: number;
  readonly chunks: Int16Array[];
  samples: number;
  flush: Cancel;
}

export function peakLevel(pcm: Int16Array): number {
  let peak = 0;
  for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
    peak = Math.max(peak, levelOf(pcm.subarray(offset, offset + FRAME_SAMPLES), PCM_FULL_SCALE));
  }
  return peak;
}

export class Utterances {
  private gathering: Gathering | null = null;

  constructor(
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly events: UtteranceEvents,
  ) {}

  add(segment: SpeechSegment): void {
    if (peakLevel(segment.pcm) < QUIETEST_PEAK) {
      this.events.skipped('quiet', segment.pcm.length / SAMPLES_PER_MS);
      return;
    }
    const held = this.gathering;
    if (held !== null && segment.startedAt - held.endedAt > HOLD_MS) {
      this.finish();
    }
    const gathering = this.gathering;
    if (gathering === null) {
      this.gathering = {
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        chunks: [segment.pcm],
        samples: segment.pcm.length,
        flush: this.flushLater(),
      };
      this.cutIfLong();
      return;
    }
    gathering.flush();
    gathering.chunks.push(SEAM, segment.pcm);
    gathering.samples += segment.pcm.length;
    gathering.endedAt = segment.endedAt;
    gathering.flush = this.flushLater();
    this.cutIfLong();
  }

  private cutIfLong(): void {
    const gathering = this.gathering;
    if (gathering !== null && gathering.endedAt - gathering.startedAt >= CUT_MS) {
      this.finish();
    }
  }

  finish(): void {
    const gathering = this.gathering;
    this.gathering = null;
    if (gathering === null) {
      return;
    }
    gathering.flush();
    const ms = gathering.samples / SAMPLES_PER_MS;
    if (ms < SHORTEST_MS) {
      this.events.skipped('short', ms);
      return;
    }
    this.events.heard({
      startedAt: gathering.startedAt,
      endedAt: gathering.endedAt,
      pcm: concat(gathering.chunks),
    });
  }

  private flushLater(): Cancel {
    return this.clock.at(new Date(this.clock.now().getTime() + HOLD_MS), () => {
      this.finish();
    });
  }
}
