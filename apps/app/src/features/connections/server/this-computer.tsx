import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { DesktopServiceStatus } from '@smarteverything/domain';
import { useServiceStatus } from '../../../api/desktop-service';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';

const HEALTH: Readonly<Record<DesktopServiceStatus['health'], string>> = {
  'not-installed': 'Not installed',
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  failed: 'Stopped with an error',
};

type Act = (work: () => Promise<DesktopServiceStatus>, failure: string) => void;

function useAct(apply: (status: DesktopServiceStatus) => void): Act {
  return (work, failure) => {
    work().then(apply, (error: unknown) => {
      notify({ message: failure, error, tone: 'critical' });
    });
  };
}

function StartOnLogin({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    bridge.getStartOnLogin().then(setEnabled, (error: unknown) => {
      notify({ message: 'Open at login couldn’t be read', error, tone: 'critical' });
    });
  }, [bridge]);
  return (
    <SwitchRow
      icon="power"
      title="Open when I log in"
      value={enabled === true}
      disabled={enabled === null}
      onChange={(next) => {
        bridge.setStartOnLogin(next).then(setEnabled, (error: unknown) => {
          notify({ message: 'Open at login wasn’t changed', error, tone: 'critical' });
        });
      }}
    />
  );
}

function uninstall(bridge: DesktopBridge, act: Act): void {
  void confirm({
    title: 'Uninstall the server?',
    body: 'Your home stops working until you start it again.',
    confirmLabel: 'Uninstall',
    tone: 'destructive',
    typed: 'uninstall',
  }).then((accepted) => {
    if (accepted) {
      act(() => bridge.uninstallService(), 'The server wasn’t uninstalled');
    }
  });
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
      {status.linger === 'enabled' || status.linger === 'before-login' ? (
        <ValueRow
          icon="moon"
          title="Keep running when logged out"
          value={status.linger === 'before-login' ? 'Always' : 'On'}
        />
      ) : null}
      {status.installed && status.linger !== 'before-login' ? (
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
      <LaterRows bridge={bridge} status={status} act={act} />
    </List>
  );
}

function Service({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const { reading, apply } = useServiceStatus(bridge);
  const act = useAct(apply);
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
