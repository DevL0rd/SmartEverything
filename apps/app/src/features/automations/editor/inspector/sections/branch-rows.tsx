import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FlowNode } from '@smarteverything/domain';
import { Button } from '../../../../../components/button';
import { Section } from '../../../../../components/section';
import { RowActions, RowTitle, newRowId } from './row-controls';
import type { SectionProps } from './section-types';

function BranchRow({
  section,
  node,
  index,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
  readonly index: number;
}): ReactNode {
  const { view, env, actions } = section;
  const rows = node.branches ?? [];
  const row = rows[index];
  if (row === undefined) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <RowTitle text={index === 0 ? 'If' : 'Otherwise if'} />
        <RowActions
          noun={`case ${String(index + 1)}`}
          index={index}
          count={rows.length}
          disabled={env.locked}
          canRemove={rows.length > 1}
          onMove={(to) => {
            actions.editRows(view.key, [{ t: 'branch.move', id: row.id, to }]);
          }}
          onRemove={() => {
            actions.editRows(view.key, [{ t: 'branch.remove', id: row.id }]);
          }}
        />
      </View>
      {env.renderValue({
        nodeKey: view.key,
        slot: `branch:${row.id}`,
        label: 'Condition',
        helper: undefined,
        type: { t: 'boolean' },
        control: { t: 'switch' },
        isStatic: false,
        required: true,
        value: row.when,
        message: undefined,
        onChange: (when) => {
          if (when !== null) actions.editRows(view.key, [{ t: 'branch.when', id: row.id, when }]);
        },
      })}
    </View>
  );
}

export function BranchRows({
  section,
  node,
}: {
  readonly section: SectionProps;
  readonly node: FlowNode;
}): ReactNode {
  const { view, env, actions } = section;
  return (
    <Section title="Cases">
      <View className="gap-4 px-4 py-2">
        {(node.branches ?? []).map((row, index) => (
          <BranchRow key={row.id} section={section} node={node} index={index} />
        ))}
        <Button
          label="Add a case"
          icon="plus"
          variant="tonal"
          disabled={env.locked}
          onPress={() => {
            actions.editRows(view.key, [{ t: 'branch.add', id: newRowId() }]);
          }}
        />
      </View>
    </Section>
  );
}
