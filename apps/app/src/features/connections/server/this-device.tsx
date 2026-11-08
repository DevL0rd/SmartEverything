import type { ReactNode } from 'react';
import { useConnection, type ConnectionState } from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useSettings } from '../../../store/selectors';
import { forgetPairing } from './forget-pairing';
import { SERVER_PANEL } from './server-panels';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';
type Paired = Extract<ConnectionState, { status: 'paired' }>;

function howConnected(state: Paired, publicUrl: string | null): string {
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

export function ThisDeviceSection(): ReactNode {
  const state = useConnection();
  const publicUrl = useSettings().public_url;
  if (state.status !== 'paired') {
    return null;
  }
  return (
    <List inset title="This device" className={SERVER_PANEL}>
      <ValueRow icon="link" title="Connected" value={howConnected(state, publicUrl)} />
      <ListRow
        icon="server"
        title="Server"
        subtitle={new URL(state.connection.url).host}
        wrapSubtitle
      />
      <ActionRow icon="signOut" title="Unpair this device" destructive onPress={unpair} />
    </List>
  );
}
