import type { SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { joinParts } from '../../format/text';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { StreamProblem } from '../shared/plugin-notice';
import {
  activityTitle,
  folderLabel,
  peerName,
  useSyncActivity,
  useSyncthingSnapshot,
} from './syncthing-data';

const PAGE = 50;

function NoActivity(): ReactNode {
  return (
    <EmptyState
      icon="activity"
      title="No activity yet"
      body="File changes show up here as they happen."
    />
  );
}

function ActivityRow({
  entry,
  known,
  now,
}: {
  readonly entry: SyncActivity;
  readonly known: SyncthingSnapshot | null;
  readonly now: number;
}): ReactNode {
  return (
    <ListRow
      title={activityTitle(entry, known)}
      subtitle={joinParts([
        moment(entry.at, now),
        entry.path === null ? null : folderLabel(known, entry.folderId),
        entry.remote ? `from ${peerName(known, entry.deviceId) ?? 'another device'}` : null,
      ])}
      icon={entry.kind === 'error' ? 'warning' : 'fileText'}
      iconTone={entry.kind === 'error' ? 'critical' : 'variant'}
    />
  );
}

export function SyncActivitySection(): ReactNode {
  const activity = useSyncActivity();
  const snapshot = useSyncthingSnapshot();
  const now = useMinute();
  const [shown, setShown] = useState(PAGE);
  const known = snapshot.state === 'ready' ? snapshot.value : null;
  if (activity.state === 'invalid') {
    return <StreamProblem reason={activity.reason} />;
  }
  if (activity.state === 'waiting') {
    return known === null ? <Skeleton shape="block" /> : <NoActivity />;
  }
  const entries = activity.value.slice(0, shown);
  return (
    <View className="gap-section-gap">
      {entries.length === 0 ? (
        <NoActivity />
      ) : (
        <List title="Latest">
          {entries.map((entry) => (
            <ActivityRow
              key={`${String(entry.id)}:${entry.kind}`}
              entry={entry}
              known={known}
              now={now}
            />
          ))}
          {activity.value.length > shown ? (
            <ListRow
              title={`Show ${String(Math.min(PAGE, activity.value.length - shown))} more`}
              icon="chevronDown"
              onPress={() => {
                setShown(shown + PAGE);
              }}
            />
          ) : null}
        </List>
      )}
    </View>
  );
}
