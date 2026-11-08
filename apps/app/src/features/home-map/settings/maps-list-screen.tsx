import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AppHref } from '../../../components/app-href';
import type { HomeMapFeed, HomeMapSummary } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { homeMapRenderScene } from '../../../components/house-map/adapters/home-map-scene';
import { IsoStill } from '../../../components/house-map/iso/iso-still';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import { DETAIL_MIN_WIDTH, MASTER_WIDTH, useSizeClass } from '../../../design/size-class';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useDevices } from '../../../store/selectors';
import { useHomeMap } from '../data/home-map-query';
import {
  useHomeMapSet,
  useHomeMapSetActions,
  useRobotMapFeeds,
  type HomeMapSetOutcome,
} from '../data/map-set-query';
import { useCreateMap } from '../model/create-map';
import { MapOrderButtons, useMapOrder, type MapOrder } from './map-order';
import { HOME_MAPS_PATH, HOME_MAP_SETTINGS_PAGE } from '../settings';

export const HOME_MAPS_TITLE = 'Home maps';

export const MAP_LOOK_TITLE = 'Map look · every map';

export function mapPageHref(mapId: string): AppHref {
  return href.settings.page(`${HOME_MAPS_PATH}/${mapId}`);
}

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export function mapHasContent(map: HomeMapSummary): boolean {
  return map.roomCount > 0;
}

export function mapSubLine(map: HomeMapSummary): string {
  if (!mapHasContent(map)) return 'No map yet';
  const counts = `${plural(map.floorNames.length, 'floor')} · ${plural(map.roomCount, 'room')}`;
  return map.fedBy.length === 0 ? `${counts} · drawn by hand` : counts;
}

export function mapFedLine(
  mapId: string,
  feeds: readonly HomeMapFeed[],
  deviceName: (deviceId: string) => string | null,
): string | null {
  const names = [
    ...new Set(
      feeds
        .filter((feed) => feed.target?.mapId === mapId)
        .map((feed) => deviceName(feed.deviceId))
        .filter((name) => name !== null),
    ),
  ];
  return names.length === 0 ? null : `Fed by ${names.join(', ')} · updates automatically`;
}

export function orderedMaps(maps: readonly HomeMapSummary[]): readonly HomeMapSummary[] {
  return [...maps].sort((a, b) => a.position - b.position);
}

export function nextMapName(maps: readonly HomeMapSummary[]): string {
  const taken = new Set(maps.map((map) => map.name.trim().toLowerCase()));
  let number = maps.length + 1;
  while (taken.has(`map ${String(number)}`)) number += 1;
  return `Map ${String(number)}`;
}

const ADD_PROBLEMS: Readonly<Record<'offline' | 'unconfirmed', string>> = {
  offline: 'Connect to the hub to add a map',
  unconfirmed: "Couldn't confirm the new map · Try again",
};

export function addProblemOf(outcome: HomeMapSetOutcome<HomeMapSummary>): string | null {
  if (outcome.kind === 'done') return null;
  return outcome.kind === 'refused' ? outcome.message : ADD_PROBLEMS[outcome.kind];
}

const THUMB = 'h-20 w-28 overflow-hidden rounded-md bg-surface-2';

function FilledThumb({ map }: { readonly map: HomeMapSummary }): ReactNode {
  const { map: document } = useHomeMap(map.id);
  const input = useMemo(() => {
    if (document === null) return null;
    const [floor] = homeMapRenderScene({ map: document, live: {} }).floors;
    return floor === undefined ? null : { floor };
  }, [document]);
  if (input === null) return <Skeleton shape="block" className={THUMB} />;
  return (
    <View className={THUMB}>
      <IsoStill input={input} name={map.name} fill />
    </View>
  );
}

export function MapThumb({ map }: { readonly map: HomeMapSummary }): ReactNode {
  if (mapHasContent(map)) return <FilledThumb map={map} />;
  return (
    <View aria-hidden className={cn(THUMB, 'items-center justify-center')}>
      <Icon name="plan" size={32} tone="variant" />
    </View>
  );
}

function CreateMapButton({ map }: { readonly map: HomeMapSummary }): ReactNode {
  const create = useCreateMap(map.id);
  return (
    <View className="gap-1 px-4 pb-3">
      <Button
        label="Create a map"
        icon="plan"
        variant="tonal"
        loading={create.busy}
        disabled={create.offline}
        onPress={create.create}
      />
      {create.problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {create.problem}
        </Text>
      )}
    </View>
  );
}

export interface MapRowProps {
  readonly map: HomeMapSummary;
  readonly fedLine: string | null;
  readonly selected: boolean;
  readonly reorder: ReactNode;
}

function MapRowText({ map, fedLine }: Pick<MapRowProps, 'map' | 'fedLine'>): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong" className="shrink">
          {map.name}
        </Text>
        {map.isDefault ? <Badge label="Default" tone="primary" /> : null}
      </View>
      <Text variant="footnote" tone="variant">
        {mapSubLine(map)}
      </Text>
      {fedLine === null ? null : (
        <View className="flex-row items-center gap-1">
          <Icon name="check" size={16} tone="positive" />
          <Text variant="footnote" tone="variant" className="shrink">
            {fedLine}
          </Text>
        </View>
      )}
    </View>
  );
}

export function MapRow({ map, fedLine, selected, reorder }: MapRowProps): ReactNode {
  const label = [map.name, map.isDefault ? 'Default' : null, mapSubLine(map), fedLine]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <View>
      <View className="flex-row items-center">
        <Interactive
          role="link"
          label={label}
          href={mapPageHref(map.id)}
          selected={selected}
          className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 px-4 py-3"
        >
          <MapThumb map={map} />
          <MapRowText map={map} fedLine={fedLine} />
          <Icon name="chevronRight" size={20} tone="variant" />
        </Interactive>
        {reorder}
      </View>
      {mapHasContent(map) ? null : <CreateMapButton map={map} />}
    </View>
  );
}

export interface AddMap {
  readonly add: () => void;
  readonly busy: boolean;
  readonly problem: string | null;
}

function useAddMap(maps: readonly HomeMapSummary[]): AddMap {
  const actions = useHomeMapSetActions();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const outcome = await actions.create(nextMapName(maps));
    setBusy(false);
    setProblem(addProblemOf(outcome));
    if (outcome.kind === 'done') router.push(mapPageHref(outcome.value.id));
  };
  return {
    add: (): void => {
      if (!busy) background(run(), 'home_map.add_failed');
    },
    busy,
    problem,
  };
}

export function AddMapRow({ add }: { readonly add: AddMap }): ReactNode {
  return (
    <View className="items-start gap-1">
      <Button label="Add a map" icon="plus" variant="text" loading={add.busy} onPress={add.add} />
      {add.problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4">
          {add.problem}
        </Text>
      )}
    </View>
  );
}

export interface MapsListProps {
  readonly maps: readonly HomeMapSummary[];
  readonly fedLineOf: (mapId: string) => string | null;
  readonly selectedId: string | undefined;
  readonly add: AddMap;
  readonly order: MapOrder;
}

export function MapsList({ maps, fedLineOf, selectedId, add, order }: MapsListProps): ReactNode {
  const shown = orderedMaps(maps);
  return (
    <View className="gap-2">
      {shown.length === 0 ? null : (
        <List inset>
          {shown.map((map, index) => (
            <MapRow
              key={map.id}
              map={map}
              fedLine={fedLineOf(map.id)}
              selected={map.id === selectedId}
              reorder={
                shown.length < 2 ? null : (
                  <MapOrderButtons
                    mapId={map.id}
                    name={map.name}
                    index={index}
                    count={shown.length}
                    order={order}
                  />
                )
              }
            />
          ))}
        </List>
      )}
      {order.problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4">
          {order.problem}
        </Text>
      )}
      <AddMapRow add={add} />
    </View>
  );
}

function LoadedMaps({
  maps,
  selectedId,
}: {
  readonly maps: readonly HomeMapSummary[];
  readonly selectedId: string | undefined;
}): ReactNode {
  const feeds = useRobotMapFeeds();
  const devices = useDevices();
  const add = useAddMap(maps);
  const order = useMapOrder();
  const fedLineOf = (mapId: string): string | null =>
    mapFedLine(
      mapId,
      feeds ?? [],
      (deviceId) => devices.find((device) => device.id === deviceId)?.label ?? null,
    );
  return (
    <MapsList maps={maps} fedLineOf={fedLineOf} selectedId={selectedId} add={add} order={order} />
  );
}

function MapsSection({ selectedId }: { readonly selectedId: string | undefined }): ReactNode {
  const { maps, failure, retry } = useHomeMapSet();
  if (maps !== null) return <LoadedMaps maps={maps} selectedId={selectedId} />;
  if (failure !== null) return <ErrorState error={failure} retry={retry} />;
  return <Skeleton shape="tile" className="h-28 w-full" />;
}

export function LookSection(): ReactNode {
  return (
    <View className="gap-section-gap">
      <Text variant="title-3" accessibilityRole="header" className="px-4">
        {MAP_LOOK_TITLE}
      </Text>
      <SettingsPageBody page={HOME_MAP_SETTINGS_PAGE} />
    </View>
  );
}

function MapsOverview({ selectedId }: { readonly selectedId: string | undefined }): ReactNode {
  const column = 'min-w-0 max-w-reading grow shrink basis-96';
  return (
    <View className="flex-row flex-wrap items-start gap-section-gap">
      <View className={column}>
        <MapsSection selectedId={selectedId} />
      </View>
      <View className={column}>
        <LookSection />
      </View>
    </View>
  );
}

export interface MapsListScreenProps {
  readonly selectedId?: string;
  readonly detail?: ReactNode;
}

export function useTwoColumns(hasDetail: boolean): boolean {
  const { area, split } = useSizeClass();
  const settingsPane = split ? area - MASTER_WIDTH : area;
  return hasDetail && settingsPane >= MASTER_WIDTH + DETAIL_MIN_WIDTH;
}

export function MapsListScreen({ selectedId, detail }: MapsListScreenProps): ReactNode {
  const twoColumns = useTwoColumns(detail !== undefined);
  if (!twoColumns) {
    return (
      <SettingsFrame page={HOME_MAP_SETTINGS_PAGE} title={HOME_MAPS_TITLE} contentWidth="full">
        <MapsOverview selectedId={selectedId} />
      </SettingsFrame>
    );
  }
  return (
    <SettingsFrame page={HOME_MAP_SETTINGS_PAGE} title={HOME_MAPS_TITLE} scroll={false}>
      <View className="flex-1 flex-row gap-4 px-gutter">
        <View className="w-96">
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-section-gap pb-6"
            accessibilityLabel={HOME_MAPS_TITLE}
          >
            <MapsSection selectedId={selectedId} />
            <LookSection />
          </ScrollView>
        </View>
        <View className="min-w-0 flex-1">{detail}</View>
      </View>
    </SettingsFrame>
  );
}
