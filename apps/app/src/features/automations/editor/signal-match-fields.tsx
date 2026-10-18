import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  SIGNAL_SOURCES,
  kindSpecOf,
  type JsonValue,
  type SignalMatchSpec,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { changedMatch, matchValue, type Match } from '../model/signal-match';

interface MatchProps {
  readonly source: string;
  readonly kind: string;
  readonly match: Match | undefined;
  readonly onChange: (match: Match | undefined) => void;
}

function valueText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function TextMatchField({
  spec,
  ...props
}: MatchProps & { readonly spec: SignalMatchSpec }): ReactNode {
  const value = props.match?.[spec.key];
  return (
    <View className="gap-1">
      <TextField
        label={spec.label}
        value={value === undefined ? '' : valueText(value)}
        helper="Exact text or JSON value"
        onChange={(text) => {
          props.onChange(changedMatch(props.match, spec.key, matchValue(text)));
        }}
      />
      <Button
        label={`Clear ${spec.label}`}
        variant="text"
        onPress={() => {
          props.onChange(changedMatch(props.match, spec.key, undefined));
        }}
      />
    </View>
  );
}

function MatchField({
  spec,
  ...props
}: MatchProps & { readonly spec: SignalMatchSpec }): ReactNode {
  const value = props.match?.[spec.key];
  const change = (next: JsonValue | undefined): void => {
    props.onChange(changedMatch(props.match, spec.key, next));
  };
  if (spec.values === null) {
    return <TextMatchField spec={spec} {...props} />;
  }
  const options = spec.values.map((item) => ({
    value: JSON.stringify(item),
    label: spec.valueLabels?.[item] ?? item,
  }));
  const selected = value === undefined ? '' : JSON.stringify(value);
  const retained =
    value === undefined || options.some((option) => option.value === selected)
      ? []
      : [{ value: selected, label: `Saved: ${valueText(value)}` }];
  return (
    <Select
      label={spec.label}
      value={selected}
      searchable
      options={[
        {
          value: '',
          label: spec.key === 'detection' && props.kind === 'sound' ? 'Any sound' : 'Any value',
        },
        ...options,
        ...retained,
      ]}
      onChange={(next) => {
        change(next === '' ? undefined : matchValue(next));
      }}
    />
  );
}

export function SignalMatchFields(props: MatchProps): ReactNode {
  const specs = kindSpecOf(SIGNAL_SOURCES, props)?.match ?? [];
  const match = props.match ?? {};
  const shown = specs.filter((spec) => spec.key === 'detection' || Object.hasOwn(match, spec.key));
  const unknown = Object.keys(match).filter((key) => !specs.some((spec) => spec.key === key));
  const available = specs.filter((spec) => !shown.includes(spec));
  return (
    <View className="gap-3">
      {[
        ...shown,
        ...unknown.map((key) => ({ key, label: `Saved filter: ${key}`, values: null })),
      ].map((spec) => (
        <MatchField key={spec.key} spec={spec} {...props} />
      ))}
      {available.length === 0 ? null : (
        <Select
          label="Add detail filter"
          value={null}
          searchable
          options={available.map((spec) => ({ value: spec.key, label: spec.label }))}
          onChange={(key) => {
            const spec = available.find((entry) => entry.key === key);
            if (spec !== undefined) {
              props.onChange(changedMatch(props.match, key, spec.values?.[0] ?? ''));
            }
          }}
        />
      )}
    </View>
  );
}
