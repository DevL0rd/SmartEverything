import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { usePrinterView } from '../data/use-printer-view';
import type { ViewOf } from '../data/printer-api';

type Tray = ViewOf<'trays'>['trays'][number];

function levelText(tray: Tray): string {
  if (tray.level === null) return 'Level not reported';
  if (!tray.ok) return tray.level <= 0 ? 'Empty' : 'Needs attention';
  return `${String(Math.round(tray.level))}%${tray.partial ? ' (rough)' : ''}`;
}

function TrayCard({ tray }: { readonly tray: Tray }): ReactNode {
  const media = [tray.media, tray.mediaType].filter((part): part is string => part !== null);
  return (
    <View className="gap-1" accessible accessibilityLabel={`${tray.name}, ${levelText(tray)}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {tray.name}
        </Text>
        <Text variant="callout" tone={tray.ok ? 'default' : 'critical'} className="tabular">
          {levelText(tray)}
        </Text>
      </View>
      <ProgressBar
        progress={tray.level === null ? null : tray.level / 100}
        colour={tray.ok ? 'primary' : 'critical'}
        label={`${tray.name} paper level`}
      />
      {media.length === 0 ? null : (
        <Text variant="caption" tone="variant">
          {media.join(' · ')}
          {tray.capacity === null ? '' : ` · holds ${String(tray.capacity)} sheets`}
        </Text>
      )}
    </View>
  );
}

function Body({ view }: { readonly view: ViewOf<'trays'> }): ReactNode {
  if (view.trays.length === 0 && view.bins.length === 0) {
    return (
      <EmptyState
        icon="box"
        title="No trays reported"
        body="This printer does not say how much paper is loaded."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      {view.trays.length === 0 ? null : (
        <Card title="Paper trays" icon="box">
          <View className="gap-4">
            {view.trays.map((tray) => (
              <TrayCard key={tray.number} tray={tray} />
            ))}
          </View>
        </Card>
      )}
      {view.bins.length === 0 ? null : (
        <Card title="Output trays" icon="download">
          <View className="gap-4">
            {view.bins.map((bin) => (
              <TrayCard key={bin.number} tray={bin} />
            ))}
          </View>
        </Card>
      )}
      {view.mediaReady.length === 0 ? null : (
        <Card title="Paper ready" icon="fileText">
          <Text variant="body">{view.mediaReady.join(' · ')}</Text>
        </Card>
      )}
    </View>
  );
}

export function PaperSection({ device }: { readonly device: Device }): ReactNode {
  const trays = usePrinterView(device, 'trays');
  return <LoadedQuery query={trays}>{(view) => <Body view={view} />}</LoadedQuery>;
}
