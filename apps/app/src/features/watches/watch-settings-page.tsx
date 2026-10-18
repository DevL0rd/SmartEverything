import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import type { Device } from '../../store/state';
import { WatchAlarms } from './watch-alarm-rows';
import { configOf, useWatchCommand, type WatchOutcome } from './watch-config';
import { WatchFaces } from './watch-face-rows';
import { WatchSettingSections } from './watch-settings-rows';
import { useMyWatch } from './watch-glance';

function Failure({ outcome }: { readonly outcome: WatchOutcome | null }): ReactNode {
  return outcome === null || outcome.ok ? null : (
    <Banner tone="critical" title="The watch didn’t change" body={outcome.detail} />
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
      <Failure outcome={command.outcome} />
      <WatchSettingSections
        settings={state.config.settings}
        goals={state.config.goals}
        command={command}
      />
      <WatchAlarms alarms={state.config.alarms} command={command} />
      <WatchFaces faces={state.config.faces} command={command} />
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
