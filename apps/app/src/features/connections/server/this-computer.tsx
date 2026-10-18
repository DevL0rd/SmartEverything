import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { DesktopServiceStatus } from '@smarteverything/domain';
import { useServiceStatus } from '../../../api/desktop-service';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { START_ON_LOGIN_KEY } from '../../../queries/keys';

import { connectionsLog, trackConnection } from '../connections-log';
import { AppUpdateRows } from './app-update-rows';
import { background } from '@smarteverything/logging';
const HEALTH: Readonly<Record<DesktopServiceStatus['health'], string>> = {
  'not-installed': 'Not installed',
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  failed: 'Stopped with an error',
};

type Act = (work: () => Promise<DesktopServiceStatus>, failure: string) => void;

function actOn(apply: (status: DesktopServiceStatus) => void): Act {
  return (work, failure) => {
    connectionsLog.info('service.action_started', { failure });
    work().then(
      (status) => {
        connectionsLog.info('service.action_succeeded', {
          failure,
          health: status.health,
          active: status.active,
        });
        apply(status);
      },
      (error: unknown) => {
        connectionsLog.error('service.action_failed', error, { failure });
        notifyFailure(failure)(error);
      },
    );
  };
}

function StartOnLogin({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const client = useQueryClient();
  const read = useScreenQuery({
    queryKey: START_ON_LOGIN_KEY,
    queryFn: () => bridge.getStartOnLogin(),
  });
  useEffect(() => {
    if (read.isError) {
      notifyFailure('Open at login couldn’t be read')(read.error);
    }
  }, [read.isError, read.error]);
  return (
    <SwitchRow
      icon="power"
      title="Open when I log in"
      value={read.data === true}
      disabled={read.data === undefined}
      onChange={(next) => {
        trackConnection('start_on_login.set', { enabled: next }, () =>
          bridge.setStartOnLogin(next),
        ).then(
          (enabled) => client.setQueryData(START_ON_LOGIN_KEY, enabled),
          notifyFailure('Open at login wasn’t changed'),
        );
      }}
    />
  );
}

function uninstall(bridge: DesktopBridge, act: Act): void {
  background(
    confirm({
      title: 'Uninstall the server?',
      body: 'Your home stops working until you start it again.',
      confirmLabel: 'Uninstall',
      tone: 'destructive',
      typed: 'uninstall',
    }).then((accepted) => {
      if (accepted) {
        act(() => bridge.uninstallService(), 'The server wasn’t uninstalled');
      }
    }),
    'this_computer.confirm_failed',
  );
}

function LaterRows({
  bridge,
  status,
  act,
}: {
  readonly bridge: DesktopBridge;
  readonly status: DesktopServiceStatus;
  readonly act: Act;
}): ReactNode {
  return (
    <>
      {status.linger === 'disabled' ? (
        <ActionRow
          icon="moon"
          title="Keep running when logged out"
          subtitle="Off"
          onPress={() => {
            act(() => bridge.enableServiceLinger(), 'This wasn’t turned on');
          }}
        />
      ) : null}
      {status.linger === 'enabled' ? (
        <ValueRow icon="moon" title="Keep running when logged out" value="On" />
      ) : null}
      {status.installed ? (
        <ActionRow
          icon="trash"
          title="Uninstall the server"
          destructive
          onPress={() => {
            uninstall(bridge, act);
          }}
        />
      ) : null}
    </>
  );
}

function HealthRow({ status }: { readonly status: DesktopServiceStatus }): ReactNode {
  return (
    <ValueRow
      icon="server"
      title="Server"
      value={HEALTH[status.health]}
      {...(status.health === 'failed' ? { subtitle: status.detail } : {})}
    />
  );
}

function ServiceRows({
  bridge,
  status,
  act,
}: {
  readonly bridge: DesktopBridge;
  readonly status: DesktopServiceStatus;
  readonly act: Act;
}): ReactNode {
  if (status.managedBy === 'stable-app') {
    return (
      <List inset title="This computer" footer="Managed by the stable app.">
        <HealthRow status={status} />
      </List>
    );
  }
  return (
    <List
      inset
      title="This computer"
      footer="Your server keeps running when this window is closed."
    >
      <HealthRow status={status} />
      <ActionRow
        icon={status.active ? 'power' : 'play'}
        title={status.active ? 'Stop the server' : 'Start the server'}
        onPress={() => {
          act(
            () => (status.active ? bridge.stopService() : bridge.startService()),
            'The server didn’t respond',
          );
        }}
      />
      <ActionRow
        icon="refresh"
        title="Restart the server"
        disabled={!status.installed}
        onPress={() => {
          act(() => bridge.restartService(), 'The server wasn’t restarted');
        }}
      />
      <StartOnLogin bridge={bridge} />
      <AppUpdateRows bridge={bridge} />
      <LaterRows bridge={bridge} status={status} act={act} />
    </List>
  );
}

function Service({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const { reading, apply } = useServiceStatus(bridge);
  const act = actOn(apply);
  if (reading.kind === 'read') {
    return <ServiceRows bridge={bridge} status={reading.status} act={act} />;
  }
  return (
    <List inset title="This computer">
      <ValueRow
        icon="server"
        title="Server"
        value={reading.kind === 'failed' ? 'Unreadable' : 'Reading…'}
        {...(reading.kind === 'failed' ? { subtitle: reading.problem } : {})}
      />
    </List>
  );
}

export function ThisComputerSection(): ReactNode {
  const bridge = desktopBridge();
  return bridge === null ? null : <Service bridge={bridge} />;
}
