import { usePluginScreen } from '../shared/plugin-log';
import type { SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../components/empty-state';
import { FilterChip } from '../../components/filter-chip';
import { HScroller } from '../../components/h-scroller';
import type { IconName } from '../../components/icon';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Select, type SelectOption } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { useMinute } from '../../store/clock';
import { StreamProblem } from '../shared/plugin-notice';
import { ActivityRow } from './widgets/activity-row';
import {
  ACTIVITY_FILTERS,
  ACTIVITY_FILTER_LABEL,
  ACTIVITY_PAGE,
  ALL_FOLDERS,
  activityMatches,
  filterCounts,
  groupByDay,
  type ActivityFilter,
} from './widgets/activity-model';
import { useSyncActivity, useSyncthingSnapshot } from './syncthing-data';

const FILTER_ICON: Readonly<Record<ActivityFilter, IconName>> = {
  all: 'list',
  files: 'fileText',
  devices: 'monitor',
  errors: 'warning',
};

function NoActivity({ filtered }: { readonly filtered: boolean }): ReactNode {
  return filtered ? (
    <EmptyState icon="activity" title="Nothing matches" body="Try another filter." />
  ) : (
    <EmptyState
      icon="activity"
      title="No activity yet"
      body="File changes show up here as they happen."
    />
  );
}

function folderOptions(known: SyncthingSnapshot | null): readonly SelectOption<string>[] {
  return [
    { value: ALL_FOLDERS, label: 'All folders' },
    ...(known?.folders.map((folder) => ({ value: folder.id, label: folder.label })) ?? []),
  ];
}

function Controls({
  entries,
  known,
  filter,
  folderId,
  onFilter,
  onFolder,
}: {
  readonly entries: readonly SyncActivity[];
  readonly known: SyncthingSnapshot | null;
  readonly filter: ActivityFilter;
  readonly folderId: string;
  readonly onFilter: (filter: ActivityFilter) => void;
  readonly onFolder: (folderId: string) => void;
}): ReactNode {
  const counts = filterCounts(entries, folderId);
  return (
    <View className="gap-3">
      <HScroller label="Filter activity" fade>
        {ACTIVITY_FILTERS.map((value) => (
          <FilterChip
            key={value}
            label="Show"
            value={ACTIVITY_FILTER_LABEL[value]}
            icon={FILTER_ICON[value]}
            count={counts[value]}
            active={filter === value}
            onPress={() => {
              onFilter(value);
            }}
          />
        ))}
      </HScroller>
      {known !== null && known.folders.length > 1 ? (
        <Select
          label="Folder"
          showLabel={false}
          options={folderOptions(known)}
          value={folderId}
          onChange={onFolder}
        />
      ) : null}
    </View>
  );
}

function Days({
  entries,
  known,
  shown,
  onMore,
}: {
  readonly entries: readonly SyncActivity[];
  readonly known: SyncthingSnapshot | null;
  readonly shown: number;
  readonly onMore: () => void;
}): ReactNode {
  const now = useMinute();
  return (
    <>
      {groupByDay(entries.slice(0, shown), now).map((day) => (
        <List key={day.key} title={day.label}>
          {day.entries.map((entry) => (
            <ActivityRow key={`${String(entry.id)}:${entry.kind}`} entry={entry} known={known} />
          ))}
        </List>
      ))}
      {entries.length > shown ? (
        <List>
          <ListRow
            title={`Show ${String(Math.min(ACTIVITY_PAGE, entries.length - shown))} more`}
            icon="chevronDown"
            onPress={onMore}
          />
        </List>
      ) : null}
    </>
  );
}

export function SyncActivitySection(): ReactNode {
  usePluginScreen('syncthing', 'SyncActivitySection');
  const activity = useSyncActivity();
  const snapshot = useSyncthingSnapshot();
  const [shown, setShown] = useState(ACTIVITY_PAGE);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [folderId, setFolderId] = useState(ALL_FOLDERS);
  const known = snapshot.state === 'ready' ? snapshot.value : null;
  if (activity.state === 'invalid') {
    return <StreamProblem reason={activity.reason} />;
  }
  if (activity.state === 'waiting') {
    return known === null ? <Skeleton shape="block" /> : <NoActivity filtered={false} />;
  }
  if (activity.value.length === 0) {
    return <NoActivity filtered={false} />;
  }
  const matching = activity.value.filter((entry) => activityMatches(entry, filter, folderId));
  return (
    <View className="gap-section-gap">
      <Controls
        entries={activity.value}
        known={known}
        filter={filter}
        folderId={folderId}
        onFilter={setFilter}
        onFolder={setFolderId}
      />
      {matching.length === 0 ? (
        <NoActivity filtered />
      ) : (
        <Days
          entries={matching}
          known={known}
          shown={shown}
          onMore={() => {
            setShown(shown + ACTIVITY_PAGE);
          }}
        />
      )}
    </View>
  );
}
