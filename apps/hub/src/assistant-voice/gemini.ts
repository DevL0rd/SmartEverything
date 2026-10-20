import {
  ActivityHandling,
  MediaResolution,
  EndSensitivity,
  StartSensitivity,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type AutomaticActivityDetection,
  type FunctionDeclaration,
  type FunctionResponse,
  type LiveConnectConfig,
  type LiveConnectParameters,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import type { SightResolution, VoiceActiveThinking } from '@smarteverything/domain';
import { LIVE_WEB_SEARCH_TOOL } from '../assistant/web-search';
import { LiveTrace } from './gemini-trace';
import { pingOf, type Ping } from './live-ping';
import type { VideoFrame } from './video';

export interface LiveOptions {
  readonly model: string;
  readonly voice: string;
  readonly system: string;
  readonly tools: readonly FunctionDeclaration[];
  readonly webSearch: boolean;
  readonly resume: string | null;
  readonly window: LiveWindow | null;
  readonly automatic: boolean;
  readonly resolution?: SightResolution;
  readonly pauseMs?: number;
  readonly thinking?: VoiceActiveThinking;
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
  readonly resumable: (handle: string | null) => void;
  readonly goAway?: (timeLeft: string | null) => void;
  readonly usage: (usage: UsageMetadata) => void;
  readonly closed: (reason: string, code: number) => void;
}

export type ToolScheduling = 'silent' | 'idle' | 'interrupt';

interface ToolDelivery {
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
  readonly alive?: Ping;
}

export interface VoiceProvider {
  readonly live: (options: LiveOptions, events: LiveEvents) => Promise<LiveSession>;
}

const QUICK_TURNS = {
  disabled: false,
  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
  prefixPaddingMs: 200,
};

function turnTakingOf(options: LiveOptions): AutomaticActivityDetection {
  if (!options.automatic) {
    return { disabled: true };
  }
  const quick = { ...QUICK_TURNS, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH };
  if (options.pauseMs === undefined || options.pauseMs === 0) {
    return quick;
  }
  return { ...quick, silenceDurationMs: options.pauseMs };
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

const THINKING_LEVELS: Readonly<Record<VoiceActiveThinking, ThinkingLevel>> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

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

const MIC_RATE = 16_000;

export const TRAILING_SILENCE_MS = 500;

const TRAILING_SILENCE = pcmBase64(new Int16Array((MIC_RATE * TRAILING_SILENCE_MS) / 1000));

const PCM_MIME = 'audio/pcm;rate=16000';

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
  if (update === undefined) {
    return;
  }
  const handle = update.newHandle ?? '';
  events.resumable(update.resumable === true && handle !== '' ? handle : null);
}

type InteractionStatus = 'IN_PROGRESS' | 'IDLE';

function statusOf(value: unknown): InteractionStatus | null {
  if (typeof value !== 'object' || value === null || !('interactionStatus' in value)) {
    return null;
  }
  const status = value.interactionStatus;
  return status === 'IN_PROGRESS' || status === 'IDLE' ? status : null;
}

class Interaction {
  private held = false;

  finished(message: LiveServerMessage): boolean {
    const status = statusOf(message) ?? statusOf(message.serverContent);
    const complete = message.serverContent?.turnComplete === true;
    if (complete && status === 'IN_PROGRESS') {
      this.held = true;
      return false;
    }
    if (complete || (status === 'IDLE' && this.held)) {
      this.held = false;
      return true;
    }
    return false;
  }
}

function route(message: LiveServerMessage, events: LiveEvents, interaction: Interaction): void {
  const content = message.serverContent;
  if (content !== undefined) {
    routeContent(content, events);
  }
  calls(message, events);
  if (interaction.finished(message)) {
    events.turnComplete();
  }
  resumption(message, events);
  if (message.goAway !== undefined) {
    events.goAway?.(message.goAway.timeLeft ?? null);
  }
  if (message.usageMetadata !== undefined) {
    events.usage(message.usageMetadata);
  }
}

export type LiveWire = Pick<
  Session,
  'sendRealtimeInput' | 'sendClientContent' | 'sendToolResponse' | 'close'
>;

function toolResponseOf(
  call: { readonly id: string; readonly name: string },
  response: Readonly<Record<string, unknown>>,
  delivery: ToolDelivery,
  scheduled: boolean,
): FunctionResponse {
  return {
    ...call,
    response: { ...response },
    ...(scheduled ? { scheduling: SCHEDULES[delivery.scheduling] } : {}),
    willContinue: delivery.more,
  };
}

export function liveSessionOf(
  session: LiveWire,
  automatic: boolean,
  scheduled = true,
): LiveSession {
  return {
    audio: (pcm): void => {
      session.sendRealtimeInput({
        audio: { data: pcmBase64(pcm), mimeType: PCM_MIME },
      });
    },
    speaking: (speaking): void => {
      if (!automatic) {
        session.sendRealtimeInput(speaking ? { activityStart: {} } : { activityEnd: {} });
      } else if (!speaking) {
        session.sendRealtimeInput({ audio: { data: TRAILING_SILENCE, mimeType: PCM_MIME } });
        session.sendRealtimeInput({ audioStreamEnd: true });
      }
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
        functionResponses: [toolResponseOf({ id, name }, response, delivery, scheduled)],
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
    alive: pingOf(session),
  };
}

export function liveConfigOf(options: LiveOptions): LiveConnectConfig {
  const resolution = resolutionOf(options);
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.system,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
    ...(options.thinking === undefined
      ? {}
      : {
          thinkingConfig: {
            thinkingLevel: THINKING_LEVELS[options.thinking],
            includeThoughts: false,
          },
        }),
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
    tools: [
      ...(options.webSearch ? [LIVE_WEB_SEARCH_TOOL] : []),
      { functionDeclarations: [...options.tools] },
    ],
  };
}

export type LiveConnect = (apiKey: string, params: LiveConnectParameters) => Promise<LiveWire>;

const googleLive: LiveConnect = (apiKey, params) =>
  new GoogleGenAI({ apiKey }).live.connect(params);

export class Gemini implements VoiceProvider {
  constructor(
    private readonly key: () => string | null,
    private readonly connect: LiveConnect = googleLive,
  ) {}

  async live(options: LiveOptions, events: LiveEvents): Promise<LiveSession> {
    const apiKey = this.key();
    if (apiKey === null) {
      throw new MissingGeminiKeyError();
    }
    const trace = new LiveTrace(options);
    const counted = trace.counting(events);
    const interaction = new Interaction();
    trace.connecting();
    try {
      const session = await this.connect(apiKey, {
        model: options.model,
        config: liveConfigOf(options),
        callbacks: {
          onmessage: (message): void => {
            trace.message();
            route(message, counted, interaction);
          },
          onerror: (event): void => {
            trace.socketError(event.message);
          },
          onclose: (event): void => {
            trace.socketClosed(event);
            events.closed(event.reason === '' ? 'closed' : event.reason, event.code);
          },
        },
      });
      trace.connected();
      return liveSessionOf(session, options.automatic, options.thinking === undefined);
    } catch (cause) {
      trace.connectFailed(cause);
      throw cause;
    }
  }
}
