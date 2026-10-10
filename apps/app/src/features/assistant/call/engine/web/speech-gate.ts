import {
  BARGE_IN_LEVEL,
  Preroll,
  SPEECH_PREROLL_MS,
  TALK_FRAME_MS,
  TalkGate,
  levelOf,
} from '@smarteverything/domain';
import { detectionOf, echoPolicyOf, tuningOf, type GateSettings } from './audio-settings';
import { VAD_ASSET_PATH, vadLibrary, type MicVad, type MicVadOptions } from './vad-library';

const VAD_FRAME_MS = 32;

export interface SpeechGateSink {
  readonly start: () => void;
  readonly packet: (packet: Uint8Array) => void;
  readonly end: () => void;
}

export interface HeardFrame {
  readonly probability: number;
  readonly level: number;
  readonly at: number;
}

export interface WebSpeechGate {
  readonly packet: (packet: Uint8Array) => void;
  readonly retune: (settings: GateSettings) => void;
  readonly attach: (stream: MediaStream) => Promise<void>;
  readonly observe: (listener: (frame: HeardFrame) => void) => () => void;
  readonly reset: () => void;
  readonly stop: () => Promise<void>;
}

interface Detection {
  readonly talk: TalkGate;
  readonly listeners: ReadonlySet<(frame: HeardFrame) => void>;
  readonly assistantAudible: () => boolean;
}

function detectorOptions(
  stream: MediaStream,
  settings: GateSettings,
  detection: Detection,
): MicVadOptions {
  const { talk, listeners, assistantAudible } = detection;
  return {
    ...detectionOf(settings),
    model: 'v6',
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    startOnLoad: true,
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),
    onFrameProcessed: (probabilities, frame): void => {
      const level = levelOf(frame, 1);
      const at = performance.now();
      talk.frame({
        probability: probabilities.isSpeech,
        level,
        durationMs: VAD_FRAME_MS,
        assistantAudible: assistantAudible(),
        at,
      });
      listeners.forEach((listener) => {
        listener({ probability: probabilities.isSpeech, level, at });
      });
    },
    onSpeechRealStart: (): void => {
      talk.speechConfirmed();
    },
    onSpeechEnd: (): void => {
      talk.speechEnded();
    },
    onVADMisfire: (): void => {
      talk.speechEnded();
    },
  };
}

function gateOf(
  sink: SpeechGateSink,
  initial: GateSettings,
): { readonly talk: TalkGate; readonly preroll: Preroll<Uint8Array> } {
  const preroll = new Preroll<Uint8Array>(SPEECH_PREROLL_MS);
  const talk = new TalkGate(
    {
      open: (): void => {
        sink.start();
        preroll.take().forEach(sink.packet);
      },
      close: sink.end,
    },
    BARGE_IN_LEVEL.echoCancelled,
    echoPolicyOf(initial),
  );
  return { talk, preroll };
}

export async function openSpeechGate(
  stream: MediaStream,
  sink: SpeechGateSink,
  assistantAudible: () => boolean,
  initial: GateSettings,
): Promise<WebSpeechGate> {
  const { talk, preroll } = gateOf(sink, initial);
  const listeners = new Set<(frame: HeardFrame) => void>();
  const detection: Detection = { talk, listeners, assistantAudible };
  const library = await vadLibrary();
  let settings = initial;
  let detector: MicVad = await library.MicVAD.new(detectorOptions(stream, settings, detection));
  return {
    packet: (packet): void => {
      if (talk.open) {
        sink.packet(packet);
      } else {
        preroll.push(packet, TALK_FRAME_MS);
      }
    },
    retune: (next): void => {
      settings = next;
      detector.setOptions(tuningOf(next));
      talk.setPolicy(echoPolicyOf(next));
    },
    attach: async (next): Promise<void> => {
      talk.speechEnded();
      await detector.destroy();
      detector = await library.MicVAD.new(detectorOptions(next, settings, detection));
    },
    observe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    reset: (): void => {
      talk.speechEnded();
    },
    stop: (): Promise<void> => {
      talk.speechEnded();
      return detector.destroy();
    },
  };
}
