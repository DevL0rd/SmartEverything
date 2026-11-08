import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StructuredOutput } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { SelectRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { CommittedField } from './committed-field';
import type { GraphSectionProps } from './graph-connections-model';
import {
  VALUE_TYPES,
  addedOutput,
  afterName,
  hasValuesAfter,
  laneValueSet,
  outputNameProblem,
  outputsOps,
  removedOutput,
  renamedOutput,
  reservedOutputNames,
  typeChoiceOf,
  typedOutput,
  valueLanesOf,
  type ValueLane,
} from './graph-values-after-model';

interface OutputProps {
  readonly section: GraphSectionProps;
  readonly outputs: readonly StructuredOutput[];
  readonly output: StructuredOutput;
  readonly lanes: readonly ValueLane[];
}

function save(section: GraphSectionProps, next: readonly StructuredOutput[]): void {
  section.actions.apply(outputsOps(section.node.key, next));
}

function LaneValues({ section, outputs, output, lanes }: OutputProps): ReactNode {
  const { node, renderValue } = section;
  return (
    <View className="gap-2">
      {lanes.map((item) =>
        renderValue({
          nodeKey: node.key,
          slot: `outputs.${output.name}.${item.lane}`,
          label: `Value for ${item.label}`,
          helper: undefined,
          type: output.type,
          control: undefined,
          isStatic: false,
          required: false,
          value: output.values[item.lane],
          message: undefined,
          onChange: (value) => {
            save(section, laneValueSet(outputs, output.name, item.lane, value));
          },
        }),
      )}
    </View>
  );
}

function OutputEditor(props: OutputProps): ReactNode {
  const { section, outputs, output } = props;
  const { locked } = section;
  const reserved = reservedOutputNames(section.node, section.kinds);
  return (
    <View className="gap-2 py-2">
      <View className="px-4">
        <CommittedField
          label="Output name"
          helper={`Given out ${afterName(section.node.kind)}.`}
          value={output.name}
          disabled={locked}
          validate={(text) => outputNameProblem(outputs, reserved, output.name, text.trim())}
          onCommit={(text) => {
            save(section, renamedOutput(outputs, output.name, text.trim()));
          }}
        />
      </View>
      <List>
        <SelectRow
          title="Type"
          value={typeChoiceOf(output)}
          disabled={locked}
          options={VALUE_TYPES.map((choice) => ({ value: choice.value, label: choice.label }))}
          onChange={(choice) => {
            save(section, typedOutput(outputs, output.name, choice));
          }}
        />
      </List>
      <View className="gap-2 px-4">
        <LaneValues {...props} />
        <Button
          label="Remove output"
          variant="text"
          icon="trash"
          disabled={locked}
          onPress={() => {
            save(section, removedOutput(outputs, output.name));
          }}
        />
      </View>
    </View>
  );
}

export function GraphValuesAfter(section: GraphSectionProps): ReactNode {
  const { node, kinds, locked } = section;
  if (!hasValuesAfter(node)) return null;
  const outputs = node.outputs ?? [];
  const lanes = valueLanesOf(node, kinds);
  return (
    <Section title="Values after this">
      {outputs.map((output) => (
        <OutputEditor
          key={output.name}
          section={section}
          outputs={outputs}
          output={output}
          lanes={lanes}
        />
      ))}
      <View className="gap-2 px-4 pt-2">
        <Button
          label="Add a value"
          icon="plus"
          variant="tonal"
          disabled={locked || lanes.length === 0}
          onPress={() => {
            save(section, addedOutput(outputs, lanes));
          }}
        />
        {lanes.length === 0 ? (
          <Text variant="footnote" tone="variant">
            This step has no lane that can give a value of its own.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}
