import { GoogleGenAI, type UsageMetadata } from '@google/genai';
import { GOOGLE_MODELS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { MissingGeminiKeyError } from '../assistant-voice/gemini';
import { recordTranscription, type PriceBook } from '../ledger/gemini-live';
import type { Ledger } from '../ledger/ledger';
import { wavOf } from './wav';

const TIMEOUT_MS = 30_000;
const MAX_ANSWER_TOKENS = 1024;
const NO_SPEECH = 'NO_SPEECH';
const GOOGLE_PREFIX = 'google:';

export interface TranscriptionAnswer {
  readonly text: string;
  readonly usage: UsageMetadata | null;
}

export interface TranscriptionInput {
  readonly model: string;
  readonly prompt: string;
  readonly wav: Buffer;
}

interface TranscriptionProvider {
  readonly transcribe: (input: TranscriptionInput) => Promise<TranscriptionAnswer>;
}

class NoTranscribeModelError extends Error {
  override readonly name = 'NoTranscribeModelError';

  constructor() {
    super('The Google model list has no model for transcribing.');
  }
}

class TranscriptionUsageMissingError extends Error {
  override readonly name = 'TranscriptionUsageMissingError';

  constructor(model: string) {
    super(`Gemini answered ${model} without saying how much it used, so the cost is unknown.`);
  }
}

export function transcribeModel(): string {
  const model = GOOGLE_MODELS.find((candidate) => candidate.kinds.includes('transcribe'));
  if (model === undefined) {
    throw new NoTranscribeModelError();
  }
  return model.id.slice(GOOGLE_PREFIX.length);
}

export class GeminiTranscription implements TranscriptionProvider {
  constructor(private readonly key: () => string | null) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionAnswer> {
    const apiKey = this.key();
    if (apiKey === null) {
      throw new MissingGeminiKeyError();
    }
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: input.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: 'audio/wav', data: input.wav.toString('base64') } },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: MAX_ANSWER_TOKENS,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    return { text: response.text ?? '', usage: response.usageMetadata ?? null };
  }
}

export interface TranscribeRequest {
  readonly pcm16k: Int16Array;
  readonly profileId: string;
  readonly pluginId: string | null;
  readonly names: readonly string[];
  readonly recent: readonly string[];
  readonly language?: string;
  readonly meta: Readonly<Record<string, string>>;
}

export interface TranscriberOptions {
  readonly provider: TranscriptionProvider;
  readonly ledger: Ledger;
  readonly prices: PriceBook;
  readonly log: Logger;
}

function promptOf(request: TranscribeRequest): string {
  const names =
    request.names.length === 0
      ? ''
      : ` Names that may be spoken: ${request.names.join(', ')}. Spell them that way.`;
  const recent =
    request.recent.length === 0
      ? ''
      : ` What was said just before, for context only:\n${request.recent.join('\n')}\n`;
  const language =
    request.language === undefined || request.language === ''
      ? 'in the language spoken'
      : `in this language: ${request.language}`;
  return `Transcribe the speech in this audio word for word, ${language}. Answer with the words only: no timestamps, labels or comments.${names}${recent} If there is no speech, only noise or music, answer exactly ${NO_SPEECH}.`;
}

function spokenOf(text: string): string | null {
  const spoken = text.trim();
  return spoken === '' || spoken.toUpperCase().includes(NO_SPEECH) ? null : spoken;
}

export class Transcriber {
  private readonly model = transcribeModel();

  constructor(private readonly options: TranscriberOptions) {}

  async transcribe(request: TranscribeRequest): Promise<string | null> {
    const answer = await this.options.provider.transcribe({
      model: this.model,
      prompt: promptOf(request),
      wav: wavOf(request.pcm16k),
    });
    this.record(request, answer);
    return spokenOf(answer.text);
  }

  private record(request: TranscribeRequest, answer: TranscriptionAnswer): void {
    try {
      if (answer.usage === null) {
        throw new TranscriptionUsageMissingError(this.model);
      }
      recordTranscription(this.options.ledger, this.options.prices, {
        profileId: request.profileId,
        messageId: null,
        pluginId: request.pluginId,
        model: this.model,
        usage: answer.usage,
        meta: { ...request.meta, audio_ms: Math.round(request.pcm16k.length / 16) },
      });
    } catch (cause) {
      this.options.log.error('transcripts.usage_unrecorded', cause, { pluginId: request.pluginId });
    }
  }
}
