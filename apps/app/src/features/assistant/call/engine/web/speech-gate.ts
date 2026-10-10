import {
  BARGE_IN_LEVEL,
  Preroll,
  SPEECH_DETECTION,
  SPEECH_PREROLL_MS,
  TALK_FRAME_MS,
  TalkGate,
  levelOf,
} from '@smarteverything/domain';
import { VAD_ASSET_PATH, vadLibrary, type MicVadOptions } from './vad-library';

const VAD_FRAME_MS = 32;

export interface SpeechGateSink {
  readonly start: () => void;
  readonly packet: (packet: Uint8Array) => void;
  readonly end: () => void;
}

export interface WebSpeechGate {
  readonly packet: (packet: Uint8Array) => void;
  readonly stop: () => Promise<void>;
}

function detectorOptions(
  stream: MediaStream,
  talk: TalkGate,
  assistantAudible: () => boolean,
): MicVadOptions {
  return {
    ...SPEECH_DETECTION,
    model: 'v6',
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    startOnLoad: true,
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),
    onFrameProcessed: (probabilities, frame): void => {
      talk.frame({
        probability: probabilities.isSpeech,
        level: levelOf(frame, 1),
        durationMs: VAD_FRAME_MS,
        assistantAudible: assistantAudible(),
        at: performance.now(),
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

export async function openSpeechGate(
  stream: MediaStream,
  sink: SpeechGateSink,
  assistantAudible: () => boolean,
): Promise<WebSpeechGate> {
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
  );
  const library = await vadLibrary();
  const detector = await library.MicVAD.new(detectorOptions(stream, talk, assistantAudible));
  return {
    packet: (packet): void => {
      if (talk.open) {
        sink.packet(packet);
      } else {
        preroll.push(packet, TALK_FRAME_MS);
      }
    },
    stop: (): Promise<void> => {
      talk.speechEnded();
      return detector.destroy();
    },
  };
}
