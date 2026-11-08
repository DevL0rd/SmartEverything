import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { CommittedField } from './committed-field';
import type { GraphSectionProps } from './graph-connections-model';
import {
  addPathOps,
  nextPathName,
  pathNameProblem,
  pathsOf,
  removePathOps,
  renamePathOps,
  type PathRow,
  type PathsModel,
} from './graph-paths-model';
import { RowActions } from './row-controls';

function PathLine({
  section,
  model,
  row,
  index,
}: {
  readonly section: GraphSectionProps;
  readonly model: PathsModel;
  readonly row: PathRow;
  readonly index: number;
}): ReactNode {
  const { node, locked, actions } = section;
  const names = model.rows.map((item) => item.name);
  return (
    <View className="gap-1">
      <View className="flex-row items-end gap-2">
        <View className="flex-1">
          <CommittedField
            label={`Path ${String(index + 1)}`}
            value={row.name}
            disabled={locked}
            validate={(text) => pathNameProblem(names, row.name, text.trim())}
            onCommit={(text) => {
              actions.apply(renamePathOps(node.key, row.name, text.trim()));
            }}
          />
        </View>
        <RowActions
          noun={`path ${row.name}`}
          index={index}
          count={names.length}
          disabled={locked}
          canRemove={model.canRemove}
          onRemove={() => {
            actions.apply(removePathOps(node.key, row.name));
          }}
        />
      </View>
      <Text variant="footnote" tone="variant">
        {row.text}
      </Text>
    </View>
  );
}

export function GraphPaths(section: GraphSectionProps): ReactNode {
  const { program, node, kinds, locked, actions } = section;
  const model = pathsOf(program, node, kinds);
  if (model === undefined) return null;
  const names = model.rows.map((row) => row.name);
  return (
    <Section title="Paths">
      <View className="gap-4 px-4 py-2">
        {model.rows.map((row, index) => (
          <PathLine key={row.name} section={section} model={model} row={row} index={index} />
        ))}
        <Button
          label="Add a path"
          icon="plus"
          variant="tonal"
          disabled={locked}
          onPress={() => {
            actions.apply(addPathOps(node.key, nextPathName(names)));
          }}
        />
        <Text variant="footnote" tone="variant">
          {model.joinName === undefined
            ? `Keep at least ${String(model.minimum)} paths.`
            : `Every path ends at ${model.joinName}. A new path goes straight there. Keep at least ${String(model.minimum)} paths.`}
        </Text>
      </View>
    </Section>
  );
}
