import type { RobotActivityEntry } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import { StreamProblem } from '../shared/plugin-notice';
import { ACTIVITY_LOOK, useRobotActivity } from './aibi-data';

function Entry({ entry }: { readonly entry: RobotActivityEntry }): ReactNode {
  const look = ACTIVITY_LOOK[entry.kind];
  return (
    <ListRow
      icon={look.icon}
      iconTone={look.tone}
      title={entry.title}
      subtitle={joinParts([clock(entry.at), entry.detail === '' ? null : entry.detail])}
    />
  );
}

export function ActivitySection(): ReactNode {
  const stream = useRobotActivity();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const entries = [...stream.value.entries].reverse();
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="Nothing yet"
        body="What AIBI hears, says and does, and what it asks this server, is listed here."
      />
    );
  }
  return (
    <List title="Newest first" footer="The last 30 entries; the plugin keeps 500.">
      {entries.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </List>
  );
}
