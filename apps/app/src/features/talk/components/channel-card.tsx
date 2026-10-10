import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TalkChannelRow } from '@smarteverything/domain';
import { setTalkMember } from '../../../api/talk';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useLocalPref } from '../../../store/local-prefs';
import { useSession } from '../../../store/selectors';
import { useChannelActivity } from '../data/channel-activity';
import { useOwnMembership } from '../data/talk-data';
import { TalkButton } from './talk-button';

export function joinChannel(channelId: string, clientId: string): void {
  setTalkMember({ channelId, kind: 'client', memberId: clientId }, true).catch((error: unknown) => {
    notify({ message: 'Couldn’t join the channel', error, tone: 'critical' });
  });
}

function JoinButton({ channelId }: { readonly channelId: string }): ReactNode {
  const clientId = useSession().client.id;
  return (
    <Button
      label="Join"
      variant="tonal"
      onPress={() => {
        joinChannel(channelId, clientId);
      }}
    />
  );
}

export interface ChannelCardProps {
  readonly channel: TalkChannelRow;
  readonly selected: boolean;
  readonly onOpen: () => void;
}

export function ChannelCard({ channel, selected, onOpen }: ChannelCardProps): ReactNode {
  const activity = useChannelActivity(channel.id);
  const member = useOwnMembership(channel.id) !== null;
  const enabled = useLocalPref('talkEnabled');
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-lg border-hairline p-3 elevation-1',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <Interactive
        label={`${channel.name}, ${activity.line}`}
        onPress={onOpen}
        selected={selected}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 rounded-md"
        layerClassName="rounded-md"
      >
        <View className="size-12 items-center justify-center rounded-full bg-surface-3">
          <Icon name={channel.icon} size={24} tone={activity.live ? 'primary' : 'variant'} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text variant="body-strong" numberOfLines={1} className="shrink">
              {channel.name}
            </Text>
            {channel.priority === 'urgent' ? <Badge label="Priority" tone="warning" /> : null}
          </View>
          <Text variant="footnote" tone={activity.live ? 'primary' : 'variant'} numberOfLines={1}>
            {activity.line}
          </Text>
        </View>
      </Interactive>
      {member && enabled ? <TalkButton channelId={channel.id} size="compact" /> : null}
      {member ? null : <JoinButton channelId={channel.id} />}
    </View>
  );
}
