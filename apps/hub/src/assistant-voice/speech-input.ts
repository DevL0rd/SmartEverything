import { BARGE_IN, BARGE_IN_LEVEL } from '@smarteverything/domain';
import type { EndOfSpeechPause } from '../listening/end-of-speech-pause';
import type { MicMeter } from './mic-meter';
import { sileroModel } from './silero-vad';
import { SpeechGate, type SpeechGateEvents } from './speech-gate';
import { messageOf } from '@smarteverything/logging';

export type SpeechSource = 'gated-client' | 'echo-cancelled' | 'raw' | 'echo-free';

export function streamsInput(source: SpeechSource): boolean {
  return source === 'raw' || source === 'echo-free';
}

const BURST_SAMPLES = 16_000;

export interface SpeechInput {
  readonly hear: (pcm: Int16Array) => void;
  readonly activity: (speaking: boolean) => boolean;
  readonly reset: () => void;
  readonly release: () => Promise<void>;
}

export type SpeechPause = Pick<EndOfSpeechPause, 'ms' | 'onChange'>;

export interface SpeechInputContext {
  readonly pause?: SpeechPause;
  readonly assistantAudible: () => boolean;
  readonly now: () => number;
  readonly meter: MicMeter;
  readonly voice: (speaking: boolean) => void;
}

function clientSpeech(events: SpeechGateEvents): SpeechInput {
  let speaking = false;
  let heard = 0;
  const change = (next: boolean): void => {
    if (next !== speaking) {
      speaking = next;
      if (next) {
        events.start(heard);
      } else {
        events.end();
      }
    }
  };
  return {
    hear: (pcm): void => {
      heard += pcm.length;
      if (speaking) {
        events.audio(pcm);
      }
    },
    activity: (next): boolean => {
      change(next);
      return true;
    },
    reset: (): void => {
      change(false);
    },
    release: (): Promise<void> => {
      change(false);
      return Promise.resolve();
    },
  };
}

async function detectedSpeech(
  events: SpeechGateEvents,
  context: SpeechInputContext,
): Promise<SpeechInput> {
  const { pause } = context;
  const gate = new SpeechGate(await sileroModel(), events, {
    bargeInLevel: BARGE_IN_LEVEL.echoCancelled,
    assistantAudible: context.assistantAudible,
    now: context.now,
    ...(pause === undefined ? {} : { pauseMs: pause.ms() }),
  });
  const follow = pause?.onChange((ms) => {
    gate.pause(ms);
  });
  return {
    hear: (pcm): void => {
      gate.hear(pcm);
    },
    activity: () => false,
    reset: (): void => {
      gate.reset();
    },
    release: (): Promise<void> => {
      follow?.();
      return gate.release();
    },
  };
}

function voiceWatch(
  events: SpeechGateEvents,
  context: SpeechInputContext,
  echoFree: boolean,
): Promise<SpeechGate | null> {
  return sileroModel().then(
    (model) =>
      new SpeechGate(
        model,
        {
          start: (): void => {
            context.voice(true);
          },
          audio: (): void => undefined,
          end: (): void => {
            context.voice(false);
          },
          failed: events.failed,
        },
        {
          bargeInLevel: echoFree ? BARGE_IN_LEVEL.echoCancelled : BARGE_IN_LEVEL.raw,
          assistantAudible: context.assistantAudible,
          now: context.now,
        },
      ),
    (cause: unknown) => {
      events.failed(messageOf(cause));
      return null;
    },
  );
}

function streamedSpeech(
  events: SpeechGateEvents,
  context: SpeechInputContext,
  echoFree: boolean,
): SpeechInput {
  let audibleAt = Number.NEGATIVE_INFINITY;
  let watch: SpeechGate | null = null;
  const loading = voiceWatch(events, context, echoFree).then((gate) => {
    watch = gate;
    return gate;
  });
  return {
    hear: (pcm): void => {
      if (context.assistantAudible()) {
        audibleAt = context.now();
      }
      const dropped = !echoFree && context.now() - audibleAt <= BARGE_IN.echoTailMs;
      context.meter.heard(pcm, dropped);
      if (dropped) {
        return;
      }
      watch?.hear(pcm);
      for (let offset = 0; offset < pcm.length; offset += BURST_SAMPLES) {
        events.audio(pcm.subarray(offset, offset + BURST_SAMPLES));
      }
    },
    activity: () => false,
    reset: (): void => undefined,
    release: async (): Promise<void> => {
      context.meter.summarize();
      await (await loading)?.release();
    },
  };
}

export function speechInput(
  source: SpeechSource,
  events: SpeechGateEvents,
  context: SpeechInputContext,
): Promise<SpeechInput> {
  if (streamsInput(source)) {
    return Promise.resolve(streamedSpeech(events, context, source === 'echo-free'));
  }
  return source === 'gated-client'
    ? Promise.resolve(clientSpeech(events))
    : detectedSpeech(events, context);
}
