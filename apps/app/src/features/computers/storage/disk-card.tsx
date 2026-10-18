import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { decimal } from '../../../format/number';
import { columnsOfArea } from '../components/card-grid';
import { LiveSeriesChart, type LiveLine } from '../components/live-series-chart';
import { byteRate } from '../model/computer-charts';
import { diskSeverity } from '../model/computer-view';
import {
  diskLine,
  diskTitle,
  freeLine,
  usageLine,
  usedShare,
  type DiskFacts,
} from './storage-model';

const CHART_HEIGHT = 110;

function linesOf(device: string): readonly LiveLine[] {
  return [
    { ids: [`disks/${device}.readRate`], label: 'Read', colour: 'viz-blue' },
    { ids: [`disks/${device}.writeRate`], label: 'Write', colour: 'viz-magenta' },
  ];
}

function Header({
  deviceId,
  disk,
}: {
  readonly deviceId: string;
  readonly disk: DiskFacts;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <IconWell icon="layers" colour="viz-blue" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {diskTitle(disk)}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {diskLine(disk)}
        </Text>
      </View>
      <Button
        label="Open in Files"
        variant="text"
        href={href.settings.device(deviceId, 'files', { path: disk.mount })}
      />
    </View>
  );
}

function Usage({ disk }: { readonly disk: DiskFacts }): ReactNode {
  const share = usedShare(disk);
  const severity = diskSeverity(share);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text variant="title-3" className="tabular min-w-0 flex-1">
          {freeLine(disk)}
        </Text>
        {severity.word === null ? null : (
          <Text variant="callout" tone={severity.tone ?? 'default'}>
            {severity.word}
          </Text>
        )}
        <Text variant="callout" tone="variant" className="tabular">
          {`${decimal(Math.round(share))} %`}
        </Text>
      </View>
      <ProgressBar
        progress={share / 100}
        colour={severity.tone ?? 'primary'}
        label={`${diskTitle(disk)} used`}
      />
      <Text variant="footnote" tone="variant" className="tabular">
        {`${usageLine(disk)} used`}
      </Text>
    </View>
  );
}

export function DiskCard({
  deviceId,
  disk,
  offline,
}: {
  readonly deviceId: string;
  readonly disk: DiskFacts;
  readonly offline: boolean;
}): ReactNode {
  const wide = columnsOfArea(useAreaWidth()) === 2;
  return (
    <Card>
      <View className="gap-3">
        <Header deviceId={deviceId} disk={disk} />
        <View className={wide ? 'flex-row items-center gap-6' : 'gap-3'}>
          <View className="min-w-0 flex-1">
            <Usage disk={disk} />
          </View>
          <View className="min-w-0 flex-1">
            <LiveSeriesChart
              deviceId={deviceId}
              lines={linesOf(disk.device)}
              yDomain="sticky"
              label={`${diskTitle(disk)} read and write`}
              formatValue={byteRate}
              height={CHART_HEIGHT}
              offline={offline}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}
