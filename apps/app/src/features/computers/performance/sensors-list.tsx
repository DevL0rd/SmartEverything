import type { ReactNode } from 'react';
import { View } from 'react-native';
import { sensorLabel, type SensorSnapshot } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { LiveFigure } from '../../../components/live-figure';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { decimal } from '../../../format/number';
import { plural } from '../../../format/text';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { gridColumnsOf } from '../../../components/frame-layout';
import { useComputerSelect } from '../data/computer-metrics';
import { Spare } from './spare';
import { sensorWord, sensorsByGroup } from '../model/performance';
import { packRows, spareColumns } from '../model/performance-layout';
import { bodyWidthOf } from '../model/sections';
import { spokenFact } from '../model/spoken-unit';

const TOPICS = ['sensors'] as const;

function SensorRow({
  sensor,
  offline,
}: {
  readonly sensor: SensorSnapshot;
  readonly offline: boolean;
}): ReactNode {
  const word = sensorWord(sensor);
  const label = sensorLabel(sensor.chip, sensor.label);
  const tone = word === 'Critical' ? 'critical' : 'warning';
  const value = decimal(Math.round(sensor.celsius));
  return (
    <View
      accessible
      accessibilityLabel={`${spokenFact(label, value, '°C')}${word === null ? '' : `, ${word}`}`}
      className="min-h-row-h flex-row items-center gap-3 border-t border-outline-variant px-4"
    >
      <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
        {label}
      </Text>
      {word === null ? null : (
        <View className="flex-row items-center gap-1">
          <Icon name="warning" size={16} tone={tone} />
          <Text variant="caption" tone={tone}>
            {word}
          </Text>
        </View>
      )}
      <LiveFigure value={value} unit="°C" size="s" widest="100" stale={offline} align="center" />
    </View>
  );
}

const GROUP_CARD =
  'min-w-0 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1';

function GroupCard({
  group,
  rows,
  offline,
}: {
  readonly group: string;
  readonly rows: readonly SensorSnapshot[];
  readonly offline: boolean;
}): ReactNode {
  return (
    <>
      <Text variant="footnote" tone="variant" className="px-4 pb-1 pt-3">
        {group}
      </Text>
      {rows.map((sensor, index) => (
        <SensorRow
          key={`${String(index)}.${sensor.chip}.${sensor.label}`}
          sensor={sensor}
          offline={offline}
        />
      ))}
    </>
  );
}

export function SensorsList({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const sensors = useComputerSelect(deviceId, (parts) => parts.sensors?.sensors, sameJson);
  const columns = gridColumnsOf(bodyWidthOf(useAreaWidth()));
  return (
    <DemandRegion deviceId={deviceId} topics={TOPICS}>
      {sensors === undefined || sensors.length === 0 ? null : (
        <Section title="All sensors" caption={plural(sensors.length, 'sensor')}>
          <View className="gap-4">
            {packRows(
              sensorsByGroup(sensors).map((entry) => ({ ...entry, span: 1 as const })),
              columns,
            ).map((row) => (
              <View key={row.map((entry) => entry.group).join()} className="flex-row gap-4">
                {row.map(({ group, rows }) => (
                  <View key={group} className={cn(GROUP_CARD, 'flex-1')}>
                    <GroupCard group={group} rows={rows} offline={offline} />
                  </View>
                ))}
                <Spare spare={spareColumns(row, columns)} />
              </View>
            ))}
          </View>
        </Section>
      )}
    </DemandRegion>
  );
}
