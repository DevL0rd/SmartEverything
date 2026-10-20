import {
  FrameProcessor,
  type FrameProcessorEvent,
} from '@ricky0123/vad-web/dist/frame-processor.js';
import { Message } from '@ricky0123/vad-web/dist/messages.js';
import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import {
  DEFAULT_PAUSE_MS,
  DEFAULT_VOICE_DETECTION,
  Preroll,
  SPEECH_PREROLL_MS,
  TalkGate,
  levelOf,
  redemptionOf,
  speechDetectionOf,
} from '@smarteverything/domain';
import { concat } from './audio';
import { messageOf } from '@smarteverything/logging';

const VAD_FRAME_SAMPLES = 512;
const VAD_FRAME_MS = 32;
const PCM_FULL_SCALE = 32_768;

export interface SpeechGateEvents {
  readonly start: (firstSample: number) => void;
  readonly audio: (pcm: Int16Array) => void;
  readonly end: () => void;
  readonly failed: (reason: string) => void;
}

export interface SpeechGateOptions {
  readonly bargeInLevel: number;
  readonly assistantAudible: () => boolean;
  readonly now: () => number;
  readonly pauseMs?: number;
}

interface FrameOutcome {
  readonly probability: number;
  readonly confirmed: boolean;
  readonly ended: boolean;
}

function outcomeOf(events: readonly FrameProcessorEvent[]): FrameOutcome {
  const processed = events.find((event) => event.msg === Message.FrameProcessed);
  return {
    probability: processed?.msg === Message.FrameProcessed ? processed.probs.isSpeech : 0,
    confirmed: events.some((event) => event.msg === Message.SpeechRealStart),
    ended: events.some(
      (event) => event.msg === Message.SpeechEnd || event.msg === Message.VADMisfire,
    ),
  };
}

export class SpeechGate {
  private readonly processor: FrameProcessor;
  private readonly preroll = new Preroll<Int16Array>(SPEECH_PREROLL_MS);
  private readonly talk: TalkGate;
  private remainder = new Int16Array(0);
  private routed = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly model: Model,
    private readonly events: SpeechGateEvents,
    private readonly options: SpeechGateOptions,
  ) {
    this.processor = new FrameProcessor(
      (frame) => model.process(frame),
      () => {
        model.reset_state();
      },
      { ...speechDetectionOf(DEFAULT_VOICE_DETECTION, options.pauseMs ?? DEFAULT_PAUSE_MS) },
      VAD_FRAME_MS,
    );
    this.processor.resume();
    this.talk = new TalkGate(
      {
        open: (): void => {
          const opening = concat(this.preroll.take());
          events.start(this.routed - opening.length);
          events.audio(opening);
        },
        close: (): void => {
          events.end();
        },
      },
      options.bargeInLevel,
    );
  }

  hear(pcm: Int16Array): void {
    const joined = concat([this.remainder, pcm]);
    const whole = joined.length - (joined.length % VAD_FRAME_SAMPLES);
    this.remainder = joined.slice(whole);
    for (let offset = 0; offset < whole; offset += VAD_FRAME_SAMPLES) {
      const frame = joined.slice(offset, offset + VAD_FRAME_SAMPLES);
      this.queue = this.queue.then(() => this.step(frame));
    }
  }

  skip(samples: number): void {
    this.queue = this.queue.then(() => {
      this.routed += samples;
    });
  }

  pause(pauseMs: number): void {
    this.queue = this.queue.then(() => {
      this.processor.setOptions({ redemptionMs: redemptionOf(pauseMs) });
    });
  }

  flush(): void {
    this.queue = this.queue.then(() => {
      const seen: FrameProcessorEvent[] = [];
      this.processor.endSegment((event) => {
        seen.push(event);
      });
      if (outcomeOf(seen).ended) {
        this.talk.speechEnded();
      }
    });
  }

  reset(): void {
    this.queue = this.queue.then(() => {
      this.talk.speechEnded();
      this.routed += this.remainder.length;
      this.remainder = new Int16Array(0);
      this.preroll.take();
      this.processor.reset();
    });
  }

  async release(): Promise<void> {
    this.reset();
    await this.queue;
    await this.model.release();
  }

  private async step(frame: Int16Array): Promise<void> {
    this.routed += frame.length;
    const seen: FrameProcessorEvent[] = [];
    try {
      await this.processor.process(
        Float32Array.from(frame, (sample) => sample / PCM_FULL_SCALE),
        (event) => {
          seen.push(event);
        },
      );
    } catch (cause) {
      this.events.failed(messageOf(cause));
      return;
    }
    this.route(frame, outcomeOf(seen));
  }

  private route(frame: Int16Array, outcome: FrameOutcome): void {
    const wasOpen = this.talk.open;
    if (!wasOpen) {
      this.preroll.push(frame, VAD_FRAME_MS);
    }
    this.talk.frame({
      probability: outcome.probability,
      level: levelOf(frame, PCM_FULL_SCALE),
      durationMs: VAD_FRAME_MS,
      assistantAudible: this.options.assistantAudible(),
      at: this.options.now(),
    });
    if (outcome.confirmed) {
      this.talk.speechConfirmed();
    }
    if (wasOpen) {
      this.events.audio(frame);
    }
    if (outcome.ended) {
      this.talk.speechEnded();
    }
  }
}
