import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import {
  VOICE_PREVIEW_TEXT,
  VOICE_PREVIEW_TIMEOUT_MS,
  type CallVoice,
} from '@smarteverything/domain';
import { z } from 'zod';
import { MissingGeminiKeyError } from './gemini';
import { previewWav } from './preview-audio';
import { messageOf } from '@smarteverything/logging';

const PREVIEW_OUTPUT_TOKENS = 256;
const AUDIO_CHUNK = z.strictObject({ data: z.base64(), mime: z.literal('audio/pcm;rate=24000') });

class VoicePreviewError extends Error {
  override readonly name = 'VoicePreviewError';
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface VoiceSampleRequest {
  readonly model: string;
  readonly voice: CallVoice;
  readonly signal: AbortSignal;
  readonly usage: (usage: UsageMetadata) => void;
}
export interface VoiceSampleProvider {
  readonly sample: (request: VoiceSampleRequest) => Promise<Buffer>;
}

class SampleRun {
  private readonly chunks: Buffer[] = [];
  private readonly timeout = AbortSignal.timeout(VOICE_PREVIEW_TIMEOUT_MS);
  private session: Session | null = null;
  private settled = false;
  constructor(
    private readonly request: VoiceSampleRequest,
    private readonly resolve: (audio: Buffer) => void,
    private readonly reject: (error: Error) => void,
  ) {
    this.timeout.addEventListener('abort', this.expire, { once: true });
    request.signal.addEventListener('abort', this.stop, { once: true });
    if (request.signal.aborted) this.stop();
  }
  ready(session: Session): void {
    if (this.settled) {
      session.close();
      return;
    }
    this.session = session;
    session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: `Say exactly: ${VOICE_PREVIEW_TEXT}` }] }],
      turnComplete: true,
    });
  }
  message(message: LiveServerMessage): void {
    if (this.settled) return;
    try {
      this.collect(message);
      if (message.usageMetadata !== undefined) this.request.usage(message.usageMetadata);
      if (message.toolCall !== undefined)
        throw new VoicePreviewError('Gemini Live tried to use a tool during a voice sample.');
      if (message.serverContent?.turnComplete === true) this.complete();
    } catch (error) {
      this.fail(messageOf(error));
    }
  }
  fail(reason: string): void {
    if (this.settled) return;
    this.finish();
    this.reject(new VoicePreviewError(reason));
  }
  private readonly stop = (): void => {
    this.fail('Voice sample stopped.');
  };
  private readonly expire = (): void => {
    this.fail('Gemini Live did not return the sample in time.');
  };
  private collect(message: LiveServerMessage): void {
    for (const part of message.serverContent?.modelTurn?.parts ?? []) {
      const inline = part.inlineData;
      if (inline === undefined) continue;
      const chunk = AUDIO_CHUNK.parse({ data: inline.data, mime: inline.mimeType });
      this.chunks.push(Buffer.from(chunk.data, 'base64'));
    }
  }
  private complete(): void {
    if (this.chunks.length === 0)
      throw new VoicePreviewError('Gemini Live returned no sample audio.');
    const wav = previewWav(Buffer.concat(this.chunks));
    this.finish();
    this.resolve(wav);
  }
  private finish(): void {
    this.settled = true;
    this.timeout.removeEventListener('abort', this.expire);
    this.request.signal.removeEventListener('abort', this.stop);
    this.session?.close();
    this.session = null;
  }
}

export class GeminiLivePreview implements VoiceSampleProvider {
  constructor(private readonly key: () => string | null) {}
  sample(request: VoiceSampleRequest): Promise<Buffer> {
    const apiKey = this.key();
    if (apiKey === null) return Promise.reject(new MissingGeminiKeyError());
    return new Promise((resolve, reject) => {
      const run = new SampleRun(request, resolve, reject);
      const ai = new GoogleGenAI({ apiKey });
      ai.live
        .connect({
          model: request.model,
          config: {
            responseModalities: [Modality.AUDIO],
            maxOutputTokens: PREVIEW_OUTPUT_TOKENS,
            systemInstruction: 'Read only the requested sample line once. Do not add other words.',
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voice } } },
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          },
          callbacks: {
            onmessage: (message): void => {
              run.message(message);
            },
            onerror: (): void => {
              run.fail('Gemini Live could not generate this voice sample.');
            },
            onclose: (): void => {
              run.fail('Gemini Live closed before the voice sample finished.');
            },
          },
        })
        .then(
          (session) => {
            run.ready(session);
          },
          () => {
            run.fail(
              'Gemini Live could not connect using this call model and voice. Check the model and key.',
            );
          },
        )
        .catch((error: unknown) => {
          run.fail(messageOf(error));
        });
    });
  }
}
