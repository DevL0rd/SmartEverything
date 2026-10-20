import type { ReactNode } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import type { ReferenceOption } from './value-services';
import { useValueServices } from './value-services';

const SEARCHABLE_FROM = 7;

export interface ReferencePickerProps {
  readonly of: string;
  readonly capabilities: readonly string[];
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

export function referenceOptionsOf(
  options: readonly ReferenceOption[],
  current: JsonValue | undefined,
): readonly { readonly value: string; readonly label: string }[] {
  const known = options.map((option) => ({ value: option.id, label: option.label }));
  if (typeof current !== 'string' || options.some((option) => option.id === current)) return known;
  return [...known, { value: current, label: 'Removed' }];
}

export function ReferencePicker({
  of,
  capabilities,
  label,
  value,
  disabled,
  onChange,
}: ReferencePickerProps): ReactNode {
  const { references } = useValueServices();
  const options = referenceOptionsOf(references.options(of), value);
  return (
    <>
      <Select
        label={label}
        disabled={disabled}
        searchable={options.length > SEARCHABLE_FROM}
        value={typeof value === 'string' ? value : null}
        placeholder="Pick one"
        options={options}
        onChange={onChange}
      />
      {capabilities.length === 0 ? null : (
        <Text variant="footnote" tone="variant">
          Only things that can do what this step needs are listed.
        </Text>
      )}
    </>
  );
}
