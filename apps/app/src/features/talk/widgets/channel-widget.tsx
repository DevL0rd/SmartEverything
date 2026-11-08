import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import type { TalkChannelRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  widgetBodyHeight,
  WidgetEmpty,
  WidgetFrame,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useIsOwner } from '../../../store/selectors';
import { TalkButton } from '../components/talk-button';
import { useChannelActivity, type ChannelActivity } from '../data/channel-activity';
import { useMyChannels, useTalkChannel, useTalkChannels } from '../data/talk-data';
import { useTalkEngine } from '../engine/engine-state';
import { channelLayout, type ChannelLayout } from './layout';
import { MemberStrip } from './member-strip';
import { RecentMessages } from './recent-messages';
import { EVERY_SIZE } from './sizes';

const CHANNEL_OPTIONS = z.object({ channelId: z.string().min(1) });

type ChannelOptions = z.infer<typeof CHANNEL_OPTIONS>;

function ChannelPicker({
  value,
  onChange,
}: {
  readonly value: ChannelOptions;
  readonly onChange: (value: ChannelOptions) => void;
}): ReactNode {
  const channels = useTalkChannels();
  return (
    <Select
      label="Channel"
      options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
      value={value.channelId}
      onChange={(channelId) => {
        onChange({ channelId });
      }}
    />
  );
}

function useGlow(channelId: string): 'critical' | 'primary' | null {
  const engine = useTalkEngine();
  if (engine.transmit.status === 'talking' && engine.transmit.channelId === channelId) {
    return 'critical';
  }
  return engine.receive?.channelId === channelId ? 'primary' : null;
}

function ChannelOverview({
  channel,
  activity,
  layout,
}: {
  readonly channel: TalkChannelRow;
  readonly activity: ChannelActivity;
  readonly layout: ChannelLayout;
}): ReactNode {
  return (
    <View className={cn('min-w-0 gap-1', layout.inline && 'flex-1')}>
      <Text
        variant="callout"
        tone={activity.live ? 'primary' : 'variant'}
        numberOfLines={layout.activityLines}
      >
        {activity.line}
      </Text>
      {layout.members ? <MemberStrip channelId={channel.id} width={layout.memberWidth} /> : null}
    </View>
  );
}

function ChannelBody({
  channel,
  size,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const { frame, sizes } = useWidgetFace();
  const activity = useChannelActivity(channel.id);
  const layout = channelLayout(
    size,
    { width: frame.width, height: widgetBodyHeight(frame), idiom: frame.idiom },
    sizes.touchMin,
    activity.hasMessages,
  );
  return (
    <View className={layout.inline ? 'flex-row items-start gap-3' : 'gap-3'}>
      <ChannelOverview channel={channel} activity={activity} layout={layout} />
      {layout.messages === 0 ? null : (
        <RecentMessages
          channelId={channel.id}
          limit={layout.messages}
          editing={editing}
          inline={layout.inline}
        />
      )}
    </View>
  );
}

function NoChannel(): ReactNode {
  const owner = useIsOwner();
  const none = useMyChannels().length === 0;
  return (
    <WidgetFrame title="Walkie-talkie" icon="radio" accent="primary">
      <WidgetEmpty
        icon="radio"
        colour="primary"
        title={none ? 'No channels yet' : 'Choose a channel'}
        body={none ? 'Talk to the whole home with one button.' : 'Edit the layout to pick one.'}
        {...(none && owner
          ? { action: { label: 'Create', href: href.settings.talkChannel('new') } }
          : {})}
      />
    </WidgetFrame>
  );
}

function ChannelWidget({
  channelId,
  size,
  editing,
}: {
  readonly channelId: string;
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const channel = useTalkChannel(channelId);
  const glow = useGlow(channelId);
  if (channel === null) {
    return <NoChannel />;
  }
  return (
    <WidgetFrame
      title={channel.name}
      icon={channel.icon}
      accent="primary"
      glow={glow}
      href={href.talkChannel(channel.id)}
      actions={<TalkButton channelId={channel.id} size="row" editing={editing} />}
    >
      <ChannelBody channel={channel} size={size} editing={editing} />
    </WidgetFrame>
  );
}

function FirstChannel({
  size,
  editing,
}: {
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const first = useMyChannels()[0];
  return first === undefined ? (
    <NoChannel />
  ) : (
    <ChannelWidget channelId={first.id} size={size} editing={editing} />
  );
}

export const CHANNEL_WIDGET: WidgetDefinition = {
  type: 'talk-channel',
  title: 'Walkie-talkie channel',
  icon: 'radio',
  group: 'Walkie-talkie',
  sizes: EVERY_SIZE,
  defaultSize: 'M',
  instanceOptions: {
    schema: CHANNEL_OPTIONS,
    editor: ({ value, onChange }) => {
      const parsed = CHANNEL_OPTIONS.safeParse(value);
      return (
        <ChannelPicker
          value={parsed.success ? parsed.data : { channelId: '' }}
          onChange={onChange}
        />
      );
    },
  },
  render: ({ size, options, editing }) => {
    const parsed = CHANNEL_OPTIONS.safeParse(options);
    return parsed.success ? (
      <ChannelWidget channelId={parsed.data.channelId} size={size} editing={editing} />
    ) : (
      <FirstChannel size={size} editing={editing} />
    );
  },
};
