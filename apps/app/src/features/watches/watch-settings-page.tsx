import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import type { Device } from '../../store/state';
import { WatchAlarms } from './watch-alarm-rows';
import { configOf, useWatchCommand } from './watch-config';
import { WatchFaces } from './watch-face-rows';
import { WatchSettingSections } from './watch-settings-rows';
import { useMyWatch } from './watch-glance';
import { WatchWorkoutProbe } from './watch-workout-probe';

function Outcome({
  outcome,
}: {
  readonly outcome: { readonly ok: boolean; readonly detail: string } | null;
}): ReactNode {
  if (outcome === null) {
    return null;
  }
  return (
    <Banner
      tone={outcome.ok ? 'positive' : 'critical'}
      title={outcome.ok ? 'Sent to the watch' : 'The watch didn’t change'}
      body={outcome.detail}
    />
  );
}

function Configured({ watch }: { readonly watch: Device }): ReactNode {
  const command = useWatchCommand(watch);
  const state = configOf(watch);
  if (state.kind === 'invalid') {
    return (
      <Banner tone="critical" title="The watch’s settings can’t be shown" body={state.reason} />
    );
  }
  if (state.kind === 'none') {
    return (
      <EmptyState
        icon="watch"
        title="Settings not read yet"
        body="Shows up once the watch connects to the phone it’s paired with."
        action={
          <Button
            label="Ask the watch now"
            loading={command.busy}
            onPress={() => {
              command.run({ type: 'refresh' });
            }}
          />
        }
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Outcome outcome={command.outcome} />
      <WatchSettingSections
        settings={state.config.settings}
        goals={state.config.goals}
        command={command}
      />
      <WatchAlarms alarms={state.config.alarms} command={command} />
      <WatchFaces faces={state.config.faces} command={command} />
      <WatchWorkoutProbe deviceId={watch.id} />
    </View>
  );
}

export function WatchSettingsPage(): ReactNode {
  const watch = useMyWatch();
  if (watch === null) {
    return (
      <EmptyState
        icon="watch"
        title="No watch"
        body="Add your watch first."
        action={<Button label="Add a watch" href={href.connect('watch')} />}
      />
    );
  }
  return <Configured watch={watch} />;
}
