import type { ReactNode } from 'react';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { CardGrid } from '../components/card-grid';
import { useComputerSelect } from '../data/computer-metrics';
import { BluetoothCard } from './bluetooth-card';
import { WifiCard } from './wifi-card';

interface WirelessOffer {
  readonly wifi: boolean;
  readonly bluetooth: boolean;
}

export function Wireless({ device }: { readonly device: Device }): ReactNode {
  const offered = useComputerSelect(
    device.id,
    (parts): WirelessOffer | null =>
      parts.system === undefined
        ? null
        : { wifi: parts.system.wifi !== null, bluetooth: parts.system.bluetooth !== null },
    sameJson,
  );
  if (offered === null) return null;
  const cards = [
    ...(offered.wifi ? ['wifi' as const] : []),
    ...(offered.bluetooth ? ['bluetooth' as const] : []),
  ];
  return (
    <CardGrid
      items={cards}
      keyOf={(card) => card}
      render={(card) =>
        card === 'wifi' ? (
          <WifiCard deviceId={device.id} name={device.label} offline={!device.online} />
        ) : (
          <BluetoothCard deviceId={device.id} offline={!device.online} />
        )
      }
    />
  );
}
