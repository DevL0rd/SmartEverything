import type { ReactNode } from 'react';
import type { DiscordCall } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Text } from '../../components/text';
import { WidgetFrame, WidgetEmpty, type WidgetDefinition } from '../../components/widget-board';
import { useIdiom } from '../../design/platform';
import { TYPE_SCALE } from '../../design/tokens';
import { FitList, PLUGIN_WIDGET_SIZES } from '../shared/plugin-widget';
import { DISCORD_PLUGIN, useDiscordStatus } from './discord-data';
import { CallLine, NO_CALL_HINT } from './call-rows';

const CALL_GAP = 8;

function Line({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {text}
    </Text>
  );
}

function Calls({ calls }: { readonly calls: readonly DiscordCall[] }): ReactNode {
  const type = TYPE_SCALE[useIdiom()];
  return (
    <FitList
      items={calls}
      keyOf={(call) => call.id}
      estimate={type['title-3'][1] + type.footnote[1]}
      gap={CALL_GAP}
    >
      {(call) => <CallLine call={call} />}
    </FitList>
  );
}

function CallWidget(): ReactNode {
  const stream = useDiscordStatus();
  const calls = stream.state === 'ready' ? stream.value.calls : [];
  return (
    <WidgetFrame
      title="Discord call"
      icon="mic"
      accent="primary"
      href={href.pluginSettings(DISCORD_PLUGIN)}
    >
      {stream.state !== 'ready' ? (
        <Line
          text={stream.state === 'waiting' ? 'Waiting for Discord…' : 'Discord could not be read.'}
        />
      ) : calls.length === 0 ? (
        <WidgetEmpty icon="mic" colour="primary" title="Not in a call" body={NO_CALL_HINT} />
      ) : (
        <Calls calls={calls} />
      )}
    </WidgetFrame>
  );
}

export const DISCORD_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'discord-call',
    title: 'Discord call',
    icon: 'mic',
    group: 'Assistant',
    sizes: PLUGIN_WIDGET_SIZES,
    defaultSize: 'M',
    render: () => <CallWidget />,
  },
];
