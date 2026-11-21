import type { PhotoGroupKind, PhotoMergeSuggestion } from '@smarteverything/domain';
import type { StoreContext } from '../../store/context';
import { mergeSuggestions } from '../../vision/cluster';
import { centroidsOf, partitions, thresholdOf } from './grouping';
import { PeopleRows } from './rows';

const KINDS: readonly PhotoGroupKind[] = ['person', 'pet'];

export function mergeSuggestionsFor(
  context: StoreContext,
  profileId: string,
): PhotoMergeSuggestion[] {
  const rows = new PeopleRows(context);
  return KINDS.flatMap((kind) =>
    partitions(rows.visibleFaces(profileId, kind)).flatMap((part) =>
      mergeSuggestions(
        [...centroidsOf(part).values()].map((centroid) => centroid.group),
        new Set<string>(),
        thresholdOf(kind),
      ).map((suggestion): PhotoMergeSuggestion => ({
        groupIds: [suggestion.groupIds[0], suggestion.groupIds[1]],
        similarity: Math.min(1, suggestion.similarity),
      })),
    ),
  );
}
