import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FlowNode } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { failAgainOps } from './catch-model';
import { ClassChips } from './class-chips';
import { RowTitle, newRowId } from './row-controls';
import type { SectionProps } from './section-types';

const CATCH_CAPTION = 'Leave every kind off to handle any failure. Fail again runs after Finally.';

function CatchRow({
  section,
  node,
  index,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
  readonly index: number;
}): ReactNode {
  const { view, env, actions } = section;
  const row = node.catches?.[index];
  if (row === undefined) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <RowTitle text={`Catch ${String(index + 1)}`} />
        <Button
          label="Remove"
          variant="text"
          icon="trash"
          disabled={env.locked}
          onPress={() => {
            actions.editRows(view.key, [{ t: 'catch.remove', id: row.id }]);
          }}
        />
      </View>
      <ClassChips
        label={`Failure kinds for catch ${String(index + 1)}`}
        classes={row.classes ?? []}
        disabled={env.locked}
        onChange={(classes) => {
          actions.editRows(view.key, [{ t: 'catch.classes', id: row.id, classes }]);
        }}
      />
      <Button
        label="Fail again"
        variant="outlined"
        icon="alert"
        disabled={env.locked}
        onPress={() => {
          actions.apply(failAgainOps(view.key, row.id, 'same'));
        }}
      />
    </View>
  );
}

export function CatchRows({
  section,
  node,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { view, env, actions } = section;
  return (
    <Section title="Catch">
      <View className="gap-4 px-4 py-2">
        {(node.catches ?? []).map((row, index) => (
          <CatchRow key={row.id} section={section} node={node} index={index} />
        ))}
        <Button
          label="Add a catch"
          icon="plus"
          variant="tonal"
          disabled={env.locked}
          onPress={() => {
            actions.editRows(view.key, [{ t: 'catch.add', id: newRowId() }]);
          }}
        />
        <Text variant="footnote" tone="variant">
          {CATCH_CAPTION}
        </Text>
      </View>
    </Section>
  );
}
