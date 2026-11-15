import { ApiError, microsOfUsd, type UsageEntry } from '@smarteverything/domain';
import { readImage } from '../../assistant/image/media';
import { tokenMeters } from '../../ledger/media-notes';
import type { OpenRouterClient } from '../../openrouter/client';
import { OpenRouterError } from '../../openrouter/errors';
import { IMAGE_RESPONSE_WIRE } from '../../openrouter/image-wire';
import { PHOTOS_PROVIDER, type PhotosMeter } from '../../openrouter/photos-usage';
import type { OrUsage } from '../../openrouter/wire';
import { ERASE_PROMPT, type EraseRequest, type Eraser } from './eraser';

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function usageOf(answer: Readonly<Record<string, number>> | undefined): OrUsage | null {
  if (answer === undefined) return null;
  const input = answer['input_tokens'] ?? answer['prompt_tokens'];
  const output = answer['output_tokens'] ?? answer['completion_tokens'];
  return {
    prompt_tokens: input ?? 0,
    completion_tokens: output ?? 0,
    total_tokens: (input ?? 0) + (output ?? 0),
  };
}

export function eraseUsageEntry(
  request: EraseRequest,
  model: string,
  answer: Readonly<Record<string, number>> | undefined,
): UsageEntry {
  const cost = answer?.['cost'] ?? null;
  return {
    source: 'openrouter',
    work: 'photos',
    profile_id: request.profileId,
    model_id: model,
    generation_id: null,
    ...tokenMeters(usageOf(answer)),
    cost_micros: cost === null ? 0 : microsOfUsd(cost),
    cost_state: cost === null ? 'estimated' : 'reported',
    meta: {
      kind: 'erase',
      item_id: request.itemId,
      cost_available: cost !== null,
      usage_available: answer !== undefined,
      ...(cost === null ? {} : { cost_usd: cost }),
    },
  };
}

function refusal(cause: unknown): unknown {
  if (cause instanceof OpenRouterError) return new ApiError('upstream_failed', cause.message);
  return cause;
}

export class OpenRouterEraser implements Eraser {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly meter: PhotosMeter,
    private readonly model: () => string,
  ) {}

  async erase(request: EraseRequest, signal: AbortSignal): Promise<Buffer> {
    const model = this.model();
    try {
      const answer = await this.client.image(
        {
          model,
          prompt: ERASE_PROMPT,
          n: 1,
          input_references: [
            { type: 'image_url', image_url: { url: dataUrl('image/jpeg', request.crop) } },
            { type: 'image_url', image_url: { url: dataUrl('image/png', request.mask) } },
          ],
          provider: PHOTOS_PROVIDER,
        },
        IMAGE_RESPONSE_WIRE,
        signal,
      );
      this.meter(eraseUsageEntry(request, model, answer.usage));
      const [first] = answer.data;
      if (first === undefined)
        throw new ApiError('upstream_failed', 'The eraser returned no image.');
      return (await readImage(Buffer.from(first.b64_json, 'base64'))).content;
    } catch (cause) {
      throw refusal(cause);
    }
  }
}
