import type { ReactNode } from 'react';
import {
  chooseRemoteServer,
  chooseThisComputer,
  useConnection,
  type ConnectionState,
} from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { useSettings } from '../../../store/selectors';
import { forgetPairing } from './forget-pairing';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';
type Paired = Extract<ConnectionState, { status: 'paired' }>;

function howConnected(state: Paired, publicUrl: string | null): string {
  if (state.kind === 'desktop') {
    return 'This computer';
  }
  return state.connection.url === publicUrl ? 'Public address' : 'Home network';
}

function unpair(): void {
  background(
    confirm({
      title: 'Unpair this device?',
      body: 'You’ll need a new pairing code to come back.',
      confirmLabel: 'Unpair',
      tone: 'destructive',
    }).then((accepted) => {
      if (accepted) {
        trackConnection('pairing.forget', {}, forgetPairing).catch(
          notifyFailure('This device wasn’t unpaired'),
        );
      }
    }),
    'this_device.confirm_failed',
  );
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
        trackConnection('server.choose_remote', {}, chooseRemoteServer).catch(
          notifyFailure('The server wasn’t switched'),
        );
      }}
    />
  ) : (
    <ActionRow
      icon="monitor"
      title="Use this computer’s server"
      onPress={() => {
        trackConnection('server.choose_this_computer', {}, chooseThisComputer).catch(
          notifyFailure('The server wasn’t switched'),
        );
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
