import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import type { TalkChannelRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { useIsOwner } from '../../../store/selectors';
import { TalkButton } from '../components/talk-button';
import { useChannelActivity } from '../data/channel-activity';
import { useMyChannels, useTalkChannel, useTalkChannels } from '../data/talk-data';
import { useTalkEngine } from '../engine/engine-state';
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

function Small({
  channel,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly editing: boolean;
}): ReactNode {
  const activity = useChannelActivity(channel.id);
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <TalkButton channelId={channel.id} size="compact" editing={editing} />
      <Text variant="footnote" tone={activity.live ? 'primary' : 'variant'} numberOfLines={1}>
        {activity.line}
      </Text>
    </View>
  );
}

function Medium({
  channel,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly editing: boolean;
}): ReactNode {
  const activity = useChannelActivity(channel.id);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <TalkButton channelId={channel.id} size="compact" editing={editing} />
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="callout" tone={activity.live ? 'primary' : 'variant'} numberOfLines={2}>
          {activity.line}
        </Text>
        <MemberStrip channelId={channel.id} />
      </View>
    </View>
  );
}

function Large({
  channel,
  editing,
}: {
  readonly channel: TalkChannelRow;
  readonly editing: boolean;
}): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <Medium channel={channel} editing={editing} />
      <RecentMessages channelId={channel.id} limit={3} editing={editing} />
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
  if (size === 'S') {
    return <Small channel={channel} editing={editing} />;
  }
  return size === 'M' ? (
    <Medium channel={channel} editing={editing} />
  ) : (
    <Large channel={channel} editing={editing} />
  );
}

function NoChannel({ size }: { readonly size: WidgetSize }): ReactNode {
  const owner = useIsOwner();
  const none = useMyChannels().length === 0;
  return (
    <WidgetFrame title="Walkie-talkie" icon="radio" accent="primary" size={size}>
      <WidgetEmpty
        icon="radio"
        colour="primary"
        title={none ? 'No channels yet' : 'Choose a channel'}
        body={none ? 'Talk to the whole home with one button.' : 'Edit the layout to pick one.'}
        size={size}
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
    return <NoChannel size={size} />;
  }
  return (
    <WidgetFrame
      title={channel.name}
      icon={channel.icon}
      accent="primary"
      glow={glow}
      size={size}
      href={href.talkChannel(channel.id)}
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
    <NoChannel size={size} />
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
