import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { Sparkline } from '../../components/charts';
import { StatTile } from '../../components/stat-tile';
import { Text } from '../../components/text';
import { errorText } from '../../format/errors';
import { stressLevel, useWatchToday } from './watch-days';

export function WatchToday(): ReactNode {
  const today = useWatchToday();
  if (today.kind === 'loading') {
    return null;
  }
  if (today.kind === 'failed') {
    return (
      <Card title="Today from the watch" icon="watch">
        <Text variant="callout" tone="critical">
          {errorText(today.error).title}
        </Text>
      </Card>
    );
  }
  const { stress, vitality } = today;
  if (stress.latest === null && vitality.latest === null) {
    return null;
  }
  return (
    <Card title="Today from the watch" icon="watch">
      <View className="gap-3">
        <View className="flex-row gap-3">
          {stress.latest === null ? null : (
            <StatTile
              label="Stress"
              value={String(stress.latest)}
              caption={stressLevel(stress.latest)}
            />
          )}
          {stress.average === null ? null : (
            <StatTile
              label="Stress average"
              value={String(stress.average)}
              caption={`Peak ${String(stress.maximum)}`}
            />
          )}
          {vitality.latest === null ? null : (
            <StatTile label="Vitality" value={String(vitality.latest)} caption="Today" />
          )}
        </View>
        {stress.points.length < 2 ? null : (
          <Sparkline points={stress.points} colour="viz-3" height={56} area />
        )}
      </View>
    </Card>
  );
}
