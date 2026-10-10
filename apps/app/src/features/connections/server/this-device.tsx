import type { ReactNode } from 'react';
import {
  chooseRemoteServer,
  chooseThisComputer,
  forgetServer,
  useConnection,
  type ConnectionState,
} from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { forgetThisPhone } from '../../../platform/push';
import { useSettings } from '../../../store/selectors';

type Paired = Extract<ConnectionState, { status: 'paired' }>;

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

function howConnected(state: Paired, publicUrl: string | null): string {
  if (state.kind === 'desktop') {
    return 'This computer';
  }
  return state.connection.url === publicUrl ? 'Public address' : 'Home network';
}

function unpair(): void {
  void confirm({
    title: 'Unpair this device?',
    body: 'You’ll need a new pairing code to come back.',
    confirmLabel: 'Unpair',
    tone: 'destructive',
  }).then((accepted) => {
    if (accepted) {
      forgetThisPhone().then(forgetServer).catch(failed('This device wasn’t unpaired'));
    }
  });
}

function switchRow(state: Paired): ReactNode {
  if (appPlatform() !== 'desktop') {
    return null;
  }
  return state.kind === 'desktop' ? (
    <ActionRow
      icon="server"
      title="Use another server"
      onPress={() => {
        chooseRemoteServer().catch(failed('The server wasn’t switched'));
      }}
    />
  ) : (
    <ActionRow
      icon="monitor"
      title="Use this computer’s server"
      onPress={() => {
        chooseThisComputer().catch(failed('The server wasn’t switched'));
      }}
    />
  );
}

export function ThisDeviceSection(): ReactNode {
  const state = useConnection();
  const publicUrl = useSettings().public_url;
  if (state.status !== 'paired') {
    return null;
  }
  return (
    <List inset title="This device">
      <ValueRow icon="link" title="Connected" value={howConnected(state, publicUrl)} />
      <ValueRow icon="server" title="Server" value={new URL(state.connection.url).host} />
      {switchRow(state)}
      {state.kind === 'desktop' ? null : (
        <ActionRow icon="signOut" title="Unpair this device" destructive onPress={unpair} />
      )}
    </List>
  );
}
