import {
  appendTo,
  type PlannerCollectionRow,
  type PlannerGuestRow,
  type PlannerItemRow,
  type PlannerSearchHit,
  type PlannerSearchPage,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import { visibleCollections } from '../sharing/visibility';
import { compare, decodeCursor, encodeCursor, type SearchPosition } from './cursor';
import { guestTexts, matchedFields, type Searchable } from './fields';
import { fold, tokensOf } from './fold';
import {
  occurrenceOf,
  referenceOf,
  startKey,
  stopKey,
  type Found,
  type SearchOccurrenceStore,
} from './occurrence';

export type SearchStore = SearchOccurrenceStore &
  Pick<HostStore, 'plannerCollections' | 'plannerGuests' | 'plannerShares' | 'profiles'>;

export const SEARCH_PAGE_SIZE = 50;

export interface SearchQuery {
  readonly profileId: string;
  readonly text: string;
  readonly now: Temporal.Instant;
  readonly timeZone: string;
  readonly when: 'all' | 'upcoming' | 'past';
  readonly collectionIds?: readonly string[] | undefined;
  readonly kinds?: readonly PlannerItemRow['kind'][] | undefined;
  readonly cursor?: string | undefined;
}

interface Ranked {
  readonly hit: PlannerSearchHit;
  readonly position: SearchPosition;
}

function candidates(store: SearchStore, query: SearchQuery): PlannerItemRow[] {
  const { kinds, collectionIds, profileId } = query;
  const single = kinds?.length === 1 ? kinds[0] : undefined;
  return store.plannerItems
    .list(profileId, { scope: 'visible', kind: single, collectionIds })
    .filter(
      (item) =>
        item.parent_id === null &&
        item.series_id === null &&
        item.status !== 'proposed' &&
        (kinds === undefined || kinds.includes(item.kind)) &&
        (item.kind === 'event' ||
          item.assignee_id === null ||
          item.assignee_id === profileId ||
          item.profile_id === profileId),
    );
}

function searchables(
  store: SearchStore,
  items: readonly PlannerItemRow[],
  calendars: ReadonlyMap<string, PlannerCollectionRow>,
): Searchable[] {
  const names = new Map(store.profiles.list().map((profile) => [profile.id, profile.name]));
  const guests = new Map<string, PlannerGuestRow[]>();
  for (const guest of store.plannerGuests.forItems(items.map((item) => item.id))) {
    appendTo(guests, guest.item_id, guest);
  }
  return items.map((item) => ({
    item,
    calendar: calendars.get(item.collection_id)?.name ?? null,
    guests: guestTexts(guests.get(item.id) ?? [], (id) => names.get(id)),
  }));
}

function positionOf(found: Found, item: PlannerItemRow): SearchPosition {
  const { view, reading } = found;
  const key = view.occurrence_key;
  if (reading === 'last') return { group: 2, time: -stopKey(view), item: item.id, key };
  const dated = view.start !== null || view.due_at !== null || view.due_date !== null;
  return { group: dated ? 0 : 1, time: dated ? startKey(view) : item.position, item: item.id, key };
}

function oneHolidayEach(
  ranked: readonly Ranked[],
  calendars: ReadonlyMap<string, PlannerCollectionRow>,
): Ranked[] {
  const seen = new Set<string>();
  return ranked.filter(({ hit }) => {
    const calendar = calendars.get(hit.occurrence.collection_id);
    if (calendar?.feed?.kind !== 'holidays') return true;
    const key = `${calendar.id}|${fold(hit.occurrence.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rank(store: SearchStore, query: SearchQuery): Ranked[] {
  const tokens = tokensOf(query.text);
  const calendars = new Map(
    visibleCollections(store, query.profileId).map((collection) => [collection.id, collection]),
  );
  const reference = referenceOf(query.now, query.timeZone);
  const ranked: Ranked[] = [];
  for (const searchable of searchables(store, candidates(store, query), calendars)) {
    const matched = matchedFields(searchable, tokens);
    if (matched === null) continue;
    const found = occurrenceOf(store, searchable.item, reference, query.when);
    if (found === undefined) continue;
    ranked.push({
      hit: { occurrence: found.view, reading: found.reading, matched },
      position: positionOf(found, searchable.item),
    });
  }
  return oneHolidayEach(
    ranked.sort((a, b) => compare(a.position, b.position)),
    calendars,
  );
}

export function searchPlanner(store: SearchStore, query: SearchQuery): PlannerSearchPage {
  const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
  const rest = rank(store, query).filter(
    (entry) => after === null || compare(entry.position, after) > 0,
  );
  const page = rest.slice(0, SEARCH_PAGE_SIZE);
  const last = page.at(-1);
  return {
    hits: page.map((entry) => entry.hit),
    next: rest.length > page.length && last !== undefined ? encodeCursor(last.position) : null,
  };
}
