import type { PlannerRadioResult } from '@smarteverything/domain';
import { keepPreviousData, skipToken } from '@tanstack/react-query';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { searchPlannerRadio } from '../../../api/planner';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useRadioPreview, type RadioPreview } from './radio-preview';
import {
  SOUND_COPY,
  isChosen,
  radioDetailOf,
  radioQueryOf,
  radioSound,
  type ChosenSound,
  type MediaSound,
  type SoundUse,
} from './sound-model';

export interface SoundTabProps {
  readonly sound: ChosenSound | null;
  readonly use: SoundUse;
  readonly onPick: (sound: MediaSound) => void;
}

function useRadioSearch(text: string): {
  readonly query: string | null;
  readonly stations: readonly PlannerRadioResult[] | undefined;
  readonly failed: boolean;
} {
  const query = radioQueryOf(useDeferredValue(text));
  const result = useScreenQuery({
    queryKey: ['planner-radio', query],
    queryFn:
      query === null
        ? skipToken
        : ({ signal }): Promise<PlannerRadioResult[]> => searchPlannerRadio(query, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  return { query, stations: result.data, failed: result.isError };
}

function StationRow({
  station,
  chosen,
  preview,
  onPick,
}: {
  readonly station: PlannerRadioResult;
  readonly chosen: boolean;
  readonly preview: RadioPreview;
  readonly onPick: () => void;
}): ReactNode {
  const playing = preview.playingId === station.station_id;
  const failed = preview.failedId === station.station_id;
  const detail = failed ? 'This stream would not play here' : radioDetailOf(station);
  return (
    <ListRow
      title={station.name}
      titleEllipsize="end"
      {...(detail === null ? {} : { subtitle: detail })}
      {...(failed ? { subtitleTone: 'critical' as const } : {})}
      icon="radio"
      selected={chosen}
      onPress={onPick}
      trailing={
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? `Stop ${station.name}` : `Listen to ${station.name}`}
          selected={playing}
          onPress={() => {
            preview.toggle(station.station_id, station.url);
          }}
        />
      }
    />
  );
}

function SearchState({
  search,
  use,
}: {
  readonly search: ReturnType<typeof useRadioSearch>;
  readonly use: SoundUse;
}): ReactNode {
  if (search.query === null) {
    return (
      <EmptyState
        icon="radio"
        title={SOUND_COPY[use].radioTitle}
        body={SOUND_COPY[use].radioBody}
        compact
      />
    );
  }
  if (search.failed) {
    return (
      <EmptyState
        icon="warning"
        title="The radio directory did not answer"
        body="Try again in a moment."
        compact
      />
    );
  }
  if (search.stations === undefined) {
    return (
      <ActivityIndicator
        accessibilityLabel="Searching stations"
        className="py-8"
        colorClassName="accent-primary"
      />
    );
  }
  return (
    <EmptyState
      icon="search"
      title={`No station called ${search.query}`}
      body="Try a shorter name."
      compact
    />
  );
}

function Stations({
  stations,
  sound,
  onPick,
}: SoundTabProps & { readonly stations: readonly PlannerRadioResult[] }): ReactNode {
  const preview = useRadioPreview();
  return (
    <List>
      {stations.map((station) => {
        const candidate = radioSound(station);
        return (
          <StationRow
            key={station.station_id}
            station={station}
            chosen={isChosen(sound, candidate)}
            preview={preview}
            onPick={() => {
              onPick(candidate);
            }}
          />
        );
      })}
    </List>
  );
}

function Results({
  search,
  ...props
}: SoundTabProps & { readonly search: ReturnType<typeof useRadioSearch> }): ReactNode {
  const stations = search.stations;
  if (search.query === null || search.failed || stations === undefined || stations.length === 0) {
    return <SearchState search={search} use={props.use} />;
  }
  return <Stations {...props} stations={stations} />;
}

export function RadioTab(props: SoundTabProps): ReactNode {
  const [text, setText] = useState('');
  const search = useRadioSearch(text);
  return (
    <View className="gap-3">
      <SearchField value={text} onChange={setText} placeholder="Search stations" variant="field" />
      <Results {...props} search={search} />
      <Text variant="caption" tone="faint">
        Stations come from the Radio Browser directory.
      </Text>
    </View>
  );
}
