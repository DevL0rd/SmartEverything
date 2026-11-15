import { microsOfUsd, type UsageEntry } from '@smarteverything/domain';
import { tokenMeters } from '../ledger/media-notes';
import type { OrUsage } from './wire';

export type PhotosMeter = (entry: UsageEntry) => void;

export interface PhotosCharge {
  readonly profileId: string;
  readonly model: string;
  readonly usage: OrUsage | null;
  readonly generationId: string | null;
  readonly kind: 'vision' | 'embedding' | 'pet_embedding';
  readonly itemId: string | null;
}

export const PHOTOS_PROVIDER = {
  zdr: true,
  data_collection: 'deny',
  allow_fallbacks: false,
} as const;

export function photosUsageEntry(charge: PhotosCharge): UsageEntry {
  const cost = charge.usage?.cost ?? null;
  return {
    source: 'openrouter',
    work: 'photos',
    profile_id: charge.profileId,
    model_id: charge.model,
    generation_id: charge.generationId,
    ...tokenMeters(charge.usage),
    cost_micros: cost === null ? 0 : microsOfUsd(cost),
    cost_state: cost === null ? 'estimated' : 'reported',
    meta: {
      kind: charge.kind,
      item_id: charge.itemId,
      cost_available: cost !== null,
      usage_available: charge.usage !== null,
      ...(cost === null ? {} : { cost_usd: cost }),
    },
  };
}
