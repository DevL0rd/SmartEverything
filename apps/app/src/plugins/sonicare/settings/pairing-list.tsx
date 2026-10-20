import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Anchored } from '../../toothbrush/settings/anchored';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';

export function PairingList({ deviceId, state }: SettingsProps): ReactNode {
  return (
    <List
      inset
      title="Pairing"
      footer="To forget the brush completely, also remove it from Bluetooth in Android settings."
    >
      <Anchored deviceId={deviceId} id="philips-app" label="Philips Sonicare app">
        <ValueRow
          icon="smartphone"
          title="Philips Sonicare app"
          subtitle="Close it while SmartEverything uses the brush. Two apps cannot talk to the brush at once."
          wrapSubtitle
          value=""
        />
      </Anchored>
      {state.mayConfigure ? (
        <Anchored deviceId={deviceId} id="rerun-setup" label="Pair the toothbrush again">
          <NavRow
            icon="bluetooth"
            title="Pair the toothbrush again"
            subtitle="Runs the setup once more"
            href={href.connect('sonicare')}
          />
        </Anchored>
      ) : null}
    </List>
  );
}
