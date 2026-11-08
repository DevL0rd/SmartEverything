import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { HomeMap, HomeMapId, HomeMapSummary } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { href } from '../../../app-shell/hrefs';
import { DETAIL_MIN_WIDTH } from '../../../design/size-class';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useHomeMap } from '../data/home-map-query';
import { useHomeMapSet, useHomeMapSetActions } from '../data/map-set-query';
import { HOME_MAPS_PATH, HOME_MAP_SETTINGS_PAGE } from '../settings';
import { MapsListScreen, useTwoColumns } from './maps-list-screen';
import {
  DANGER_TEXT,
  dangerActions,
  mapIdOf,
  useRun,
  type DangerAction,
  type Run,
} from './map-screen-model';
import {
  Floors,
  Problem,
  RealisticRow,
  RoomsRows,
  SavedVersions,
  SourceRow,
} from './map-screen-sections';

export const MAP_GONE_TEXT = 'This map no longer exists';

const MAP_SETTINGS_COLUMNS_MIN = 3 * DETAIL_MIN_WIDTH;

function NameAndDefault({ summary }: { readonly summary: HomeMapSummary }): ReactNode {
  const actions = useHomeMapSetActions();
  const run = useRun();
  const [draft, setDraft] = useState(summary.name);
  const commit = (): void => {
    const name = draft.trim();
    if (name === '' || name === summary.name) return;
    run.go(() => actions.update(summary.id, { name }));
  };
  return (
    <View className="gap-section-gap">
      <View className="px-4">
        <TextField
          label="Map name"
          value={draft}
          onChange={setDraft}
          onBlur={commit}
          onSubmit={commit}
        />
      </View>
      <List inset>
        <ListRow
          title="Default map"
          subtitle="Shown first on Home and Devices"
          trailing={
            <Switch
              label="Default map"
              value={summary.isDefault}
              disabled={summary.isDefault || run.busy}
              onChange={() => {
                run.go(() => actions.update(summary.id, { isDefault: true }));
              }}
            />
          }
        />
      </List>
      <Problem text={run.problem} />
    </View>
  );
}

interface ConfirmRowProps {
  readonly action: DangerAction;
  readonly run: Run;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function ConfirmRow({ action, run, onConfirm, onCancel }: ConfirmRowProps): ReactNode {
  const copy = DANGER_TEXT[action];
  return (
    <View className="gap-2 rounded-lg border-hairline border-critical bg-critical/8 px-4 py-3">
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        {`${copy.title}?`}
      </Text>
      <Text variant="footnote" tone="variant">
        {copy.line}
      </Text>
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button label="Cancel" variant="text" disabled={run.busy} onPress={onCancel} />
        <Button label={copy.confirm} variant="destructive" loading={run.busy} onPress={onConfirm} />
      </View>
    </View>
  );
}

function useDanger(map: HomeMap): {
  readonly run: Run;
  readonly asking: DangerAction | null;
  readonly ask: (action: DangerAction | null) => void;
  readonly confirm: (action: DangerAction) => void;
} {
  const actions = useHomeMapSetActions();
  const router = useRouter();
  const run = useRun();
  const [asking, ask] = useState<DangerAction | null>(null);
  const confirm = (action: DangerAction): void => {
    if (action === 'reset') {
      run.go(
        () => actions.reset(map.id),
        () => {
          ask(null);
        },
      );
      return;
    }
    run.go(
      () => actions.remove(map.id),
      () => {
        router.replace(href.settings.page(HOME_MAPS_PATH));
      },
    );
  };
  return { run, asking, ask, confirm };
}

function DangerZone({ map }: { readonly map: HomeMap }): ReactNode {
  const { run, asking, ask, confirm } = useDanger(map);
  return (
    <View className="gap-2 pt-4">
      <List title="Danger zone" inset>
        {dangerActions(map).map((action) => (
          <ListRow
            key={action}
            icon={action === 'reset' ? 'undo' : 'trash'}
            title={DANGER_TEXT[action].title}
            subtitle={DANGER_TEXT[action].line}
            destructive
            selected={asking === action}
            onPress={() => {
              ask(action);
            }}
          />
        ))}
      </List>
      {asking === null ? null : (
        <ConfirmRow
          action={asking}
          run={run}
          onConfirm={() => {
            confirm(asking);
          }}
          onCancel={() => {
            ask(null);
          }}
        />
      )}
      <Problem text={run.problem} />
    </View>
  );
}

export function MapPage({
  map,
  summary,
}: {
  readonly map: HomeMap;
  readonly summary: HomeMapSummary;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const columns = width >= MAP_SETTINGS_COLUMNS_MIN;
  const section = columns
    ? 'min-w-0 flex-1 max-w-reading gap-section-gap'
    : 'w-full max-w-reading gap-section-gap';
  return (
    <View
      onLayout={onLayout}
      className={
        columns ? 'w-full flex-row items-start gap-section-gap pb-6' : 'w-full gap-section-gap pb-6'
      }
    >
      <View className={section}>
        <NameAndDefault key={summary.id} summary={summary} />
        <Floors map={map} />
      </View>
      <View className={section}>
        <SourceRow map={map} />
        <RealisticRow map={map} />
        <RoomsRows mapId={map.id} />
      </View>
      <View className={section}>
        <SavedVersions mapId={map.id} />
        <DangerZone map={map} />
      </View>
    </View>
  );
}

function MapBody({ mapId }: { readonly mapId: HomeMapId }): ReactNode {
  const set = useHomeMapSet();
  const { map, failure, retry } = useHomeMap(mapId);
  const summary = set.maps?.find((item) => item.id === mapId);
  if (set.maps !== null && summary === undefined) {
    return (
      <Text variant="body" tone="variant" className="px-4">
        {MAP_GONE_TEXT}
      </Text>
    );
  }
  if (failure !== null) return <ErrorState error={failure} retry={retry} />;
  if (set.failure !== null) return <ErrorState error={set.failure} retry={set.retry} />;
  if (map === null || summary === undefined) {
    return <Skeleton shape="tile" className="h-40 w-full" />;
  }
  return <MapPage map={map} summary={summary} />;
}

export function MapScreen({ mapId }: { readonly mapId: HomeMapId }): ReactNode {
  const twoColumns = useTwoColumns(true);
  const title = useHomeMapSet().maps?.find((item) => item.id === mapId)?.name ?? 'Map';
  if (twoColumns) {
    return (
      <MapsListScreen
        selectedId={mapId}
        detail={
          <ScrollView contentContainerClassName="pb-6" accessibilityLabel={title}>
            <MapBody mapId={mapId} />
          </ScrollView>
        }
      />
    );
  }
  return (
    <SettingsFrame page={HOME_MAP_SETTINGS_PAGE} title={title}>
      <MapBody mapId={mapId} />
    </SettingsFrame>
  );
}

export function MapScreenRoute({ raw }: { readonly raw: unknown }): ReactNode {
  const mapId = mapIdOf(raw);
  if (mapId !== null) return <MapScreen mapId={mapId} />;
  return (
    <SettingsFrame page={HOME_MAP_SETTINGS_PAGE} title="Map">
      <Text variant="body" tone="variant" className="px-4">
        {MAP_GONE_TEXT}
      </Text>
    </SettingsFrame>
  );
}
