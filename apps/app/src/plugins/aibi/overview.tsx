import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import type { Device } from '../../store/state';
import { PageWidget } from '../shared/page-widget';
import { ServiceNotice } from '../shared/plugin-notice';
import { ActivityLegend, ActivityStrip } from './activity-strip';
import { ConversationWidget } from './aibi-widgets';
import { robotNotice } from './aibi-data';
import { MovesGrid } from './moves-grid';
import { useRobotLive } from './use-robot-card';

const STRIP_HEIGHT = 22;

export function RobotOverview({ device }: { readonly device: Device }): ReactNode {
  usePluginScreen('aibi', 'RobotOverview');
  const live = useRobotLive(device);
  if (live === null) {
    return null;
  }
  const { status, moves, day, view } = live;
  return (
    <View className="gap-section-gap">
      <ServiceNotice pluginId="aibi" notice={robotNotice(status)} />
      {moves === null || moves.actions.length === 0 || view.problem ? null : (
        <MovesGrid device={device} moves={moves} status={status} asleep={view.asleep} />
      )}
      <Card title="Recent activity" icon="activity">
        <ActivityStrip day={day} height={STRIP_HEIGHT} captions />
        <ActivityLegend />
      </Card>
      <PageWidget size="XL">
        <ConversationWidget size="XL" />
      </PageWidget>
    </View>
  );
}
