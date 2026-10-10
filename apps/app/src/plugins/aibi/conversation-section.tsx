import type { RobotLine, RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { plural } from '../../format/text';
import { clock } from '../../format/time';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { robotNotice, useRobotStatus } from './aibi-data';
import { LINE_WHO, conversationText } from './aibi-text';

const LINE_ICON = { user: 'mic', aibi: 'speaker', note: 'move' } as const;

function Now({ status }: { readonly status: RobotStatus }): ReactNode {
  return (
    <Card title="Now" icon="messageCircle">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={conversationText(status)}
          tone={status.conversation ? 'positive' : 'neutral'}
        />
        {status.waiting === 0 ? null : (
          <Badge label={`${plural(status.waiting, 'thing')} to tell`} tone="info" />
        )}
        {status.tasks === 0 ? null : (
          <Badge label={`${plural(status.tasks, 'task')} running`} tone="primary" />
        )}
      </View>
    </Card>
  );
}

function Line({ line }: { readonly line: RobotLine }): ReactNode {
  return (
    <ListRow
      icon={LINE_ICON[line.who]}
      iconTone={line.who === 'user' ? 'primary' : 'variant'}
      title={line.text}
      subtitle={`${LINE_WHO[line.who]} · ${clock(line.at)}`}
    />
  );
}

export function ConversationSection(): ReactNode {
  const stream = useRobotStatus();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const status = stream.value;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="aibi" notice={robotNotice(status)} />
      <Now status={status} />
      {status.lines.length === 0 ? (
        <EmptyState
          icon="messageCircle"
          title="Nothing said yet"
          body="Say AIBI’s wake word and talk to it; the last lines appear here."
        />
      ) : (
        <List title="Last conversation" footer="The whole conversation is in your chats.">
          {status.lines.map((line) => (
            <Line key={`${line.at}:${line.who}:${line.text}`} line={line} />
          ))}
        </List>
      )}
    </View>
  );
}
