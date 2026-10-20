import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Variable } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { SelectRow, SwitchRow } from '../../../../components/rows';
import { List, Section } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { CommittedField } from '../inspector/sections/committed-field';
import { controlOf } from '../inspector/schema-fields';
import type { HeaderEnv, HeaderSectionProps } from './header-types';
import { TYPE_OPTIONS } from './type-choices';
import {
  KEEP_EXPLAIN,
  KEEP_TITLE,
  RUN_EXPLAIN,
  addVariable,
  removeVariable,
  renameVariable,
  retypeVariable,
  setInitial,
  setKeep,
  typeValueOfVariable,
  variableLine,
  variableProblem,
} from './variables-model';
import { renameBlocked, variableInUse } from './usage';

const TYPE_CHOICES = TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

function variableRows(env: HeaderEnv, variable: Variable): ReactNode[] {
  const { variables } = env.program;
  return [
    <View key="name" className="px-4 py-3">
      <CommittedField
        label="Name"
        value={variable.name}
        disabled={env.locked}
        validate={(text) =>
          text !== variable.name && variableInUse(env.program, variable.name)
            ? renameBlocked('variable', variable.name)
            : variableProblem(variables, variable.name, text)
        }
        onCommit={(text) => {
          env.apply([renameVariable(variables, variable.name, text)]);
        }}
      />
    </View>,
    <SelectRow
      key="type"
      title="Kind of value"
      value={typeValueOfVariable(variable)}
      disabled={env.locked}
      options={TYPE_CHOICES}
      onChange={(value) => {
        env.apply([retypeVariable(variables, variable.name, value)]);
      }}
    />,
    <View key="initial" className="px-4 py-3">
      {env.renderValue({
        nodeKey: env.anchorKey,
        slot: `variable.${variable.name}`,
        label: 'Start value',
        helper:
          variable.persist === true ? 'Used only the first time.' : 'Every run starts from this.',
        type: variable.type,
        control: controlOf(variable.type),
        isStatic: false,
        required: true,
        value: variable.initial,
        message: undefined,
        onChange: (value) => {
          if (value !== null) env.apply([setInitial(variables, variable.name, value)]);
        },
      })}
    </View>,
  ];
}

function VariableCard({
  env,
  variable,
}: {
  readonly env: HeaderEnv;
  readonly variable: Variable;
}): ReactNode {
  const { variables } = env.program;
  const keep = variable.persist === true;
  return (
    <List
      title={variable.name}
      caption={variableLine(variable)}
      action={
        <IconButton
          icon="trash"
          label={`Remove variable ${variable.name}`}
          disabled={env.locked}
          onPress={() => {
            env.apply([removeVariable(variables, variable.name)]);
          }}
        />
      }
    >
      {variableRows(env, variable)}
      <SwitchRow
        key="keep"
        title={KEEP_TITLE}
        subtitle={keep ? KEEP_EXPLAIN : RUN_EXPLAIN}
        wrapSubtitle
        value={keep}
        disabled={env.locked}
        onChange={(on) => {
          env.apply([setKeep(variables, variable.name, on)]);
        }}
      />
    </List>
  );
}

export function VariablesSection({ env }: HeaderSectionProps): ReactNode {
  const { variables } = env.program;
  return (
    <Section title="Run variables" caption="Values the steps can read and change">
      <View className="gap-4">
        {variables.length === 0 ? (
          <Text variant="footnote" tone="variant" className="px-4">
            No variables yet.
          </Text>
        ) : (
          variables.map((variable) => (
            <VariableCard key={variable.name} env={env} variable={variable} />
          ))
        )}
        <View className="flex-row px-4">
          <Button
            label="Add variable"
            icon="plus"
            variant="tonal"
            disabled={env.locked}
            onPress={() => {
              env.apply([addVariable(variables)]);
            }}
          />
        </View>
      </View>
    </Section>
  );
}
