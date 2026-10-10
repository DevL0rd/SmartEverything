import { BARGE_IN, BARGE_IN_LEVEL } from '@smarteverything/domain';
import { sileroModel } from './silero-vad';
import { SpeechGate, type SpeechGateEvents } from './speech-gate';

export type SpeechSource = 'gated-client' | 'echo-cancelled' | 'raw';

const BURST_SAMPLES = 16_000;

export interface SpeechInput {
  readonly hear: (pcm: Int16Array) => void;
  readonly activity: (speaking: boolean) => boolean;
  readonly reset: () => void;
  readonly release: () => Promise<void>;
}

export interface SpeechInputContext {
  readonly assistantAudible: () => boolean;
  readonly now: () => number;
}

function clientSpeech(events: SpeechGateEvents): SpeechInput {
  let speaking = false;
  const change = (next: boolean): void => {
    if (next !== speaking) {
      speaking = next;
      if (next) {
        events.start();
      } else {
        events.end();
      }
    }
  };
  return {
    hear: (pcm): void => {
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
  const gate = new SpeechGate(await sileroModel(), events, {
    bargeInLevel: BARGE_IN_LEVEL.echoCancelled,
    ...context,
  });
  return {
    hear: (pcm): void => {
      gate.hear(pcm);
    },
    activity: () => false,
    reset: (): void => {
      gate.reset();
    },
    release: () => gate.release(),
  };
}

function streamedSpeech(events: SpeechGateEvents, context: SpeechInputContext): SpeechInput {
  let audibleAt = Number.NEGATIVE_INFINITY;
  return {
    hear: (pcm): void => {
      if (context.assistantAudible()) {
        audibleAt = context.now();
      }
      if (context.now() - audibleAt <= BARGE_IN.echoTailMs) {
        return;
      }
      for (let offset = 0; offset < pcm.length; offset += BURST_SAMPLES) {
        events.audio(pcm.subarray(offset, offset + BURST_SAMPLES));
      }
    },
    activity: () => false,
    reset: (): void => undefined,
    release: () => Promise.resolve(),
  };
}

export function speechInput(
  source: SpeechSource,
  events: SpeechGateEvents,
  context: SpeechInputContext,
): Promise<SpeechInput> {
  if (source === 'raw') {
    return Promise.resolve(streamedSpeech(events, context));
  }
  return source === 'gated-client'
    ? Promise.resolve(clientSpeech(events))
    : detectedSpeech(events, context);
}
