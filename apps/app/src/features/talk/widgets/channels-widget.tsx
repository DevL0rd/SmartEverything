import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, type WidgetDefinition } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { TalkChannelRow } from '@smarteverything/domain';
import { TalkButton } from '../components/talk-button';
import { useChannelActivity } from '../data/channel-activity';
import { useMyChannels } from '../data/talk-data';
import { useTalkEngine } from '../engine/engine-state';
import { FitList } from '../../../plugins/shared/plugin-widget';
import { CHANNEL_ROW, CHANNELS_GAP, channelGrid, gridRows } from './layout';
import { EVERY_SIZE } from './sizes';

function ChannelLine({
  channel,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly editing: boolean;
}): ReactNode {
  const activity = useChannelActivity(channel.id);
  return (
    <View className="flex-row items-center gap-1.5 rounded-md bg-surface-2 px-1.5">
      <Interactive
        href={href.talkChannel(channel.id)}
        label={`${channel.name}, ${activity.line}`}
        disabled={editing}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-1.5 rounded-sm"
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

function ChannelGrid({
  channels,
  editing,
}: {
  readonly channels: readonly TalkChannelRow[];
  readonly editing: boolean;
}): ReactNode {
  const { frame } = useWidgetFace();
  const grid = channelGrid(frame.width, frame.idiom, channels.length);
  const cell = { flexBasis: grid.itemWidth };
  return (
    <FitList
      items={gridRows(channels, grid.columns)}
      keyOf={(row) => row.map((channel) => channel.id).join()}
      estimate={CHANNEL_ROW}
      gap={CHANNELS_GAP}
    >
      {(row) => (
        <View className="flex-row gap-2">
          {row.map((channel) => (
            <View key={channel.id} className="min-w-0 grow" style={cell}>
              <ChannelLine channel={channel} editing={editing} />
            </View>
          ))}
        </View>
      )}
    </FitList>
  );
}

function ChannelsWidget({ editing }: { readonly editing: boolean }): ReactNode {
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
        <ChannelGrid channels={channels} editing={editing} />
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
  render: ({ editing }) => <ChannelsWidget editing={editing} />,
};
