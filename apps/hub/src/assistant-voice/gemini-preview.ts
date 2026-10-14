import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from '@google/genai';
import {
  VOICE_PREVIEW_BYTES,
  VOICE_PREVIEW_TEXT,
  VOICE_PREVIEW_TIMEOUT_MS,
  type VoicePreviewRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import { MissingGeminiKeyError } from './gemini';
import { previewWav } from './preview-audio';

const PREVIEW_OUTPUT_TOKENS = 256;
const AUDIO_CHUNK = z.strictObject({ data: z.base64(), mime: z.literal('audio/pcm;rate=24000') });

export class VoicePreviewError extends Error {
  override readonly name = 'VoicePreviewError';
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface VoiceSampleRequest {
  readonly model: string;
  readonly voice: VoicePreviewRequest['voice'];
  readonly signal: AbortSignal;
  readonly usage: (usage: UsageMetadata) => void;
}
export interface VoiceSampleProvider {
  readonly sample: (request: VoiceSampleRequest) => Promise<Buffer>;
}

class SampleAudio {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  append(message: LiveServerMessage): void {
    for (const part of message.serverContent?.modelTurn?.parts ?? []) {
      const inline = part.inlineData;
      if (inline === undefined) continue;
      const chunk = AUDIO_CHUNK.parse({ data: inline.data, mime: inline.mimeType });
      const data = Buffer.from(chunk.data, 'base64');
      if (data.length % 2 !== 0 || this.bytes + data.length > VOICE_PREVIEW_BYTES)
        throw new VoicePreviewError(
          'The Live sample exceeded its audio limit or contained invalid PCM.',
        );
      this.bytes += data.length;
      this.chunks.push(data);
    }
  }
  wav(): Buffer {
    if (this.bytes === 0) throw new VoicePreviewError('Gemini Live returned no sample audio.');
    return previewWav(Buffer.concat(this.chunks));
  }
}

class SampleRun {
  private readonly audio = new SampleAudio();
  private session: Session | null = null;
  private settled = false;
  private readonly timer: NodeJS.Timeout;
  constructor(
    private readonly request: VoiceSampleRequest,
    private readonly resolve: (audio: Buffer) => void,
    private readonly reject: (error: Error) => void,
  ) {
    this.timer = setTimeout(() => {
      this.fail('Gemini Live did not return the sample in time.');
    }, VOICE_PREVIEW_TIMEOUT_MS);
    this.timer.unref();
    request.signal.addEventListener('abort', this.abort, { once: true });
    if (request.signal.aborted) this.abort();
  }
  readonly abort = (): void => {
    this.fail('Voice sample stopped.');
  };
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
      this.audio.append(message);
      if (message.usageMetadata !== undefined) this.request.usage(message.usageMetadata);
      if (message.toolCall !== undefined)
        throw new VoicePreviewError('Gemini Live tried to use a tool during a voice sample.');
      if (message.serverContent?.turnComplete === true) {
        const wav = this.audio.wav();
        this.finish();
        this.resolve(wav);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Gemini Live returned an invalid sample.');
    }
  }
  fail(reason: string): void {
    if (this.settled) return;
    this.finish();
    this.reject(new VoicePreviewError(reason));
  }
  private finish(): void {
    this.settled = true;
    clearTimeout(this.timer);
    this.request.signal.removeEventListener('abort', this.abort);
    this.session?.close();
    this.session = null;
  }
}

export class GeminiLivePreview implements VoiceSampleProvider {
  constructor(private readonly key: () => string | null) {}
  sample(request: VoiceSampleRequest): Promise<Buffer> {
    const apiKey = this.key();
    if (apiKey === null) return Promise.reject(new MissingGeminiKeyError());
    if (request.signal.aborted)
      return Promise.reject(new VoicePreviewError('Voice sample stopped.'));
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
          run.fail(error instanceof Error ? error.message : 'The voice sample could not start.');
        });
    });
  }
}
