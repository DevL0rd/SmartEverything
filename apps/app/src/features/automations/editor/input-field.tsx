import type { ReactNode } from 'react';
import { View } from 'react-native';
import { isFrom, type InputV2, type JsonValue, type OperandV2 } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import type { CommandField } from '../model/command-input';
import {
  defaultFor,
  firstReading,
  inputsFitting,
  kindOfShape,
  operandInfo,
  readingsFitting,
  valuesFitting,
  type Kind,
  type LiteralShape,
} from '../model/inputs';
import { InputOffsetFields } from './input-offset-fields';
import { ValueLibraryButtons } from './library-buttons';
import { LiteralField } from './literal-field';
import { ArgumentInput } from './schema-arguments-input';
import { TargetFields } from './target-fields';

type Source = 'fixed' | 'value' | 'reading' | 'input';
type FromInput = Extract<InputV2, { from: unknown }>;

const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  fixed: 'A fixed value',
  value: 'A Value',
  reading: 'A device reading',
  input: 'An input',
};

function sourceOf(input: InputV2): Source {
  if (!isFrom(input)) return 'fixed';
  if ('value' in input.from) return 'value';
  return 'input' in input.from ? 'input' : 'reading';
}

function operandFor(source: Source, catalog: Catalog, kind: Kind): OperandV2 | null {
  switch (source) {
    case 'fixed':
      return null;
    case 'value': {
      const row = valuesFitting(catalog, kind)[0] ?? catalog.values[0];
      return row === undefined ? null : { value: row.id };
    }
    case 'reading': {
      const reading = firstReading(catalog, kind);
      return reading === null
        ? null
        : { device: reading.device.id, control: reading.capability.key };
    }
    case 'input': {
      const declared = inputsFitting(catalog, kind)[0];
      return declared === undefined ? null : { input: declared.name };
    }
  }
}

function available(catalog: Catalog, kind: Kind): readonly Source[] {
  return [
    'fixed',
    ...(valuesFitting(catalog, kind).length > 0 ? (['value'] as const) : []),
    ...(firstReading(catalog, kind) === null ? [] : (['reading'] as const)),
    ...(inputsFitting(catalog, kind).length > 0 ? (['input'] as const) : []),
  ];
}

interface DetailProps {
  readonly catalog: Catalog;
  readonly kind: Kind;
  readonly input: FromInput;
  readonly onChange: (input: InputV2) => void;
}

function ValueSource({ catalog, kind, input, onChange }: DetailProps): ReactNode {
  const operand = input.from;
  const info = operandInfo(catalog, operand);
  if (!('value' in operand)) return null;
  return (
    <View className="gap-1">
      <Select
        label="Value"
        searchable
        value={operand.value}
        options={valuesFitting(catalog, kind).map((row) => ({
          value: row.id,
          label: row.content.name,
        }))}
        onChange={(value) => {
          onChange({ ...input, from: { value } });
        }}
      />
      <ValueLibraryButtons
        row={info.source === 'value' ? info.row : null}
        kind={info.source === 'value' ? info.row.content.kind : 'boolean'}
        onSelect={(row) => {
          onChange({ ...input, from: { value: row.id } });
        }}
      />
    </View>
  );
}

function InputSource({ catalog, kind, input, onChange }: DetailProps): ReactNode {
  const operand = input.from;
  if (!('input' in operand)) return null;
  return (
    <Select
      label="Input"
      value={operand.input}
      options={inputsFitting(catalog, kind).map((entry) => ({
        value: entry.name,
        label: entry.name,
      }))}
      onChange={(name) => {
        onChange({ ...input, from: { input: name } });
      }}
    />
  );
}

function ReadingSource({ catalog, kind, input, onChange }: DetailProps): ReactNode {
  const operand = input.from;
  if (!('device' in operand)) return null;
  return (
    <TargetFields
      devices={catalog.devices}
      usable={(device) => readingsFitting(device, kind)}
      deviceId={operand.device}
      capability={operand.control}
      onTarget={(device, capability) => {
        onChange({ ...input, from: { device: device.id, control: capability.key } });
      }}
    />
  );
}

function SourceDetail(props: DetailProps): ReactNode {
  const info = operandInfo(props.catalog, props.input.from);
  if (info.source === 'missing')
    return (
      <Text variant="callout" tone="critical">
        {info.problem}
      </Text>
    );
  return (
    <>
      <ValueSource {...props} />
      <InputSource {...props} />
      <ReadingSource {...props} />
    </>
  );
}

interface InputFieldProps {
  readonly catalog: Catalog;
  readonly shape: LiteralShape;
  readonly label: string;
  readonly input: InputV2;
  readonly onChange: (input: InputV2) => void;
  readonly argument?: CommandField;
}

function FixedValue({
  catalog,
  shape,
  label,
  input,
  onChange,
  argument,
}: Omit<InputFieldProps, 'input'> & { readonly input: JsonValue }): ReactNode {
  if (argument === undefined)
    return (
      <LiteralField
        catalog={catalog}
        shape={shape}
        label={label}
        value={input}
        onChange={onChange}
      />
    );
  return (
    <ArgumentInput
      name={argument.name}
      parameter={argument.parameter}
      value={input}
      optional={!argument.required}
      onChange={(next) => {
        if (next !== undefined) onChange(next);
      }}
    />
  );
}

function SourcePicker({ catalog, shape, input, onChange }: InputFieldProps): ReactNode {
  const kind = kindOfShape(shape) ?? 'text';
  const source = sourceOf(input);
  const sources = available(catalog, kind);
  if (sources.length < 2 && source === 'fixed') return null;
  return (
    <Select
      label="Take the value from"
      value={source}
      options={(sources.includes(source) ? sources : [...sources, source]).map((entry) => ({
        value: entry,
        label: SOURCE_LABELS[entry],
      }))}
      onChange={(next) => {
        if (next === 'fixed') {
          onChange(defaultFor(shape));
          return;
        }
        const operand = operandFor(next, catalog, kind);
        if (operand !== null) onChange({ from: operand });
      }}
    />
  );
}

export function InputField(props: InputFieldProps): ReactNode {
  const { catalog, shape, input, onChange } = props;
  const kind = kindOfShape(shape) ?? 'text';
  return (
    <View className="gap-3">
      <SourcePicker {...props} />
      {isFrom(input) ? (
        <>
          <SourceDetail catalog={catalog} kind={kind} input={input} onChange={onChange} />
          {kind === 'number' || kind === 'duration' ? (
            <InputOffsetFields input={input} onChange={onChange} />
          ) : null}
        </>
      ) : (
        <FixedValue {...props} input={input} />
      )}
    </View>
  );
}
