import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Badge } from '../../components/badge';
import { Text } from '../../components/text';
import {
  WidgetFrame,
  WidgetEmpty,
  type BoardClass,
  type WidgetDefinition,
  type WidgetSize,
} from '../../components/widget-board';
import { DISCORD_PLUGIN, useDiscordStatus } from './discord-data';
import { NO_CALL_HINT, callDetail, callState, callTitle } from './call-rows';

const SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['S', 'M', 'L'],
  medium: ['S', 'M', 'L'],
  expanded: ['S', 'M', 'W', 'L'],
};

const SHOWN: Readonly<Record<WidgetSize, number>> = { S: 1, M: 2, W: 2, L: 4, XL: 6 };

function Line({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {text}
    </Text>
  );
}

function CallWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const stream = useDiscordStatus();
  const calls = stream.state === 'ready' ? stream.value.calls : [];
  return (
    <WidgetFrame
      title="Discord call"
      icon="mic"
      accent="primary"
      size={size}
      href={href.pluginSettings(DISCORD_PLUGIN)}
    >
      {stream.state !== 'ready' ? (
        <Line
          text={stream.state === 'waiting' ? 'Waiting for Discord…' : 'Discord could not be read.'}
        />
      ) : calls.length === 0 ? (
        <WidgetEmpty
          icon="mic"
          colour="primary"
          title="Not in a call"
          body={NO_CALL_HINT}
          size={size}
        />
      ) : (
        <View className="flex-1 justify-center gap-2">
          {calls.slice(0, SHOWN[size]).map((call) => {
            const state = callState(call);
            return (
              <View key={call.id} className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1">
                  <Text variant="title-3" numberOfLines={1}>
                    {callTitle(call)}
                  </Text>
                  <Text variant="footnote" tone="variant" numberOfLines={2}>
                    {callDetail(call)}
                  </Text>
                </View>
                <Badge label={state.label} tone={state.tone} />
              </View>
            );
          })}
        </View>
      )}
    </WidgetFrame>
  );
}

export const DISCORD_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'discord.call',
    title: 'Discord call',
    icon: 'mic',
    group: 'Assistant',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <CallWidget size={size} />,
  },
];
