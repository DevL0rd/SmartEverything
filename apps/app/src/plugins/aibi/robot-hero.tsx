import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Card } from '../../components/card';
import { Text } from '../../components/text';
import { DeviceVisual } from '../../features/device-visuals';
import { WideFigure } from '../../features/devices';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import type { Device } from '../../store/state';
import { ServiceHeroSkeleton } from '../shared/service-hero';
import { useRobotLive, type RobotLive } from './use-robot-card';

function statusWords(live: RobotLive): string | null {
  const { status, view } = live;
  if (view.problem) {
    return null;
  }
  const local = status.server.state === 'running' && status.mode === 'local';
  return joinParts([view.words, local ? 'Local server running' : null]);
}

function Figures({ live }: { readonly live: RobotLive }): ReactNode {
  const { status, day, view } = live;
  return (
    <View className="flex-row flex-wrap items-end justify-center gap-x-8 gap-y-2">
      <WideFigure
        value={String(day.talks)}
        unit={day.talks === 1 ? 'time' : 'times'}
        caption="Talked to today"
        stale={view.asleep}
      />
      {status.contact === null ? null : (
        <WideFigure value={clock(status.contact.at)} caption="Last seen" stale={view.asleep} />
      )}
    </View>
  );
}

export function RobotHero({ device }: { readonly device: Device }): ReactNode {
  const live = useRobotLive(device);
  if (live === null) {
    return <ServiceHeroSkeleton />;
  }
  const { view, state } = live;
  const words = statusWords(live);
  return (
    <Card>
      <View className="items-center gap-4 py-2">
        <DeviceVisual device={device} state={state} size="hero" />
        <View className="items-center gap-1.5">
          <View accessibilityLiveRegion="polite">
            <Badge label={view.chip.label} tone={view.chip.tone} />
          </View>
          {words === null ? null : (
            <Text variant="callout" tone="variant" align="center">
              {words}
            </Text>
          )}
        </View>
        <Figures live={live} />
      </View>
    </Card>
  );
}
