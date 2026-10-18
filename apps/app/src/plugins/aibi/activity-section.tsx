import { usePluginScreen } from '../shared/plugin-log';
import type { RobotActivityEntry } from '@smarteverything/domain';
import { useMemo, type ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Card } from '../../components/card';
import { joinParts, plural } from '../../format/text';
import { clock } from '../../format/time';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { ActivityLegend, ActivityStrip } from './activity-strip';
import { robotDay } from './activity-timeline';
import { ACTIVITY_LOOK, useRobotActivity } from './aibi-data';

const STRIP_HEIGHT = 22;

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

function Timeline({
  entries,
  at,
}: {
  readonly entries: readonly RobotActivityEntry[];
  readonly at: string;
}): ReactNode {
  const day = useMemo(() => robotDay(entries, Date.parse(at)), [entries, at]);
  return (
    <Card title="Last 24 hours" icon="activity">
      <ActivityStrip day={day} height={STRIP_HEIGHT} captions />
      <ActivityLegend />
    </Card>
  );
}

export function ActivitySection(): ReactNode {
  usePluginScreen('aibi', 'ActivitySection');
  const stream = useRobotActivity();
  return (
    <PluginStreamSection stream={stream} pluginId="aibi">
      {({ entries }) =>
        entries.length === 0 ? (
          <EmptyState
            icon="activity"
            title="Nothing yet"
            body="What AIBI hears, says and does, and what it asks this server, is listed here."
          />
        ) : (
          <>
            {stream.state === 'ready' ? <Timeline entries={entries} at={stream.at} /> : null}
            <List
              title="Newest first"
              footer={`The last ${plural(entries.length, 'entry', 'entries')}.`}
            >
              {[...entries].reverse().map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </List>
          </>
        )
      }
    </PluginStreamSection>
  );
}
