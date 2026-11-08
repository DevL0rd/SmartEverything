import type {
  Memory,
  PhotoPlace,
  PlaceCluster,
  PlaceCountry,
  TimelineBucket,
} from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { count } from '../../../format/number';
import { geohashBounds, inside, type MapBounds } from './map-view';
import { monthLabel, monthsOf } from './time-range';

export interface PlaceRow {
  readonly place: PhotoPlace;
  readonly share: number;
}

export interface CountryGroup {
  readonly country: PlaceCountry;
  readonly rows: readonly PlaceRow[];
}

export interface VisitChip {
  readonly month: string;
  readonly label: string;
  readonly count: number;
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

export function photosText(value: number): string {
  return plural(value, 'photo', 'photos');
}

export function visitsText(value: number): string {
  return plural(value, 'visit', 'visits');
}

export function libraryLine(countries: readonly PlaceCountry[]): string {
  const places = countries.reduce((sum, country) => sum + country.places.length, 0);
  const items = countries.reduce((sum, country) => sum + country.count, 0);
  const where = `${plural(places, 'place', 'places')} in ${plural(countries.length, 'country', 'countries')}`;
  return `${where} · ${plural(items, 'photo has', 'photos have')} a location`;
}

export function countryGroups(countries: readonly PlaceCountry[]): readonly CountryGroup[] {
  return [...countries]
    .sort((a, b) => b.count - a.count)
    .map((country) => {
      const places = [...country.places].sort((a, b) => b.count - a.count);
      const top = places[0]?.count ?? 0;
      return {
        country,
        rows: places.map((place) => ({ place, share: top > 0 ? place.count / top : 0 })),
      };
    });
}

export function allPlaces(countries: readonly PlaceCountry[]): readonly PhotoPlace[] {
  return countries.flatMap((country) => country.places);
}

export function placesByCount(countries: readonly PlaceCountry[]): readonly PhotoPlace[] {
  return [...allPlaces(countries)].sort((a, b) => b.count - a.count);
}

export function placesIn(
  countries: readonly PlaceCountry[],
  bounds: MapBounds,
): readonly PhotoPlace[] {
  return placesByCount(countries).filter((place) => inside(place, bounds));
}

export function placeMatches(place: PhotoPlace, text: string): boolean {
  const needle = text.trim().toLocaleLowerCase();
  return [place.name, place.admin, place.country].some(
    (part) => part?.toLocaleLowerCase().includes(needle) === true,
  );
}

export function countriesWhere(
  countries: readonly PlaceCountry[],
  keep: (place: PhotoPlace) => boolean,
): readonly PlaceCountry[] {
  return countries.flatMap((country) => {
    const places = country.places.filter(keep);
    return places.length === 0 ? [] : [{ ...country, places }];
  });
}

export function sideCountries(
  countries: readonly PlaceCountry[],
  bounds: MapBounds,
  text: string,
): readonly PlaceCountry[] {
  const searching = text.trim() !== '';
  return countriesWhere(countries, (place) =>
    searching ? placeMatches(place, text) : inside(place, bounds),
  );
}

export function inViewLine(shown: number, total: number): string {
  return `${count(shown)} of ${count(total)}`;
}

export interface ClusterSummary {
  readonly title: string;
  readonly places: string | null;
}

export function clusterSummary(
  cluster: PlaceCluster,
  countries: readonly PlaceCountry[],
): ClusterSummary {
  const within = placesIn(countries, geohashBounds(cluster.geohash));
  const named = allPlaces(countries).find((place) => place.id === cluster.placeId);
  const places = within.length > 1 ? plural(within.length, 'place', 'places') : null;
  if (named !== undefined) return { title: named.name, places };
  const top = within[0];
  return { title: top === undefined ? 'Photos in this area' : `${top.name} and around`, places };
}

export const CLUSTER_COVER_SLOTS = 3;

export function clusterCovers(
  cluster: PlaceCluster,
  countries: readonly PlaceCountry[],
  more: readonly string[],
): readonly string[] {
  const around = placesIn(countries, geohashBounds(cluster.geohash)).map(
    (place) => place.coverItemId,
  );
  const ids = [cluster.coverItemId, ...more, ...around].filter((id): id is string => id !== null);
  return [...new Set(ids)].slice(0, CLUSTER_COVER_SLOTS);
}

export function clusterLine(
  cluster: PlaceCluster,
  span: string | null,
  places: string | null,
): string {
  return [`${count(cluster.count)} ${cluster.count === 1 ? 'item' : 'items'}`, span, places]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function visitChips(buckets: readonly TimelineBucket[]): readonly VisitChip[] {
  return monthsOf(buckets)
    .slice()
    .reverse()
    .map((bucket) => ({
      month: bucket.month,
      label: monthLabel(bucket.month),
      count: bucket.count,
    }));
}

export function spanLine(buckets: readonly TimelineBucket[]): string | null {
  const months = monthsOf(buckets);
  const first = months[0];
  const last = months.at(-1);
  if (first === undefined || last === undefined) return null;
  const from = first.month.slice(0, 4);
  const to = last.month.slice(0, 4);
  const years = from === to ? from : `${from} to ${to}`;
  return `${years} · ${visitsText(months.length)}`;
}

export function totalOf(buckets: readonly TimelineBucket[] | undefined): number | null {
  return buckets === undefined ? null : buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

export function placeMemoryOf(memories: readonly Memory[], placeId: number): Memory | null {
  return memories.reduce<Memory | null>((latest, memory) => {
    if (memory.kind !== 'trip' && memory.kind !== 'day_out') return latest;
    if (memory.placeId !== placeId) return latest;
    return latest === null || memory.to > latest.to ? memory : latest;
  }, null);
}

export interface MonthTiles {
  readonly tiles: readonly MediaTile[];
  readonly more: (() => void) | null;
}

export function feedMonths(
  buckets: readonly TimelineBucket[],
  month: string | null,
): readonly string[] {
  return monthsOf(buckets)
    .slice()
    .reverse()
    .map((bucket) => bucket.month)
    .filter((key) => month === null || key === month);
}

export function feedTiles(
  months: readonly string[],
  loaded: ReadonlyMap<string, MonthTiles>,
): readonly MediaTile[] {
  return months.flatMap((month) => loaded.get(month)?.tiles ?? []);
}
