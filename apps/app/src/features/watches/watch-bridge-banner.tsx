import type { ReactNode } from 'react';
import { isHealthConnectLinked } from '../../../modules/health-connect';
import { Banner } from '../../components/banner';
import { useSession } from '../../store/selectors';
import type { Device } from '../../store/state';
import { heldElsewhere } from './watch-bridge';
import { takeOverBridge } from './watch-link';
import { background } from '@smarteverything/logging';

export function BridgeBanner({ device }: { readonly device: Device }): ReactNode {
  const clientId = useSession().client.id;
  const holder = heldElsewhere(device, clientId);
  if (!isHealthConnectLinked || holder === null) {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title="Another app is bridging this watch"
      body={`${holder.clientName} holds the Bluetooth connection, so this app stays off the watch. Take over to bridge it from this app instead.`}
      wrapBody
      action={{
        label: 'Take over',
        onPress: () => {
          background(takeOverBridge(device.id), 'over_bridge.take_failed');
        },
      }}
    />
  );
}
