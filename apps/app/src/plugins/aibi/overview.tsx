import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PageWidget } from '../shared/page-widget';
import { PluginNotice } from '../shared/plugin-notice';
import { ConversationWidget, MovesWidget, StatusWidget } from './aibi-widgets';
import { robotNotice, useRobotMoves, useRobotStatus } from './aibi-data';

export function RobotOverview(): ReactNode {
  const status = useRobotStatus();
  const moves = useRobotMoves();
  if (status.state !== 'ready') {
    return null;
  }
  const noMoves = moves.state === 'ready' && moves.value.actions.length === 0;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="aibi" notice={robotNotice(status.value)} />
      <PageWidget size="M">
        <StatusWidget size="M" showOnline={false} />
      </PageWidget>
      <PageWidget size="L">
        <ConversationWidget size="L" />
      </PageWidget>
      {noMoves ? null : (
        <PageWidget size="M">
          <MovesWidget size="M" />
        </PageWidget>
      )}
    </View>
  );
}
