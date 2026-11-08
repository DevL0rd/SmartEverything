import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../../components/badge';
import { Button } from '../../../../../components/button';
import { IconButton } from '../../../../../components/icon-button';
import { SchemaForm } from '../../../../../components/schema-form';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import type { Field } from '../schema-fields';
import { formOps, formSchema, formValues } from '../schema-fields';
import { portOps } from './edits';
import type { InputPart, InputRow } from './inputs-model';
import { deviceListOf, deviceListValue, inputOps, inputsModel, isGiven } from './inputs-model';
import type { InspectorFinding, SectionProps } from './section-types';

function messageFor(findings: readonly InspectorFinding[], port: string): string | undefined {
  return findings.find((found) => found.port === port)?.message;
}

function Heading({ row, helper }: { readonly row: InputRow; readonly helper: string }): ReactNode {
  const { field } = row;
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong">{field.title}</Text>
        {row.typeChip === '' ? null : <Badge label={row.typeChip} />}
      </View>
      {helper === '' ? null : (
        <Text variant="footnote" tone="variant">
          {helper}
        </Text>
      )}
    </View>
  );
}

function DeviceListRow({
  row,
  ids,
  section,
}: {
  readonly row: InputRow;
  readonly ids: readonly string[];
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  const { field } = row;
  const shown: InputRow = { ...row, typeChip: 'List of devices' };
  return env.renderValue({
    nodeKey: view.key,
    slot: field.name,
    label: field.title,
    helper: field.helper,
    type: undefined,
    control: { t: 'reference', of: 'target', capabilities: [] },
    isStatic: false,
    required: field.required,
    value: { lit: { devices: [...ids] } },
    message: messageFor(env.findings, field.name),
    heading: <Heading row={shown} helper={field.helper} />,
    onChange: (value) => {
      const next = value !== null && 'lit' in value ? { lit: deviceListValue(value.lit) } : value;
      actions.apply(inputOps(view, field.name, next));
    },
  });
}

function ValueRow({
  row,
  section,
}: {
  readonly row: InputRow;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  const { field } = row;
  const { helper } = field;
  return env.renderValue({
    nodeKey: view.key,
    slot: field.name,
    label: field.title,
    helper,
    type: undefined,
    control: field.control,
    isStatic: field.isStatic,
    required: field.required,
    value: row.value,
    message: messageFor(env.findings, field.name),
    heading: <Heading row={row} helper={helper} />,
    onChange: (value) => {
      actions.apply(inputOps(view, field.name, value));
    },
  });
}

function PortRow({
  row,
  section,
}: {
  readonly row: InputRow;
  readonly section: SectionProps;
}): ReactNode {
  const { view } = section;
  const ids = view.kind === undefined ? undefined : deviceListOf(view.kind, row);
  if (ids !== undefined) return <DeviceListRow row={row} ids={ids} section={section} />;
  return <ValueRow row={row} section={section} />;
}

function FormRows({
  fields,
  section,
}: {
  readonly fields: readonly Field[];
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  if (fields.length === 0) return null;
  const value = formValues(fields, view.node.ports);
  return (
    <SchemaForm
      schema={formSchema(fields)}
      value={value}
      disabled={env.locked}
      change={(next) => {
        actions.apply(formOps(view.key, fields, value, next));
      }}
    />
  );
}

function Added({
  row,
  section,
  onRemove,
}: {
  readonly row: InputRow;
  readonly section: SectionProps;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2 px-4">
      <View className="min-w-0 flex-1">
        {row.form ? (
          <FormRows fields={[row.field]} section={section} />
        ) : (
          <PortRow row={row} section={section} />
        )}
      </View>
      <IconButton
        icon="close"
        label={`Remove ${row.field.title}`}
        disabled={section.env.locked}
        onPress={onRemove}
      />
    </View>
  );
}

function Offers({
  rows,
  disabled,
  onReveal,
}: {
  readonly rows: readonly InputRow[];
  readonly disabled: boolean;
  readonly onReveal: (name: string) => void;
}): ReactNode {
  if (rows.length === 0) return null;
  return (
    <View className="gap-2 px-4">
      <Text variant="footnote" tone="variant">
        Also set
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {rows.map(({ field }) => (
          <Button
            key={field.name}
            label={field.title}
            spoken={`Set ${field.title}`}
            icon="plus"
            variant="outlined"
            disabled={disabled}
            onPress={() => {
              onReveal(field.name);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function MainRows({
  rows,
  section,
}: {
  readonly rows: readonly InputRow[];
  readonly section: SectionProps;
}): ReactNode {
  const form = rows.filter((row) => row.form).map((row) => row.field);
  return (
    <>
      {rows
        .filter((row) => !row.form)
        .map((row) => (
          <View key={row.field.name} className="px-4">
            <PortRow row={row} section={section} />
          </View>
        ))}
      {form.length === 0 ? null : (
        <View className="gap-3 px-4">
          <FormRows fields={form} section={section} />
        </View>
      )}
    </>
  );
}

function InputsPart({
  section,
  part,
  title,
}: {
  readonly section: SectionProps;
  readonly part: InputPart;
  readonly title: string;
}): ReactNode {
  const { view, env, actions } = section;
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  if (view.kind === undefined) return null;
  const { rows } = inputsModel(view.kind, view.node, part);
  if (rows.length === 0) return null;
  const main = rows.filter((row) => row.main);
  const extra = rows.filter((row) => !row.main);
  const added = extra.filter((row) => revealed.has(row.field.name) || isGiven(row));
  const offered = extra.filter((row) => !added.includes(row));
  const remove = (name: string): void => {
    setRevealed(new Set([...revealed].filter((item) => item !== name)));
    if (view.node.ports?.[name] !== undefined) actions.apply(portOps(view.key, name, null));
  };
  return (
    <Section title={title}>
      <View className="gap-5 py-2">
        <MainRows rows={main} section={section} />
        {added.map((row) => (
          <Added
            key={row.field.name}
            row={row}
            section={section}
            onRemove={() => {
              remove(row.field.name);
            }}
          />
        ))}
        <Offers
          rows={offered}
          disabled={env.locked}
          onReveal={(name) => {
            setRevealed(new Set([...revealed, name]));
          }}
        />
      </View>
    </Section>
  );
}

export function Inputs(section: SectionProps): ReactNode {
  return <InputsPart section={section} part="inputs" title="Inputs" />;
}

export function Timing(section: SectionProps): ReactNode {
  return <InputsPart section={section} part="timing" title="Timing" />;
}
