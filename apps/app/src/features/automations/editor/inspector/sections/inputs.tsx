import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../../components/badge';
import { SchemaForm } from '../../../../../components/schema-form';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { formOps } from '../schema-fields';
import { portOps } from './edits';
import type { InputRow } from './inputs-model';
import { inputsModel } from './inputs-model';
import type { InspectorFinding, SectionProps } from './section-types';

function messageFor(findings: readonly InspectorFinding[], port: string): string | undefined {
  return findings.find((found) => found.port === port)?.message;
}

function PortRow({
  row,
  section,
}: {
  readonly row: InputRow;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  const { field } = row;
  return (
    <View className="gap-2 px-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong">{field.title}</Text>
        <Badge label={row.typeChip} />
        {field.required ? null : (
          <Text variant="footnote" tone="variant">
            Optional
          </Text>
        )}
      </View>
      {env.renderValue({
        nodeKey: view.key,
        slot: field.name,
        label: field.title,
        helper: field.helper,
        type: undefined,
        control: field.control,
        isStatic: field.isStatic,
        required: field.required,
        value: row.value,
        message: messageFor(env.findings, field.name),
        onChange: (value) => {
          actions.apply(portOps(view.key, field.name, value));
        },
      })}
    </View>
  );
}

export function Inputs(section: SectionProps): ReactNode {
  const { view, env, actions } = section;
  if (view.kind === undefined) return null;
  const model = inputsModel(view.kind, view.node);
  return (
    <Section title="Inputs">
      <View className="gap-4 py-2">
        {model.form.length === 0 ? null : (
          <View className="gap-3 px-4">
            <SchemaForm
              schema={model.formSchema}
              value={model.formValue}
              disabled={env.locked}
              change={(next) => {
                actions.apply(formOps(view.key, model.form, model.formValue, next));
              }}
            />
          </View>
        )}
        {model.rows.map((row) => (
          <PortRow key={row.field.name} row={row} section={section} />
        ))}
      </View>
    </Section>
  );
}
