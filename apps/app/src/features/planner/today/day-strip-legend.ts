import type {
  PlannerCollectionRow,
  PlannerColourKey,
  PlannerStripSegment,
} from '@smarteverything/domain';

export interface StripLegendEntry {
  readonly key: string;
  readonly label: string;
  readonly state: 'event' | PlannerColourKey;
}

function inside(
  segment: PlannerStripSegment,
  window: { readonly from: number; readonly to: number },
): boolean {
  return Date.parse(segment.to) > window.from && Date.parse(segment.from) < window.to;
}

export function eventLegendOf(
  strip: readonly PlannerStripSegment[],
  collections: readonly PlannerCollectionRow[],
  window: { readonly from: number; readonly to: number },
): readonly StripLegendEntry[] {
  const byId = new Map(collections.map((row) => [row.id, row] as const));
  const shown = new Map<string, StripLegendEntry>();
  let loose = false;
  for (const segment of strip) {
    if (segment.kind !== 'event' || !inside(segment, window)) continue;
    const collection = segment.collection_id === null ? undefined : byId.get(segment.collection_id);
    if (collection === undefined) loose = true;
    else
      shown.set(collection.id, {
        key: collection.id,
        label: collection.name,
        state: collection.colour,
      });
  }
  const named = [...shown.values()];
  if (!loose) return named;
  return [
    ...named,
    { key: 'event', label: named.length === 0 ? 'Events' : 'Other events', state: 'event' },
  ];
}
