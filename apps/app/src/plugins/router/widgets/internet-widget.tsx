import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { PluginIconButton } from '../../shared/plugin-action';
import { heroOf } from '../overview/hero-model';
import { useRouterTools, useSpeedTestRun, useSpeedTests } from '../router-data';
import { InternetFace } from './internet-faces';
import { runControlOf, type RunControl } from './internet-model';
import { RouterWidgetFrame, type RouterReady } from './router-widget-frame';

function RunAction({
  control,
  onRun,
}: {
  readonly control: RunControl;
  readonly onRun: () => Promise<unknown>;
}): ReactNode {
  if (control.kind === 'running') {
    return (
      <Text variant="footnote" tone="info" numberOfLines={1} accessibilityLiveRegion="polite">
        {control.label}
      </Text>
    );
  }
  return (
    <PluginIconButton
      icon="play"
      label={control.label}
      variant="tonal"
      disabled={control.kind === 'blocked'}
      onPress={onRun}
    />
  );
}

export function InternetWidget(): ReactNode {
  const { cls } = useWidgetFace();
  const tools = useRouterTools();
  const run = useSpeedTestRun();
  const list = useSpeedTests();
  const tests = list.state === 'ready' ? list.tests : [];
  const action = ({ snapshot }: RouterReady): ReactNode =>
    cls === 's' ? undefined : (
      <RunAction
        control={runControlOf(snapshot, run)}
        onRun={() => tools.run('run_speed_test', {}, 'The speed test didn’t start')}
      />
    );
  return (
    <RouterWidgetFrame title="Internet" icon="router" accent="viz-1" action={action}>
      {(ready) => (
        <InternetFace
          ready={ready}
          hero={heroOf(ready.snapshot, tests[0] ?? null)}
          run={run}
          tests={tests}
        />
      )}
    </RouterWidgetFrame>
  );
}
