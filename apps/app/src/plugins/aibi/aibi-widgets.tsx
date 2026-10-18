import type { RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { WidgetDefinition, WidgetSize } from '../../components/widget-board';
import { PluginWidgetFrame, PLUGIN_WIDGET_SIZES } from '../shared/plugin-widget';
import { usePluginDevice } from '../shared/use-plugin-device';
import { ConversationBody, QuickMoves, StatusBody } from './aibi-bodies';
import { robotProblem, useRobotMoves, useRobotStatus } from './aibi-data';

function unavailable(status: RobotStatus): string | null {
  const problem = robotProblem(status);
  if (problem !== null) {
    return problem.title;
  }
  return status.contact === null ? 'Waiting for AIBI…' : null;
}

function StatusWidget({
  size,
  showOnline = true,
}: {
  readonly size: WidgetSize;
  readonly showOnline?: boolean;
}): ReactNode {
  const device = usePluginDevice('robot');
  return (
    <PluginWidgetFrame
      title="AIBI"
      icon="bot"
      accent="primary"
      size={size}
      device={device}
      stream={useRobotStatus()}
      unavailable={unavailable}
    >
      {(status) => <StatusBody status={status} device={device} showOnline={showOnline} />}
    </PluginWidgetFrame>
  );
}

export function ConversationWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <PluginWidgetFrame
      title="AIBI conversation"
      icon="messageCircle"
      accent="positive"
      size={size}
      device={usePluginDevice('robot')}
      stream={useRobotStatus()}
      unavailable={() => null}
    >
      {(status) => <ConversationBody status={status} size={size} />}
    </PluginWidgetFrame>
  );
}

function MovesWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const device = usePluginDevice('robot');
  return (
    <PluginWidgetFrame
      title="AIBI moves"
      icon="move"
      accent="info"
      size={size}
      device={device}
      stream={useRobotMoves()}
      unavailable={() => (device === null ? 'Waiting for AIBI…' : null)}
    >
      {(moves) =>
        device === null ? null : <QuickMoves moves={moves} size={size} device={device} />
      }
    </PluginWidgetFrame>
  );
}

export const AIBI_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'aibi-status',
    title: 'AIBI',
    icon: 'bot',
    group: 'Devices',
    sizes: PLUGIN_WIDGET_SIZES,
    defaultSize: 'M',
    render: ({ size }) => <StatusWidget size={size} />,
  },
  {
    type: 'aibi-conversation',
    title: 'AIBI conversation',
    icon: 'messageCircle',
    group: 'Devices',
    sizes: PLUGIN_WIDGET_SIZES,
    defaultSize: 'M',
    render: ({ size }) => <ConversationWidget size={size} />,
  },
  {
    type: 'aibi-moves',
    title: 'AIBI moves',
    icon: 'move',
    group: 'Devices',
    sizes: PLUGIN_WIDGET_SIZES,
    defaultSize: 'M',
    render: ({ size }) => <MovesWidget size={size} />,
  },
];
