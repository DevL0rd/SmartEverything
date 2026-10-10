import { NO_PRICES, type AiModelKind, type AiPricing, type AiReasoningMode } from './ai-models';

export const GOOGLE_PRICES_CHECKED = '2026-10-09';

export interface GoogleModel {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly description: string;
  readonly kinds: readonly AiModelKind[];
  readonly input: readonly string[];
  readonly output: readonly string[];
  readonly contextLength: number | null;
  readonly reasoning: AiReasoningMode;
  readonly pricing: AiPricing;
}

const LIVE_PRICES: AiPricing = {
  ...NO_PRICES,
  input_per_mtok: 0.75,
  output_per_mtok: 4.5,
  audio_in_per_mtok: 3,
  audio_out_per_mtok: 12,
  video_in_per_mtok: 1,
};

const FLASH_LITE_PRICES: AiPricing = {
  ...NO_PRICES,
  input_per_mtok: 0.3,
  output_per_mtok: 2.5,
  audio_in_per_mtok: 0.3,
  video_in_per_mtok: 0.3,
};

const EMBEDDING_PRICES: AiPricing = {
  ...NO_PRICES,
  input_per_mtok: 0.2,
  audio_in_per_mtok: 6.5,
  video_in_per_mtok: 12,
  per_image_in: 0.00012,
};

const veo = (seconds: Readonly<Record<string, number>>): AiPricing => ({
  ...NO_PRICES,
  per_video_second: { ...seconds },
});

const MEDIA_IN = ['text', 'image', 'audio', 'video'] as const;

export const GOOGLE_MODELS: readonly GoogleModel[] = [
  {
    id: 'google:gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    family: 'gemini-live',
    description: 'Real-time voice and video conversations.',
    kinds: ['live'],
    input: MEDIA_IN,
    output: ['text', 'audio'],
    contextLength: 128_000,
    reasoning: 'optional',
    pricing: LIVE_PRICES,
  },
  {
    id: 'google:gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    family: 'gemini-flash-lite',
    description: 'Fast, low-cost model for captions and transcripts.',
    kinds: ['transcribe'],
    input: MEDIA_IN,
    output: ['text'],
    contextLength: 1_048_576,
    reasoning: 'optional',
    pricing: FLASH_LITE_PRICES,
  },
  {
    id: 'google:gemini-embedding-2',
    name: 'Gemini Embedding 2',
    family: 'gemini-embedding',
    description: 'Embeddings for text, images, audio and video in one space.',
    kinds: ['embed'],
    input: MEDIA_IN,
    output: ['embeddings'],
    contextLength: null,
    reasoning: 'none',
    pricing: EMBEDDING_PRICES,
  },
  {
    id: 'google:veo-3.1-generate-preview',
    name: 'Veo 3.1',
    family: 'veo',
    description: 'Highest-quality video with sound.',
    kinds: ['video'],
    input: ['text', 'image'],
    output: ['video'],
    contextLength: null,
    reasoning: 'none',
    pricing: veo({ '720p': 0.4, '1080p': 0.4, '4k': 0.6 }),
  },
  {
    id: 'google:veo-3.1-fast-generate-preview',
    name: 'Veo 3.1 Fast',
    family: 'veo',
    description: 'Quicker, cheaper video with sound.',
    kinds: ['video'],
    input: ['text', 'image'],
    output: ['video'],
    contextLength: null,
    reasoning: 'none',
    pricing: veo({ '720p': 0.1, '1080p': 0.12, '4k': 0.3 }),
  },
  {
    id: 'google:veo-3.1-lite-generate-preview',
    name: 'Veo 3.1 Lite',
    family: 'veo',
    description: 'Lowest-cost video clips.',
    kinds: ['video'],
    input: ['text', 'image'],
    output: ['video'],
    contextLength: null,
    reasoning: 'none',
    pricing: veo({ '720p': 0.05, '1080p': 0.08 }),
  },
];

export class UnknownGoogleModelError extends Error {
  override readonly name = 'UnknownGoogleModelError';

  constructor(readonly modelId: string) {
    super(`There is no Google price for ${modelId}.`);
  }
}

export function googleModelOf(modelId: string): GoogleModel {
  const model = GOOGLE_MODELS.find((candidate) => candidate.id === modelId);
  if (model === undefined) {
    throw new UnknownGoogleModelError(modelId);
  }
  return model;
}

export function googlePriceOf(
  modelId: string,
  overrides: Readonly<Record<string, AiPricing>>,
): AiPricing {
  const model = googleModelOf(modelId);
  return overrides[model.id] ?? model.pricing;
}

export function googleModelIdOf(apiModel: string): string {
  return `google:${apiModel.replace(/^models\//, '')}`;
}
