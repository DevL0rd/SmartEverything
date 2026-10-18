import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Grid } from '../../components/grid';
import { useRow } from '../../store/selectors';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { DeviceVisual, useWatchVisualState } from '../device-visuals';
import { useOwnWatch, useWatchPulse } from './use-watch-heart';
import { syncControlOf } from './watch-card-model';
import { BatteryAndOxygen, SetupAction, SyncAction } from './watch-card-parts';
import { FactTile, factsOf } from './watch-facts';
import { FindWatchButton } from './watch-find';
import { useWatchGlance, type WatchGlance } from './watch-glance';
import { beatingBpm } from './watch-heart';
import { HeartToday } from './watch-heart-today';
import { LastNightCard } from './watch-last-night';
import { StepsBlock, WeekSteps } from './watch-steps-block';

function Actions({
  device,
  glance,
  lastSeen,
}: {
  readonly device: Device;
  readonly glance: WatchGlance;
  readonly lastSeen: number | null;
}): ReactNode {
  const profile = device.details['profileId'];
  const owner = useRow('profiles', typeof profile === 'string' ? profile : null)?.name ?? null;
  const neverReported = !glance.onThisPhone && typeof device.details['reportedAt'] !== 'string';
  return (
    <View className="flex-row flex-wrap justify-center gap-3">
      {neverReported ? <SetupAction /> : null}
      {neverReported || lastSeen !== null ? null : (
        <FindWatchButton device={device} lastSeen={lastSeen} />
      )}
      {neverReported ? null : <SyncAction control={syncControlOf(glance, owner)} />}
      <Button label="Open in Fitness" icon="fitness" variant="tonal" href={href.fitness()} />
    </View>
  );
}

export function WatchHero({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const { glance, live, phone } = useWatchGlance(device);
  const { heart, lastSeen } = useWatchPulse(device, phone);
  const state = useWatchVisualState(device, { ...live, heartRate: beatingBpm(heart) });
  const facts = factsOf(glance, now, true);
  const own = useOwnWatch(device);
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
        {own ? <HeartToday device={device} /> : null}
        {own ? <LastNightCard /> : null}
        <BatteryAndOxygen device={device} battery={glance.battery} />
        <Grid minItemWidth={150} maxColumns={3}>
          {facts.map((item) => (
            <FactTile key={item.key} fact={item} />
          ))}
        </Grid>
        <Actions device={device} glance={glance} lastSeen={lastSeen} />
      </View>
    </Card>
  );
}
