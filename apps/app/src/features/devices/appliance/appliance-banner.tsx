import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useOfflineLine } from '../detail/offline-banner';
import {
  BUTTONS_SECTION,
  controlNote,
  missingControlButtons,
  offlineCause,
  type Appliance,
} from './appliance-model';
import { BlasterPicker } from './blaster-picker';

function OfflineAppliance({
  device,
  appliance,
}: {
  readonly device: Device;
  readonly appliance: Appliance;
}): ReactNode {
  const blaster = useRow('devices', appliance.blasterId);
  const line = useOfflineLine(device.id);
  const [picking, setPicking] = useState(false);
  return (
    <View>
      <Banner
        tone="warning"
        title={line ?? 'Offline'}
        body={offlineCause(appliance, blaster)}
        wrapBody
        action={{
          label: 'Use another blaster',
          onPress: () => {
            setPicking(true);
          },
        }}
      />
      {picking ? (
        <BlasterPicker
          appliance={appliance}
          name={device.label}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function ApplianceBanner({
  device,
  appliance,
}: {
  readonly device: Device;
  readonly appliance: Appliance;
}): ReactNode {
  if (!device.online) {
    return <OfflineAppliance device={device} appliance={appliance} />;
  }
  const note = controlNote(missingControlButtons(device));
  return note === null ? null : (
    <Banner
      tone="info"
      title={note}
      body="Until then the hub cannot work out which buttons to send."
      wrapBody
      action={{ label: 'Learn buttons', href: href.deviceSection(device.id, BUTTONS_SECTION) }}
    />
  );
}
