import type { PrinterOverview } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { LoadedQuery } from '../../components/loaded-query';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import { atLeast, useSizeClass } from '../../design/size-class';
import { DeviceVisual, usePrinterLive, type PrinterLive } from '../../features/device-visuals';
import type { Device } from '../../store/state';
import { ActionBar } from './components/action-bar';
import { ChipRow } from './components/chips';
import { StateRing } from './components/state-ring';
import { usePrinterActor, usePrinterView } from './data/use-printer-view';
import { countLabel } from './model/format';
import { statusOf } from './model/status';
import { PrintSheet } from './print/print-sheet';
import { openPrintSheet } from './print/print-store';

const PLAIN_MESSAGES: ReadonlySet<string> = new Set([
  'idle',
  'busy',
  'ready',
  'printing',
  'processing',
  'stopped',
]);

function messageOf(live: PrinterLive): string | null {
  const message = live.details.stateMessage?.trim() ?? '';
  const plain = message.toLowerCase().replace(/[.!]+$/, '');
  return message === '' || PLAIN_MESSAGES.has(plain) ? null : message;
}

function ringCaption(live: PrinterLive): string {
  if (!live.online) return 'Showing the last data';
  if (live.queued > 0) return countLabel(live.queued, 'job') + ' queued';
  return live.state === 'printing' ? 'Printing' : 'Nothing queued';
}

function HeroBody({
  device,
  live,
  overview,
}: {
  readonly device: Device;
  readonly live: PrinterLive;
  readonly overview: PrinterOverview;
}): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  const actor = usePrinterActor(device);
  const status = statusOf(live);
  const message = messageOf(live);
  return (
    <Card>
      <View className="gap-4">
        <View className={cn('items-center gap-4', wide && 'flex-row justify-center gap-8')}>
          <DeviceVisual device={device} size="hero" />
          <StateRing
            tone={status.tone}
            progress={status.progress}
            title={status.text}
            caption={ringCaption(live)}
            size={132}
          />
        </View>
        {message === null ? null : (
          <Text variant="footnote" tone="variant">
            {message}
          </Text>
        )}
        <ChipRow live={live} />
        <ActionBar
          device={device}
          actor={actor}
          actions={overview.actions}
          onPrint={openPrintSheet}
          online={live.online}
        />
      </View>
      <PrintSheet device={device} />
    </Card>
  );
}

export function PrinterHero({ device }: { readonly device: Device }): ReactNode {
  const live = usePrinterLive(device);
  const overview = usePrinterView(device, 'overview');
  return (
    <LoadedQuery query={overview}>
      {(view) => (live === null ? null : <HeroBody device={device} live={live} overview={view} />)}
    </LoadedQuery>
  );
}
