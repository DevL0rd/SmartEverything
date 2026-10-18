import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Gauge, MemoryBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneFace } from '../card/use-phone-face';
import { usePhoneSection } from '../data/phone-detail';
import { phoneReadingsOf } from '../phone-values';
import {
  TEMPERATURE_BANDS,
  TEMPERATURE_RANGE,
  healthText,
  memoryOf,
  temperatureWord,
} from '../model/battery-view';

const GAUGE_SIZE = 112;

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center justify-between gap-3">
      <Text variant="callout" tone="variant">
        {label}
      </Text>
      <Text variant="callout" className="tabular">
        {value}
      </Text>
    </View>
  );
}

export function HealthCard({ device }: { readonly device: Device }): ReactNode {
  const power = usePhoneSection(device.id, 'power');
  const { readings } = usePhoneFace(device);
  const powerSave = useDeviceDerived(device.id, (values) => phoneReadingsOf(values).powerSave, []);
  const celsius = power?.temperatureC ?? readings.temperature;
  const cycles = power?.cycles ?? null;
  return (
    <Card title="Health" icon="thermometer">
      <View className="flex-row items-center gap-5">
        {celsius === null ? null : (
          <Gauge
            value={celsius}
            min={TEMPERATURE_RANGE.min}
            max={TEMPERATURE_RANGE.max}
            bands={TEMPERATURE_BANDS}
            size={GAUGE_SIZE}
            label={`Temperature ${String(Math.round(celsius))} degrees, ${temperatureWord(celsius)}`}
          >
            <Text variant="title-3" className="tabular">
              {`${String(Math.round(celsius))} °C`}
            </Text>
            <Text variant="caption" tone="variant">
              {temperatureWord(celsius)}
            </Text>
          </Gauge>
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          {power === undefined ? null : (
            <Fact label="Battery health" value={healthText(power.health)} />
          )}
          {cycles === null ? null : <Fact label="Charge cycles" value={String(cycles)} />}
          {powerSave === true ? (
            <View className="gap-1 pt-1">
              <Badge label="Battery saver is on" tone="info" icon="leaf" />
              <Text variant="footnote" tone="variant">
                Turn it on or off on the phone.
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

export function MemoryCard({ device }: { readonly device: Device }): ReactNode {
  const power = usePhoneSection(device.id, 'power');
  if (power === undefined) return null;
  const memory = memoryOf(power);
  return (
    <Card title="Memory" icon="cpu">
      <MemoryBar
        total={memory.totalGb}
        segments={[{ label: 'In use', value: memory.usedGb, colour: 'viz-blue' }]}
        unit="GB"
      />
    </Card>
  );
}
