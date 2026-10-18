import type { ReactNode } from 'react';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import type { Catalog } from '../data/use-automations';
import { computersOf } from '../model/computer-steps';
import { NumberInput } from './number-input';

export function ComputerSelect({
  catalog,
  computer,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly computer: string;
  readonly onChange: (computer: string) => void;
}): ReactNode {
  const computers = computersOf(catalog.devices);
  return (
    <Select
      label="Computer"
      placeholder="Pick a computer"
      value={computers.some((device) => device.id === computer) ? computer : null}
      options={computers.map((device) => ({ value: device.id, label: device.label }))}
      onChange={onChange}
    />
  );
}

export function NameField({
  label,
  value,
  names,
  helper,
  anyLabel,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly names: readonly string[];
  readonly helper: string;
  readonly anyLabel?: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  if (names.length === 0) {
    return <TextField label={label} value={value} helper={helper} onChange={onChange} />;
  }
  const listed = value === '' || names.includes(value) ? names : [...names, value];
  const options = [
    ...(anyLabel === undefined ? [] : [{ value: '', label: anyLabel }]),
    ...listed.map((name) => ({ value: name, label: name })),
  ];
  return (
    <Select
      label={label}
      searchable
      placeholder="Pick one"
      value={value === '' && anyLabel === undefined ? null : value}
      options={options}
      onChange={onChange}
    />
  );
}

export function LevelField({
  label,
  unit,
  value,
  onChange,
}: {
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <NumberInput
      label={label}
      unit={unit}
      value={value}
      onChange={(next) => {
        if (next !== undefined) onChange(next);
      }}
    />
  );
}
