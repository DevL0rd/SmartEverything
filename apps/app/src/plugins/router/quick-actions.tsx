import { useMemo, type ReactNode } from 'react';
import { List } from '../../components/section';
import { ListRow } from '../../components/list-row';
import type { Device } from '../../store/state';
import { PluginActionRow } from '../shared/plugin-action';
import { canRunSpeedTest } from './overview/hero-model';
import { routerSectionHref } from './overview/links';
import { RESTART_ROUTER, RESTART_WIFI } from './router-confirmations';
import { useRouterSnapshot, useRouterTools, useSpeedTestRun } from './router-data';

export interface RouterActions {
  readonly speedTest: () => Promise<unknown>;
  readonly restartWifi: () => Promise<unknown>;
  readonly reboot: () => Promise<unknown>;
}

export function useRouterActions(): RouterActions {
  const tools = useRouterTools();
  return useMemo(
    () => ({
      speedTest: () => tools.run('run_speed_test', {}, 'The speed test didn’t start'),
      restartWifi: () => tools.run('restart_wifi', {}, 'Wi-Fi didn’t restart'),
      reboot: () => tools.run('reboot', {}, 'The router didn’t restart'),
    }),
    [tools],
  );
}

export function RouterQuickActions({ device }: { readonly device: Device }): ReactNode {
  const actions = useRouterActions();
  const stream = useRouterSnapshot();
  const run = useSpeedTestRun();
  const reachable = stream.state === 'ready' && stream.value.connection.state === 'online';
  const testable = stream.state === 'ready' && canRunSpeedTest(stream.value);
  return (
    <List>
      <PluginActionRow
        title="Speed test"
        {...(run.running ? { subtitle: run.line ?? 'Testing…' } : {})}
        icon="gauge"
        disabled={!testable || run.running}
        onPress={actions.speedTest}
      />
      <PluginActionRow
        title="Restart Wi-Fi"
        icon="refresh"
        disabled={!reachable}
        confirmation={RESTART_WIFI}
        onPress={actions.restartWifi}
      />
      <PluginActionRow
        title="Restart router"
        icon="power"
        destructive
        disabled={!reachable}
        confirmation={RESTART_ROUTER}
        onPress={actions.reboot}
      />
      <ListRow
        title="Pause a device…"
        icon="ban"
        chevron
        href={routerSectionHref(device.id, 'clients')}
      />
    </List>
  );
}
