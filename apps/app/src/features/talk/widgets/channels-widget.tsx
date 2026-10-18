import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import type { TalkChannelRow } from '@smarteverything/domain';
import { TalkButton } from '../components/talk-button';
import { useChannelActivity } from '../data/channel-activity';
import { useMyChannels } from '../data/talk-data';
import { useTalkEngine } from '../engine/engine-state';
import { EVERY_SIZE } from './sizes';

const ROWS: Readonly<Record<WidgetSize, number>> = { M: 2, W: 2, XL: 6 };

function ChannelLine({
  channel,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly editing: boolean;
}): ReactNode {
  const activity = useChannelActivity(channel.id);
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-2">
      <Interactive
        href={href.talkChannel(channel.id)}
        label={`${channel.name}, ${activity.line}`}
        disabled={editing}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 rounded-sm"
        layerClassName="rounded-sm"
      >
        <Icon name={channel.icon} size={20} tone={activity.live ? 'primary' : 'variant'} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {channel.name}
          </Text>
          <Text variant="caption" tone={activity.live ? 'primary' : 'variant'} numberOfLines={1}>
            {activity.line}
          </Text>
        </View>
      </Interactive>
      <TalkButton channelId={channel.id} size="row" editing={editing} />
    </View>
  );
}

function ChannelsWidget({
  size,
  editing,
}: {
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const channels = useMyChannels();
  const engine = useTalkEngine();
  const glow =
    engine.transmit.status === 'talking' ? 'critical' : engine.receive === null ? null : 'primary';
  return (
    <WidgetFrame title="My channels" icon="radio" accent="primary" glow={glow} href={href.talk()}>
      {channels.length === 0 ? (
        <WidgetEmpty
          icon="radio"
          colour="primary"
          title="No channels yet"
          body="Join a channel to talk from here."
          action={{ label: 'Open', href: href.talk() }}
        />
      ) : (
        <View className={size === 'W' ? 'flex-row flex-wrap gap-2' : 'gap-2'}>
          {channels.slice(0, ROWS[size]).map((channel) => (
            <View key={channel.id} className={size === 'W' ? 'min-w-0 flex-1 basis-80' : 'w-full'}>
              <ChannelLine channel={channel} editing={editing} />
            </View>
          ))}
        </View>
      )}
    </WidgetFrame>
  );
}

export const CHANNELS_WIDGET: WidgetDefinition = {
  type: 'talk-channels',
  title: 'My channels',
  icon: 'radio',
  group: 'Walkie-talkie',
  sizes: EVERY_SIZE,
  defaultSize: 'M',
  render: ({ size, editing }) => <ChannelsWidget size={size} editing={editing} />,
};
