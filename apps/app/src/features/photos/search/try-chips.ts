import { dateCountOf, lastSeasonToken } from './dates';
import { cameraLabelOf, type SearchSources } from './suggest';
import type { SearchToken } from './tokens';

export interface TryChip {
  readonly label: string;
  readonly tokens: readonly SearchToken[];
}

function seasonChip(sources: SearchSources): TryChip | null {
  const summer = lastSeasonToken('summer', sources.dates);
  return (dateCountOf(summer, sources.dates) ?? 0) > 0
    ? { label: summer.label, tokens: [summer] }
    : null;
}

function videosChip(sources: SearchSources): TryChip | null {
  const year = sources.dates.today.slice(0, 4);
  const thisYear = [...sources.dates.months].some(
    ([month, count]) => month.startsWith(year) && count > 0,
  );
  if (!thisYear || (sources.videos ?? 0) === 0) return null;
  return {
    label: `Videos from ${year}`,
    tokens: [
      { kind: 'media', media: 'video', label: 'Videos' },
      { kind: 'date', from: `${year}-01-01`, to: `${year}-12-31`, label: year },
    ],
  };
}

function placeChip(sources: SearchSources): TryChip | null {
  const top = sources.countries
    .flatMap((country) => country.places)
    .reduce<SearchSources['countries'][number]['places'][number] | null>(
      (best, place) => (best === null || place.count > best.count ? place : best),
      null,
    );
  if (top === null) return null;
  const label = `${top.name}, ${top.country}`;
  return { label: top.name, tokens: [{ kind: 'place', placeId: top.id, label }] };
}

function cameraChip(sources: SearchSources): TryChip | null {
  const top = sources.cameras.reduce<SearchSources['cameras'][number] | null>(
    (best, camera) => (best === null || camera.items > best.items ? camera : best),
    null,
  );
  const label = top === null ? null : cameraLabelOf(top);
  return label === null ? null : { label, tokens: [{ kind: 'camera', label }] };
}

function favouritesChip(sources: SearchSources): TryChip | null {
  return (sources.favourites ?? 0) > 0
    ? { label: 'Favourites', tokens: [{ kind: 'favourites', label: 'Favourites' }] }
    : null;
}

export function tryChipsOf(sources: SearchSources): readonly TryChip[] {
  return [
    seasonChip(sources),
    videosChip(sources),
    placeChip(sources),
    cameraChip(sources),
    favouritesChip(sources),
  ].filter((chip): chip is TryChip => chip !== null);
}
