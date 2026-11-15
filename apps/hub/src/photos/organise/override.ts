import type { MediaFacts } from '../../drive/metadata-read';
import type { PhotoMetaOverride } from '../../store/repositories/photo-meta-overrides';

export function overrideFacts(
  facts: MediaFacts,
  override: PhotoMetaOverride | undefined,
): MediaFacts {
  if (override === undefined) return facts;
  return {
    ...facts,
    takenAt:
      override.takenAt === null
        ? facts.takenAt
        : {
            iso: override.takenAt,
            offsetMin: override.tzOffsetMin,
            source: facts.takenAt?.source ?? 'metadata',
          },
    place: placeOf(facts, override),
  };
}

function placeOf(facts: MediaFacts, override: PhotoMetaOverride): MediaFacts['place'] {
  if (override.locationCleared) return null;
  if (override.latitude === null || override.longitude === null) return facts.place;
  return { lat: override.latitude, lon: override.longitude };
}
