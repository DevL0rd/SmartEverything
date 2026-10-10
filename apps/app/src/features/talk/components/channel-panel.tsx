import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TalkChannelRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useLocalPref } from '../../../store/local-prefs';
import { useSession } from '../../../store/selectors';
import { chooseTalkChannel, useTalkChannelId } from '../data/talk-channel';
import { useChannelActivity } from '../data/channel-activity';
import { useOwnMembership } from '../data/talk-data';
import { joinChannel } from './channel-card';
import { DeviceStatus } from './device-status';
import { MemberList } from './member-list';
import { MessageList } from './message-list';
import { TalkButton } from './talk-button';

function Notice({ channel }: { readonly channel: TalkChannelRow }): ReactNode {
  const enabled = useLocalPref('talkEnabled');
  const member = useOwnMembership(channel.id) !== null;
  const clientId = useSession().client.id;
  if (!member) {
    return (
      <Banner
        tone="info"
        title="You’re not in this channel"
        body="Join to hear it and talk."
        action={{
          label: 'Join',
          onPress: () => {
            joinChannel(channel.id, clientId);
          },
        }}
      />
    );
  }
  if (!enabled) {
    return <DeviceStatus />;
  }
  return null;
}

function TalkChannelChoice({ channelId }: { readonly channelId: string }): ReactNode {
  const current = useTalkChannelId();
  const member = useOwnMembership(channelId) !== null;
  if (!member || current === channelId) {
    return null;
  }
  return (
    <Button
      label="Use for shortcuts and notifications"
      variant="text"
      onPress={() => {
        chooseTalkChannel(channelId);
      }}
    />
  );
}

function Hero({ channel }: { readonly channel: TalkChannelRow }): ReactNode {
  const activity = useChannelActivity(channel.id);
  return (
    <View className="items-center gap-4 rounded-xl bg-surface-1 px-card-pad py-section-gap elevation-1">
      <View className="flex-row items-center gap-2">
        <Text variant="footnote" tone={activity.live ? 'primary' : 'variant'} numberOfLines={1}>
          {activity.line}
        </Text>
        {channel.priority === 'urgent' ? <Badge label="Priority" tone="warning" /> : null}
      </View>
      <TalkButton channelId={channel.id} size="hero" />
      <TalkChannelChoice channelId={channel.id} />
    </View>
  );
}

export function ChannelPanel({ channel }: { readonly channel: TalkChannelRow }): ReactNode {
  return (
    <View className="gap-section-gap">
      <Notice channel={channel} />
      <Hero channel={channel} />
      <MemberList channelId={channel.id} />
      <MessageList channelId={channel.id} />
    </View>
  );
}
