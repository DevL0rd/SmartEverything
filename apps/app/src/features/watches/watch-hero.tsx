import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Grid } from '../../components/grid';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { DeviceVisual, useWatchVisualState } from '../device-visuals';
import { FactTile, canSync, factsOf } from './watch-facts';
import { useWatchGlance } from './watch-glance';
import { syncNow } from './watch-link';
import { StepsBlock, WeekSteps } from './watch-steps-block';

export function WatchHero({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const { glance, live } = useWatchGlance(device);
  const state = useWatchVisualState(device, live);
  const facts = factsOf(glance, now, true);
  return (
    <Card>
      <View className="gap-5">
        <View className="items-center">
          <DeviceVisual device={device} size="hero" state={state} />
        </View>
        <StepsBlock glance={glance} size="l" />
        <View className="h-28">
          <WeekSteps watch={device} glance={glance} />
        </View>
        <Grid minItemWidth={150} maxColumns={3}>
          {facts.map((item) => (
            <FactTile key={item.key} fact={item} />
          ))}
        </Grid>
        <View className="flex-row flex-wrap justify-center gap-3">
          {glance.onThisPhone ? (
            <Button
              label={glance.syncing ? 'Syncing…' : 'Sync now'}
              icon="refresh"
              variant="tonal"
              loading={glance.syncing}
              disabled={!canSync(glance)}
              onPress={() => {
                void syncNow();
              }}
            />
          ) : null}
          <Button label="Open in Fitness" icon="fitness" variant="tonal" href={href.fitness()} />
        </View>
      </View>
    </Card>
  );
}
