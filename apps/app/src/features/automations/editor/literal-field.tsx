import type { ReactNode } from 'react';
import { type JsonValue, WEATHER_METRIC_INFO } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import type { Catalog } from '../data/use-automations';
import type { LiteralShape } from '../model/inputs';
import { DAY_MS } from '../../../format/time';
import { MILLISECOND_UNITS } from './duration-units';
import { Labelled } from './labelled';
import { NumberInput } from './number-input';
import { DurationField } from './time-fields';
import { ValueInput } from './value-input';

type KindShape = Extract<LiteralShape, { type: 'kind' }>;

interface FieldProps {
  readonly label: string;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
}

interface LiteralFieldProps extends FieldProps {
  readonly catalog: Catalog;
  readonly shape: LiteralShape;
}

function choiceOptions(
  catalog: Catalog,
  shape: KindShape,
): readonly { value: string; label: string }[] {
  if (shape.choices !== undefined)
    return shape.choices.map((choice) => ({ value: choice.id, label: choice.label }));
  return catalog.values.flatMap((row) =>
    row.content.kind === 'choice'
      ? row.content.choices.map((choice) => ({
          value: choice.id,
          label: `${row.content.name} · ${choice.label}`,
        }))
      : [],
  );
}

function FlagField({ label, value, onChange }: FieldProps): ReactNode {
  return (
    <Labelled label={label}>
      <Segmented
        label={label}
        value={value === true ? 'on' : 'off'}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={(next) => {
          onChange(next === 'on');
        }}
      />
    </Labelled>
  );
}

function NumberKindField({
  label,
  value,
  unit,
  onChange,
}: FieldProps & { readonly unit: string | null }): ReactNode {
  return (
    <NumberInput
      label={label}
      unit={unit}
      value={typeof value === 'number' ? value : undefined}
      onChange={(next) => {
        if (next !== undefined) onChange(next);
      }}
    />
  );
}

function DurationKindField({ label, value, onChange }: FieldProps): ReactNode {
  return (
    <DurationField
      label={label}
      value={typeof value === 'number' && value > 0 ? value : 1000}
      units={MILLISECOND_UNITS}
      max={DAY_MS}
      onChange={onChange}
    />
  );
}

function ChoiceField({
  catalog,
  shape,
  label,
  value,
  onChange,
}: FieldProps & { readonly catalog: Catalog; readonly shape: KindShape }): ReactNode {
  return (
    <Select
      label={label}
      searchable
      value={typeof value === 'string' ? value : null}
      options={choiceOptions(catalog, shape)}
      onChange={onChange}
    />
  );
}

function TextKindField({ label, value, onChange }: FieldProps): ReactNode {
  return (
    <TextField label={label} value={typeof value === 'string' ? value : ''} onChange={onChange} />
  );
}

function KindField({
  catalog,
  shape,
  ...field
}: FieldProps & { readonly catalog: Catalog; readonly shape: KindShape }): ReactNode {
  switch (shape.kind) {
    case 'flag':
      return <FlagField {...field} />;
    case 'number':
      return <NumberKindField {...field} unit={shape.unit ?? null} />;
    case 'duration':
      return <DurationKindField {...field} />;
    case 'choice':
      return <ChoiceField {...field} catalog={catalog} shape={shape} />;
    case 'text':
      return <TextKindField {...field} />;
  }
}

function WeatherField({
  metric,
  label,
  value,
  onChange,
}: FieldProps & { readonly metric: keyof typeof WEATHER_METRIC_INFO }): ReactNode {
  const info = WEATHER_METRIC_INFO[metric];
  return (
    <Labelled label={label}>
      <NumberStepper
        label={label}
        value={typeof value === 'number' ? value : info.min}
        min={info.min}
        max={info.max}
        step={info.step}
        onChange={onChange}
        {...(info.unit === null ? {} : { unit: info.unit })}
      />
    </Labelled>
  );
}

export function LiteralField({ catalog, shape, ...field }: LiteralFieldProps): ReactNode {
  if (shape.type === 'reading')
    return <ValueInput device={shape.device} capability={shape.capability} {...field} />;
  if (shape.type === 'weather') return <WeatherField metric={shape.metric} {...field} />;
  return <KindField catalog={catalog} shape={shape} {...field} />;
}
