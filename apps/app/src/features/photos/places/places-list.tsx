import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoPlace, PlaceCountry } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { CardGrid } from '../../../components/card-grid';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { Cover } from './cover';
import { countryGroups, photosText, placesByCount, type PlaceRow } from './place-model';

function placeLabel(place: PhotoPlace): string {
  return `${place.name}, ${place.country}, ${photosText(place.count)}`;
}

function detailLine(place: PhotoPlace): string {
  return place.admin === null
    ? photosText(place.count)
    : `${photosText(place.count)} · ${place.admin}`;
}

export function PlaceCard({ place }: { readonly place: PhotoPlace }): ReactNode {
  return (
    <Interactive
      href={href.photosPlace(String(place.id))}
      label={placeLabel(place)}
      className="flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-2.5"
      layerClassName="rounded-lg"
    >
      <Cover itemId={place.coverItemId} className="h-18 w-30 rounded-md" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {place.country}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {detailLine(place)}
        </Text>
      </View>
    </Interactive>
  );
}

export function PlaceRowItem({
  place,
  share,
}: {
  readonly place: PhotoPlace;
  readonly share: number | null;
}): ReactNode {
  return (
    <Interactive
      href={href.photosPlace(String(place.id))}
      label={placeLabel(place)}
      className="min-h-14 flex-row items-center gap-3 px-2.5 py-1.5"
      layerClassName="rounded-md"
    >
      <Cover itemId={place.coverItemId} className="size-10 rounded-md" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="label" numberOfLines={1}>
          {place.name}
        </Text>
        {share === null ? (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {place.country}
          </Text>
        ) : (
          <ProgressBar
            progress={share}
            colour="viz-1"
            label={`${place.name} share of ${place.country}`}
          />
        )}
      </View>
      <Text variant="caption" tone="variant" className="tabular-nums">
        {count(place.count)}
      </Text>
    </Interactive>
  );
}

function rowKey(row: PlaceRow): string {
  return String(row.place.id);
}

export function CountryList({
  countries,
}: {
  readonly countries: readonly PlaceCountry[];
}): ReactNode {
  return (
    <View className="gap-2">
      {countryGroups(countries).map((group) => (
        <View key={group.country.countryCode}>
          <View className="flex-row items-baseline justify-between gap-2 px-2.5 pb-1 pt-2">
            <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
              {group.country.country}
            </Text>
            <Text variant="caption" tone="variant" className="tabular-nums">
              {count(group.country.count)}
            </Text>
          </View>
          {group.rows.map((row) => (
            <PlaceRowItem key={rowKey(row)} place={row.place} share={row.share} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function PlaceCards({
  countries,
  columns,
}: {
  readonly countries: readonly PlaceCountry[];
  readonly columns: number;
}): ReactNode {
  return (
    <CardGrid
      items={placesByCount(countries)}
      columns={columns}
      keyOf={(place) => String(place.id)}
      render={(place) => <PlaceCard place={place} />}
    />
  );
}
