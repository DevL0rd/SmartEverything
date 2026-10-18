import { z } from 'zod';
import type { OpenRouterClient } from './client';
import { openRouterError } from './errors';
import { REQUEST_BYTES_MAX, requestTimeoutMs, shrinkMedia } from './media-shrink';

const RESPONSE_BYTES_MAX = 256 * 1024;
const HINT_CHARACTERS_MAX = 2000;

const AUDIO_FORMAT = z.enum(['wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm', 'aac']);
const LANGUAGE = z.string().regex(/^[a-z]{2}$/);
const USAGE = z.object({
  seconds: z.number().nonnegative().optional(),
  input_tokens: z.int().nonnegative().optional(),
  output_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
});
const ANSWER = z.object({ text: z.string(), usage: USAGE.nullish() });

export interface TranscriptionAnswer {
  readonly text: string;
  readonly usage: z.output<typeof USAGE> | null;
}

export interface TranscriptionInput {
  readonly model: string;
  readonly data: Buffer;
  readonly format: string;
  readonly hints?: string;
  readonly language?: string;
}

export interface TranscriptionProvider {
  readonly transcribe: (input: TranscriptionInput) => Promise<TranscriptionAnswer>;
}

export class OpenRouterTranscription implements TranscriptionProvider {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly requestBytesMax: number = REQUEST_BYTES_MAX,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionAnswer> {
    const audio = await requestAudio(input, this.requestBytesMax);
    const hints = input.hints?.slice(-HINT_CHARACTERS_MAX);
    const body = {
      model: input.model,
      input_audio: {
        data: audio.data.toString('base64'),
        format: audio.format,
      },
      temperature: 0,
      response_format: 'json',
      ...(input.language === undefined ? {} : { language: LANGUAGE.parse(input.language) }),
      ...(hints === undefined || hints === ''
        ? {}
        : { provider: { options: { groq: { prompt: hints } } } }),
    };
    const answer = await this.client.retrying((signal) =>
      this.client.json(
        {
          path: '/audio/transcriptions',
          method: 'POST',
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(requestTimeoutMs(audio.data.byteLength)),
          ]),
          responseBytesMax: RESPONSE_BYTES_MAX,
          body,
        },
        ANSWER,
        'audio transcription',
      ),
    );
    return { text: answer.text, usage: answer.usage ?? null };
  }
}

async function requestAudio(
  input: TranscriptionInput,
  limit: number,
): Promise<{ readonly data: Buffer; readonly format: z.output<typeof AUDIO_FORMAT> }> {
  const format = AUDIO_FORMAT.parse(input.format);
  if (input.data.byteLength <= limit) return { data: input.data, format };
  const speech = await shrinkMedia(input.data, `audio/${format}`, limit);
  if (speech === undefined)
    throw openRouterError('bad_request', 'audio is too long to transcribe in one request');
  return { data: speech.data, format: 'ogg' };
}

const MIME_FORMATS: Readonly<Record<string, z.output<typeof AUDIO_FORMAT>>> = {
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
};

export function transcriptionFormat(mime: string): string {
  const format = MIME_FORMATS[mime.split(';')[0]?.trim().toLowerCase() ?? ''];
  if (format === undefined)
    throw openRouterError('bad_request', `unsupported transcription audio type ${mime}`);
  return format;
}
