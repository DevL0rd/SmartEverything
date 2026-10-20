import type { ReactNode } from 'react';
import { ActionRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure, useTreadmillAct } from '../data/treadmill-act';
import { LINK_LABEL, signalWord } from '../model/treadmill-model';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

function StayConnectedRow({ deviceId, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="stay-connected" label="Stay connected">
      <SwitchRow
        icon="plug"
        title="Stay connected"
        subtitle="Keep the link open while the phone is near the belt"
        value={settings.settings?.stayConnected ?? true}
        onChange={(next) => {
          configure({ stayConnected: next });
        }}
      />
    </Anchored>
  );
}

function PresenceRow({ deviceId, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="presence" label="Notice when the belt is near">
      <SwitchRow
        icon="motion"
        title="Notice when the belt is near"
        subtitle="Connect by itself when the belt switches on"
        value={settings.settings?.presence ?? true}
        onChange={(next) => {
          configure({ presence: next });
        }}
      />
    </Anchored>
  );
}

function TakeOverRow({ deviceId }: { readonly deviceId: string }): ReactNode {
  const { act } = useTreadmillAct(deviceId);
  return (
    <Anchored deviceId={deviceId} id="take-over" label="Use this phone for the link">
      <ActionRow
        icon="refresh"
        title="Use this phone for the link"
        subtitle="The belt is handed to this phone"
        onPress={() => {
          act({ action: 'take_over' }, 'This phone could not take over the link', true);
        }}
      />
    </Anchored>
  );
}

export function LinkList(props: SettingsProps): ReactNode {
  const { deviceId, state } = props;
  const { link } = state;
  const owner = state.mayConfigure && props.settings.settings !== null;
  return (
    <List
      inset
      title="Link"
      footer="The phone that holds the link carries the belt’s messages to your server."
    >
      <Anchored deviceId={deviceId} id="link" label="Bluetooth link">
        <ValueRow icon="bluetooth" title="Bluetooth link" value={LINK_LABEL[link.phase]} />
      </Anchored>
      <ValueRow
        icon="smartphone"
        title="Held by"
        value={link.holderIsYou ? 'This phone' : (link.holderName ?? 'Nobody yet')}
      />
      <ValueRow icon="signal" title="Signal" value={signalWord(link.rssi)} />
      {link.holderIsYou ? null : <TakeOverRow deviceId={deviceId} />}
      {owner ? <StayConnectedRow {...props} /> : null}
      {owner ? <PresenceRow {...props} /> : null}
    </List>
  );
}
