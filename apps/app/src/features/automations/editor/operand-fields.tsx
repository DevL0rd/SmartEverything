import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  WEATHER_METRIC_INFO,
  WEATHER_METRICS,
  type OperandV2,
  type WeatherMetric,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import type { Catalog } from '../data/use-automations';
import { readableCapabilities } from '../model/capability-choices';
import { firstReading } from '../model/inputs';
import { TargetFields } from './target-fields';

export type OperandSource = 'device' | 'value' | 'input' | 'weather';

const SOURCE_LABELS: Readonly<Record<OperandSource, string>> = {
  device: 'A device reading',
  value: 'A Value',
  input: 'An input',
  weather: 'The weather',
};

const METRIC_OPTIONS = [
  ...WEATHER_METRICS.map((metric) => ({ value: metric, label: WEATHER_METRIC_INFO[metric].label })),
  { value: 'kind' as const, label: 'Kind of weather' },
];

function sourceOf(operand: OperandV2): OperandSource | null {
  if ('device' in operand) return 'device';
  if ('value' in operand) return 'value';
  if ('input' in operand) return 'input';
  return 'weather' in operand ? 'weather' : null;
}

function operandFor(source: OperandSource, catalog: Catalog): OperandV2 | null {
  switch (source) {
    case 'device': {
      const reading = firstReading(catalog);
      return reading === null
        ? null
        : { device: reading.device.id, control: reading.capability.key };
    }
    case 'value': {
      const row = catalog.values[0];
      return row === undefined ? null : { value: row.id };
    }
    case 'input': {
      const declared = catalog.inputs[0];
      return declared === undefined ? null : { input: declared.name };
    }
    case 'weather':
      return { weather: 'temperature' };
  }
}

interface OperandFieldsProps {
  readonly catalog: Catalog;
  readonly operand: OperandV2;
  readonly sources: readonly OperandSource[];
  readonly onChange: (operand: OperandV2) => void;
}

function sourceOptions(
  catalog: Catalog,
  sources: readonly OperandSource[],
  current: OperandSource | null,
): { value: OperandSource; label: string }[] {
  return sources
    .filter((source) => source === current || operandFor(source, catalog) !== null)
    .map((source) => ({ value: source, label: SOURCE_LABELS[source] }));
}

function WeatherPicker({ operand, onChange }: OperandFieldsProps): ReactNode {
  if (!('weather' in operand)) return null;
  return (
    <Select
      label="Reading"
      value={operand.weather}
      options={METRIC_OPTIONS}
      onChange={(weather: WeatherMetric | 'kind') => {
        onChange({ weather });
      }}
    />
  );
}

function ValuePicker({ catalog, operand, onChange }: OperandFieldsProps): ReactNode {
  if (!('value' in operand)) return null;
  return (
    <Select
      label="Value"
      searchable
      value={operand.value}
      options={catalog.values.map((row) => ({ value: row.id, label: row.content.name }))}
      onChange={(value) => {
        onChange({ value });
      }}
    />
  );
}

function InputPicker({ catalog, operand, onChange }: OperandFieldsProps): ReactNode {
  if (!('input' in operand)) return null;
  return (
    <Select
      label="Input"
      value={operand.input}
      options={catalog.inputs.map((input) => ({ value: input.name, label: input.name }))}
      onChange={(input) => {
        onChange({ input });
      }}
    />
  );
}

function ReadingPicker({ catalog, operand, onChange }: OperandFieldsProps): ReactNode {
  if (!('device' in operand)) return null;
  return (
    <TargetFields
      devices={catalog.devices}
      usable={readableCapabilities}
      deviceId={operand.device}
      capability={operand.control}
      onTarget={(device, capability) => {
        onChange({ device: device.id, control: capability.key });
      }}
    />
  );
}

function OperandDetail(props: OperandFieldsProps): ReactNode {
  return (
    <>
      <ReadingPicker {...props} />
      <ValuePicker {...props} />
      <InputPicker {...props} />
      <WeatherPicker {...props} />
    </>
  );
}

export function OperandFields(props: OperandFieldsProps): ReactNode {
  const { catalog, operand, sources, onChange } = props;
  const current = sourceOf(operand);
  return (
    <View className="gap-3">
      <Select
        label="Compare"
        value={current}
        options={sourceOptions(catalog, sources, current)}
        onChange={(source) => {
          const next = operandFor(source, catalog);
          if (next !== null) onChange(next);
        }}
      />
      <OperandDetail {...props} />
    </View>
  );
}
