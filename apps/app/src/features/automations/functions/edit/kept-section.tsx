import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FunctionV3, Variable } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { SelectRow, SwitchRow } from '../../../../components/rows';
import { List, Section } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { TYPE_OPTIONS } from '../../editor/header/type-choices';
import { CommittedField } from '../../editor/inspector/sections/committed-field';
import {
  KEPT_ACTION_ONLY,
  KEPT_EXPLAIN,
  KEPT_TITLE,
  addKept,
  editsStart,
  keptNameProblem,
  keptOf,
  keptTypeValue,
  removeKept,
  renameKept,
  retypeKept,
  setStart,
  setStartValue,
  startOf,
  startProblem,
} from './kept-model';

const TYPE_CHOICES = TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

export interface KeptSectionProps {
  readonly program: FunctionV3;
  readonly locked: boolean;
  readonly onProgram: (program: FunctionV3) => void;
}

function StartRow({
  program,
  variable,
  locked,
  onProgram,
}: KeptSectionProps & { readonly variable: Variable }): ReactNode {
  if (variable.type.t === 'boolean') {
    const on = 'lit' in variable.initial && variable.initial.lit === true;
    return (
      <SwitchRow
        title="Starts as yes"
        value={on}
        disabled={locked}
        onChange={(value) => {
          onProgram(setStartValue(program, variable.name, value));
        }}
      />
    );
  }
  if (!editsStart(variable)) return null;
  return (
    <View className="px-4 py-3">
      <CommittedField
        label="Start value"
        value={startOf(variable)}
        disabled={locked}
        helper="Used the first time each place runs."
        validate={(text) => startProblem(variable, text)}
        onCommit={(text) => {
          onProgram(setStart(program, variable, text));
        }}
      />
    </View>
  );
}

function KeptCard(props: KeptSectionProps & { readonly variable: Variable }): ReactNode {
  const { program, variable, locked, onProgram } = props;
  return (
    <List
      title={variable.name}
      action={
        <IconButton
          icon="trash"
          label={`Remove kept data ${variable.name}`}
          disabled={locked}
          onPress={() => {
            onProgram(removeKept(program, variable.name));
          }}
        />
      }
    >
      <View className="px-4 py-3">
        <CommittedField
          label="Name"
          value={variable.name}
          disabled={locked}
          validate={(text) => keptNameProblem(program, variable.name, text)}
          onCommit={(text) => {
            onProgram(renameKept(program, variable.name, text));
          }}
        />
      </View>
      <SelectRow
        title="Kind of value"
        value={keptTypeValue(variable)}
        disabled={locked}
        options={TYPE_CHOICES}
        onChange={(value) => {
          onProgram(retypeKept(program, variable.name, value));
        }}
      />
      <StartRow {...props} />
    </List>
  );
}

export function KeptSection(props: KeptSectionProps): ReactNode {
  const { program, locked, onProgram } = props;
  const kept = keptOf(program);
  const action = program.flavour === 'action';
  return (
    <Section title={KEPT_TITLE} caption={action ? KEPT_EXPLAIN : KEPT_ACTION_ONLY}>
      <View className="gap-4">
        {kept.length === 0 ? (
          <Text variant="footnote" tone="variant" className="px-4">
            Keeps nothing between runs.
          </Text>
        ) : (
          kept.map((variable) => <KeptCard key={variable.name} {...props} variable={variable} />)
        )}
        {action ? (
          <View className="flex-row px-4">
            <Button
              label="Add kept data"
              icon="plus"
              variant="tonal"
              disabled={locked}
              onPress={() => {
                onProgram(addKept(program));
              }}
            />
          </View>
        ) : null}
      </View>
    </Section>
  );
}
