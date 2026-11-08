import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { ActionRow } from '../../../../../components/rows';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { useAutomations } from '../../../data/use-automations';
import {
  NO_INPUTS,
  calledInputsModel,
  clearLeftoverOps,
  leftoverNote,
  type CalledInputRow,
  type CalledInputsModel,
  type CalledLookup,
} from './called-inputs-model';
import { portOps } from './edits';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

function useCalledLookup(): CalledLookup {
  const { byId } = useAutomations();
  return useMemo(
    (): CalledLookup => (id) => {
      const row = byId.get(id);
      return row === undefined
        ? undefined
        : { name: row.name, enabled: row.enabled, inputs: row.definition.inputs };
    },
    [byId],
  );
}

function Note({ children }: { readonly children: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      {children}
    </Text>
  );
}

function InputField({
  row,
  section,
}: {
  readonly row: CalledInputRow;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  const { port, title } = row;
  return (
    <View className="px-4">
      {env.renderValue({
        nodeKey: view.key,
        slot: port.name,
        label: title,
        helper: port.description,
        type: port.type,
        control: row.control,
        isStatic: false,
        required: row.required,
        value: row.value,
        message: env.findings.find((found) => found.port === port.name)?.message,
        heading: (
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="body-strong">{title}</Text>
            {port.description === undefined ? null : (
              <Text variant="footnote" tone="variant">
                {port.description}
              </Text>
            )}
          </View>
        ),
        onChange: (value) => {
          actions.apply(portOps(view.key, port.name, value));
        },
      })}
    </View>
  );
}

function Leftover({
  name,
  names,
  section,
}: {
  readonly name: string;
  readonly names: readonly string[];
  readonly section: SectionProps;
}): ReactNode {
  if (names.length === 0) return null;
  const { view, env, actions } = section;
  return (
    <ActionRow
      title={names.length === 1 ? 'Remove the old input' : 'Remove the old inputs'}
      subtitle={`${names.join(', ')}: ${leftoverNote(name)}`}
      icon="trash"
      destructive
      disabled={env.locked}
      onPress={() => {
        actions.apply(clearLeftoverOps(view.key, names));
      }}
    />
  );
}

function Ready({
  model,
  section,
}: {
  readonly model: Extract<CalledInputsModel, { kind: 'ready' }>;
  readonly section: SectionProps;
}): ReactNode {
  return (
    <>
      {model.off === null ? null : <Note>{model.off}</Note>}
      {model.rows.length === 0 ? <Note>{NO_INPUTS}</Note> : null}
      {model.rows.map((row) => (
        <InputField key={row.port.name} row={row} section={section} />
      ))}
      <Leftover name={model.name} names={model.leftover} section={section} />
    </>
  );
}

export function CalledInputs(section: SectionProps): ReactNode {
  const lookup = useCalledLookup();
  const node = flowNodeOf(section.view);
  const { kind } = section.view;
  if (node === undefined || kind === undefined) return null;
  const model = calledInputsModel(kind, node, lookup);
  if (model.kind === 'none') return null;
  return (
    <Section title="Inputs it gets">
      <View className="gap-5 py-2">
        {model.kind === 'missing' ? (
          <Note>{model.reason}</Note>
        ) : (
          <Ready model={model} section={section} />
        )}
      </View>
    </Section>
  );
}
