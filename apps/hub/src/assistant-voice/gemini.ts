import {
  ActivityHandling,
  MediaResolution,
  EndSensitivity,
  StartSensitivity,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import type { VideoFrame } from './video';

export interface LiveOptions {
  readonly model: string;
  readonly voice: string;
  readonly system: string;
  readonly tools: readonly FunctionDeclaration[];
  readonly resume: string | null;
  readonly window: LiveWindow | null;
  readonly automatic: boolean;
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
  readonly text: (text: string, respond: boolean, image?: Picture) => void;
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
  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
  prefixPaddingMs: 100,
  silenceDurationMs: 500,
};

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

function wrap(session: Session): LiveSession {
  return {
    audio: (pcm): void => {
      session.sendRealtimeInput({
        audio: { data: pcmBase64(pcm), mimeType: 'audio/pcm;rate=16000' },
      });
    },
    speaking: (speaking): void => {
      session.sendRealtimeInput(speaking ? { activityStart: {} } : { activityEnd: {} });
    },
    text: (text, respond, image): void => {
      const picture =
        image === undefined
          ? []
          : [{ inlineData: { data: image.data.toString('base64'), mimeType: image.mimeType } }];
      session.sendClientContent({
        turns: [{ role: 'user', parts: [...picture, { text }] }],
        turnComplete: respond,
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
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: options.system,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
        ...(options.automatic ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW } : {}),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: options.automatic ? QUICK_TURNS : { disabled: true },
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
        tools: [{ functionDeclarations: [...options.tools] }],
      },
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
    return wrap(session);
  }
}
