import { z } from 'zod';
import type { OpenRouterClient } from './client';
import { openRouterError } from './errors';

const TIMEOUT_MS = 90_000;
const AUDIO_BYTES_MAX = 18 * 1024 * 1024;
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
  constructor(private readonly client: OpenRouterClient) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionAnswer> {
    if (input.data.byteLength > AUDIO_BYTES_MAX)
      throw openRouterError('bad_request', 'audio exceeds the 18 MiB transcription limit');
    const hints = input.hints?.slice(-HINT_CHARACTERS_MAX);
    const answer = await this.client.json(
      {
        path: '/audio/transcriptions',
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        responseBytesMax: RESPONSE_BYTES_MAX,
        body: {
          model: input.model,
          input_audio: {
            data: input.data.toString('base64'),
            format: AUDIO_FORMAT.parse(input.format),
          },
          temperature: 0,
          response_format: 'json',
          ...(input.language === undefined ? {} : { language: LANGUAGE.parse(input.language) }),
          ...(hints === undefined || hints === ''
            ? {}
            : { provider: { options: { groq: { prompt: hints } } } }),
        },
      },
      ANSWER,
      'audio transcription',
    );
    return { text: answer.text, usage: answer.usage ?? null };
  }
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
