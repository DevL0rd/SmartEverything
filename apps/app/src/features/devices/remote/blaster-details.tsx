import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { IrRemoteRow } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import type { Device } from '../../../store/state';
import { MetricChart } from '../detail/history-section';
import { useDeviceModel } from '../model/device-model';
import { HISTORY_RANGES, historyMetrics, type HistoryRangeKey } from '../model/history-model';
import { CATEGORY_LOOKS } from './remote-category';
import { useLearnedSource, useLibrarySource, type RemoteSource } from './remote-source';
import { useRemotes } from './remote-section';
import { useRemoteView } from './use-remote-view';

const CLIMATE_CHARTS: readonly { readonly key: string; readonly colour: ColourRole }[] = [
  { key: 'temperature', colour: 'temp-warm' },
  { key: 'humidity', colour: 'humidity' },
];

const CHART_HEIGHT = 120;
const RANGES = HISTORY_RANGES.filter((range) => range.value !== '30d');

function ClimateCard({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const [range, setRange] = useState<HistoryRangeKey>('24h');
  const metrics = historyMetrics(model.presentation, false);
  const charts = CLIMATE_CHARTS.flatMap(({ key, colour }) => {
    const metric = metrics.find((candidate) => candidate.key === key);
    return metric === undefined ? [] : [{ metric, colour }];
  });
  if (charts.length === 0) {
    return null;
  }
  return (
    <Card title="Room climate" icon="thermometer">
      <View className="gap-4">
        <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
        {charts.map(({ metric, colour }) => (
          <View key={metric.key} className="gap-1">
            <Text variant="label" tone="variant">
              {metric.label}
            </Text>
            <MetricChart
              device={device}
              metric={metric}
              range={range}
              colour={colour}
              height={CHART_HEIGHT}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

function RemoteRow({
  source,
  to,
}: {
  readonly source: RemoteSource;
  readonly to: Href;
}): ReactNode {
  const view = useRemoteView(source);
  return (
    <ListRow
      title={source.name}
      subtitle={view.line.text}
      icon={CATEGORY_LOOKS[source.category].icon}
      trailing={<Badge label={view.chip.label} tone={view.chip.tone} />}
      chevron
      href={to}
    />
  );
}

function LibraryRow({ device }: { readonly device: Device }): ReactNode {
  return <RemoteRow source={useLibrarySource(device)} to={href.device(device)} />;
}

function LearnedRow({
  blaster,
  remote,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
}): ReactNode {
  return (
    <RemoteRow
      source={useLearnedSource(blaster, remote)}
      to={href.deviceSection(blaster.id, 'remote')}
    />
  );
}

function RemotesCard({ blaster }: { readonly blaster: Device }): ReactNode {
  const { library, remotes } = useRemotes(blaster);
  const settings = href.settings.device(blaster.id, 'remotes');
  const none = library.length === 0 && remotes.length === 0;
  return (
    <Card title="Remotes" icon="remote" padding="none">
      {none ? (
        <View className="gap-3 p-card">
          <Text variant="callout" tone="variant">
            No remotes yet. Teach this blaster the buttons of a remote.
          </Text>
          <View className="flex-row">
            <Button label="Learn a button" icon="plus" href={settings} />
          </View>
        </View>
      ) : (
        <>
          {library.map((device) => (
            <LibraryRow key={device.id} device={device} />
          ))}
          {remotes.map((remote) => (
            <LearnedRow key={remote.id} blaster={blaster} remote={remote} />
          ))}
          <View className="flex-row p-card">
            <Button label="Learn a button" icon="plus" variant="tonal" href={settings} />
          </View>
        </>
      )}
    </Card>
  );
}

export function BlasterDetails({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-section-gap">
      <ClimateCard device={device} />
      <RemotesCard blaster={device} />
    </View>
  );
}
