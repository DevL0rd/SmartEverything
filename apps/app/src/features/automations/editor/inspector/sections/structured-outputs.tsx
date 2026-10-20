import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FlowNode, StructuredOutput } from '@smarteverything/domain';
import { outputLabel } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { SelectRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { CommittedField } from './committed-field';
import { outputsOps } from './edits';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';
import {
  STRUCTURED_TYPES,
  addedOutput,
  laneValueSet,
  outputNameProblem,
  removedOutput,
  renamedOutput,
  structuredLanes,
  typeChoiceOf,
  typedOutput,
} from './structured-model';

interface OutputProps {
  readonly section: SectionProps;
  readonly node: FlowNode;
  readonly outputs: readonly StructuredOutput[];
  readonly output: StructuredOutput;
  readonly lanes: readonly string[];
}

function save(section: SectionProps, node: FlowNode, next: readonly StructuredOutput[]): void {
  section.actions.apply(outputsOps(node.key, next));
}

function LaneValues({ section, node, outputs, output, lanes }: OutputProps): ReactNode {
  const { env } = section;
  return (
    <View className="gap-2">
      {lanes.map((lane) =>
        env.renderValue({
          nodeKey: node.key,
          slot: `outputs.${output.name}.${lane}`,
          label: `In ${outputLabel(lane)}`,
          helper: undefined,
          type: output.type,
          control: undefined,
          isStatic: false,
          required: false,
          value: output.values[lane],
          message: undefined,
          onChange: (value) => {
            save(section, node, laneValueSet(outputs, output.name, lane, value));
          },
        }),
      )}
    </View>
  );
}

function OutputEditor(props: OutputProps): ReactNode {
  const { section, node, outputs, output } = props;
  const reserved = section.view.kind?.outputs.map((decl) => decl.name) ?? [];
  return (
    <View className="gap-2 py-2">
      <View className="px-4">
        <CommittedField
          label="Output name"
          value={output.name}
          disabled={section.env.locked}
          validate={(text) => outputNameProblem(outputs, reserved, output.name, text.trim())}
          onCommit={(text) => {
            save(section, node, renamedOutput(outputs, output.name, text.trim()));
          }}
        />
      </View>
      <List>
        <SelectRow
          title="Type"
          value={typeChoiceOf(output)}
          disabled={section.env.locked}
          options={STRUCTURED_TYPES.map((choice) => ({ value: choice.value, label: choice.label }))}
          onChange={(choice) => {
            save(section, node, typedOutput(outputs, output.name, choice));
          }}
        />
      </List>
      <View className="gap-2 px-4">
        <LaneValues {...props} />
        <Button
          label="Remove output"
          variant="text"
          icon="trash"
          disabled={section.env.locked}
          onPress={() => {
            save(section, node, removedOutput(outputs, output.name));
          }}
        />
      </View>
    </View>
  );
}

export function StructuredOutputs(section: SectionProps): ReactNode {
  const node = flowNodeOf(section.view);
  if (node === undefined) return null;
  const outputs = node.outputs ?? [];
  const lanes = structuredLanes(node);
  return (
    <Section title="Values this block gives out">
      {outputs.map((output) => (
        <OutputEditor
          key={output.name}
          section={section}
          node={node}
          outputs={outputs}
          output={output}
          lanes={lanes}
        />
      ))}
      <View className="gap-2 px-4 pt-2">
        <Button
          label="Add an output"
          icon="plus"
          variant="tonal"
          disabled={section.env.locked || lanes.length === 0}
          onPress={() => {
            save(section, node, addedOutput(outputs, lanes));
          }}
        />
        {lanes.length === 0 ? (
          <Text variant="footnote" tone="variant">
            Add a lane with its own name first, such as Otherwise, to give out a value per lane.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}
