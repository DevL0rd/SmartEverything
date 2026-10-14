import {
  ActivityHandling,
  MediaResolution,
  EndSensitivity,
  StartSensitivity,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  type AutomaticActivityDetection,
  type FunctionDeclaration,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import { DEFAULT_PAUSE_MS, type SightResolution } from '@smarteverything/domain';
import { LIVE_WEB_SEARCH_TOOL } from '../assistant/web-search';
import type { VideoFrame } from './video';

export interface LiveOptions {
  readonly model: string;
  readonly voice: string;
  readonly system: string;
  readonly tools: readonly FunctionDeclaration[];
  readonly resume: string | null;
  readonly window: LiveWindow | null;
  readonly automatic: boolean;
  readonly resolution?: SightResolution;
  readonly pauseMs?: number;
}

export interface LiveWindow {
  readonly triggerTokens: number;
  readonly targetTokens: number;
}

export interface LiveEvents {
  readonly audio: (pcm: Int16Array) => void;
  readonly said: (text: string) => void;
  readonly heard: (text: string) => void;
  readonly interrupted: () => void;
  readonly turnComplete: () => void;
  readonly tool: (id: string, name: string, args: Readonly<Record<string, unknown>>) => void;
  readonly resumable: (handle: string) => void;
  readonly usage: (usage: UsageMetadata) => void;
  readonly closed: (reason: string) => void;
}

export type ToolScheduling = 'silent' | 'idle' | 'interrupt';

export interface ToolDelivery {
  readonly scheduling: ToolScheduling;
  readonly more: boolean;
}

export interface Picture {
  readonly data: Buffer;
  readonly mimeType: string;
}

export interface LiveSession {
  readonly audio: (pcm: Int16Array) => void;
  readonly speaking: (speaking: boolean) => void;
  readonly text: (text: string, respond: boolean) => void;
  readonly picture: (picture: Picture) => void;
  readonly toolResult: (
    id: string,
    name: string,
    response: Readonly<Record<string, unknown>>,
    delivery: ToolDelivery,
  ) => void;
  readonly video: (frame: VideoFrame) => void;
  readonly close: () => void;
}

export interface VoiceProvider {
  readonly live: (options: LiveOptions, events: LiveEvents) => Promise<LiveSession>;
}

const QUICK_TURNS = {
  disabled: false,
  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
  prefixPaddingMs: 200,
  silenceDurationMs: DEFAULT_PAUSE_MS,
};

function turnTakingOf(options: LiveOptions): AutomaticActivityDetection {
  if (!options.automatic) {
    return { disabled: true };
  }
  if (options.pauseMs === undefined) {
    return QUICK_TURNS;
  }
  return options.pauseMs === 0 ? {} : { ...QUICK_TURNS, silenceDurationMs: options.pauseMs };
}

function resolutionOf(options: LiveOptions): MediaResolution | null {
  if (options.resolution === 'medium') {
    return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
  }
  return options.resolution === 'low' || options.automatic
    ? MediaResolution.MEDIA_RESOLUTION_LOW
    : null;
}

export class MissingGeminiKeyError extends Error {
  override readonly name = 'MissingGeminiKeyError';

  constructor() {
    super('Add a Gemini API key in Settings › AI assistant › Voice to talk with the assistant');
  }
}

const SCHEDULES: Readonly<Record<ToolScheduling, FunctionResponseScheduling>> = {
  silent: FunctionResponseScheduling.SILENT,
  idle: FunctionResponseScheduling.WHEN_IDLE,
  interrupt: FunctionResponseScheduling.INTERRUPT,
};

type Content = NonNullable<LiveServerMessage['serverContent']>;

function decode(base64: string): Int16Array {
  const bytes = Buffer.from(base64, 'base64');
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function pcmBase64(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
}

function play(content: Content, events: LiveEvents): void {
  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data !== undefined) {
      events.audio(decode(part.inlineData.data));
    }
  }
}

function transcripts(content: Content, events: LiveEvents): void {
  const heard = content.inputTranscription?.text ?? '';
  const said = content.outputTranscription?.text ?? '';
  if (heard !== '') {
    events.heard(heard);
  }
  if (said !== '') {
    events.said(said);
  }
}

function routeContent(content: Content, events: LiveEvents): void {
  play(content, events);
  transcripts(content, events);
  if (content.interrupted === true) {
    events.interrupted();
  }
}

function calls(message: LiveServerMessage, events: LiveEvents): void {
  for (const call of message.toolCall?.functionCalls ?? []) {
    events.tool(call.id ?? '', call.name ?? '', call.args ?? {});
  }
}

function resumption(message: LiveServerMessage, events: LiveEvents): void {
  const update = message.sessionResumptionUpdate;
  if (update?.resumable === true && update.newHandle !== undefined) {
    events.resumable(update.newHandle);
  }
}

function route(message: LiveServerMessage, events: LiveEvents): void {
  const content = message.serverContent;
  if (content !== undefined) {
    routeContent(content, events);
  }
  calls(message, events);
  if (content?.turnComplete === true) {
    events.turnComplete();
  }
  resumption(message, events);
  if (message.usageMetadata !== undefined) {
    events.usage(message.usageMetadata);
  }
}

export type LiveWire = Pick<
  Session,
  'sendRealtimeInput' | 'sendClientContent' | 'sendToolResponse' | 'close'
>;

export function liveSessionOf(session: LiveWire): LiveSession {
  return {
    audio: (pcm): void => {
      session.sendRealtimeInput({
        audio: { data: pcmBase64(pcm), mimeType: 'audio/pcm;rate=16000' },
      });
    },
    speaking: (speaking): void => {
      session.sendRealtimeInput(speaking ? { activityStart: {} } : { activityEnd: {} });
    },
    text: (text, respond): void => {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: respond,
      });
    },
    picture: (picture): void => {
      session.sendRealtimeInput({
        video: { data: picture.data.toString('base64'), mimeType: picture.mimeType },
      });
    },
    toolResult: (id, name, response, delivery): void => {
      session.sendToolResponse({
        functionResponses: [
          {
            id,
            name,
            response: { ...response },
            scheduling: SCHEDULES[delivery.scheduling],
            willContinue: delivery.more,
          },
        ],
      });
    },
    video: (frame): void => {
      session.sendRealtimeInput({
        video: { data: frame.data.toString('base64'), mimeType: frame.mimeType },
      });
    },
    close: (): void => {
      session.close();
    },
  };
}

export function liveConfigOf(options: LiveOptions): LiveConnectConfig {
  const resolution = resolutionOf(options);
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.system,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
    ...(resolution === null ? {} : { mediaResolution: resolution }),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: turnTakingOf(options),
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    },
    ...(options.window === null
      ? {}
      : {
          contextWindowCompression: {
            triggerTokens: String(options.window.triggerTokens),
            slidingWindow: { targetTokens: String(options.window.targetTokens) },
          },
        }),
    sessionResumption: options.resume === null ? {} : { handle: options.resume },
    tools: [LIVE_WEB_SEARCH_TOOL, { functionDeclarations: [...options.tools] }],
  };
}

export class Gemini implements VoiceProvider {
  constructor(private readonly key: () => string | null) {}

  async live(options: LiveOptions, events: LiveEvents): Promise<LiveSession> {
    const apiKey = this.key();
    if (apiKey === null) {
      throw new MissingGeminiKeyError();
    }
    const ai = new GoogleGenAI({ apiKey });
    const session = await ai.live.connect({
      model: options.model,
      config: liveConfigOf(options),
      callbacks: {
        onmessage: (message): void => {
          route(message, events);
        },
        onerror: (): void => undefined,
        onclose: (event): void => {
          events.closed(event.reason === '' ? 'closed' : event.reason);
        },
      },
    });
    return liveSessionOf(session);
  }
}
