import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../components/loaded-query';
import { usePrinterLive, type PrinterLive } from '../../features/device-visuals';
import { useIsOwner } from '../../store/selectors';
import type { Device } from '../../store/state';
import { FixCards } from './components/chips';
import { Notices } from './components/notices';
import { QueueBand } from './components/queue-band';
import { SupplyBand } from './components/supply-band';
import { TodayBand } from './components/today-band';
import { usePrinterActor, usePrinterView } from './data/use-printer-view';

function Body({
  device,
  live,
}: {
  readonly device: Device;
  readonly live: PrinterLive;
}): ReactNode {
  const owner = useIsOwner();
  const actor = usePrinterActor(device);
  const overview = usePrinterView(device, 'overview');
  const queue = usePrinterView(device, 'queue');
  return (
    <View className="gap-section-gap">
      <Notices device={device} />
      <FixCards live={live} />
      <LoadedQuery query={queue}>
        {(view) => (
          <QueueBand
            device={device}
            live={live}
            queue={view}
            actor={actor}
            mayCancel={owner}
            actions={overview.data?.actions ?? []}
          />
        )}
      </LoadedQuery>
      <SupplyBand live={live} deviceId={device.id} />
      <LoadedQuery query={overview}>
        {(view) => <TodayBand device={device} today={view.today} />}
      </LoadedQuery>
    </View>
  );
}

export function PrinterOverview({ device }: { readonly device: Device }): ReactNode {
  const live = usePrinterLive(device);
  return live === null ? null : <Body device={device} live={live} />;
}
