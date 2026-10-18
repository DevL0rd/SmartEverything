import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ConditionV2 } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { CONDITION_KINDS, blankCondition } from '../model/blanks';
import { conditionOfGroup, rootGroup, type GroupMode } from '../model/conditions';
import { describeCondition } from '../model/describe';
import { changeList, type ListChange } from '../model/editor-state';
import { AddMenu, groupedOptions } from './add-menu';
import { CONDITION_LOOKS, conditionIcon } from './kinds';
import { ConditionFields } from './condition-fields';
import { StepCard } from './step-card';
import { conditionKindOf } from '../model/kind-labels';

interface GroupProps {
  readonly catalog: Catalog;
  readonly mode: GroupMode;
  readonly items: readonly ConditionV2[];
  readonly nested: boolean;
  readonly onChange: (mode: GroupMode, items: readonly ConditionV2[]) => void;
}

function groupItemOf(mode: GroupMode, catalog: Catalog): ConditionV2 | null {
  const first = blankCondition('compare', catalog);
  const inner: ConditionV2[] =
    first === null ? [{ time: { after: '22:00', before: '06:00' } }] : [first];
  return mode === 'all' ? { any: inner } : { all: inner };
}

function groupOptions(
  catalog: Catalog,
  mode: GroupMode,
  add: (item: ConditionV2) => void,
): ReturnType<typeof groupedOptions> {
  const looks = {
    ...CONDITION_LOOKS,
    any: mode === 'all' ? CONDITION_LOOKS.any : CONDITION_LOOKS.all,
  };
  return groupedOptions(CONDITION_KINDS, looks, (kind) => {
    const item = kind === 'any' ? groupItemOf(mode, catalog) : blankCondition(kind, catalog);
    if (item !== null) add(item);
  });
}

function ConditionBody({
  catalog,
  condition,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly condition: ConditionV2;
  readonly onChange: (condition: ConditionV2) => void;
}): ReactNode {
  if ('all' in condition || 'any' in condition) {
    const group = rootGroup(condition);
    return (
      <ConditionGroup
        catalog={catalog}
        mode={group.mode}
        items={group.items}
        nested
        onChange={(mode, items) => {
          onChange(conditionOfGroup({ mode, items }) ?? { all: [] });
        }}
      />
    );
  }
  if ('not' in condition)
    return (
      <View className="gap-3">
        <Text variant="callout" tone="variant">
          Holds when this does not.
        </Text>
        <ConditionBody
          catalog={catalog}
          condition={condition.not}
          onChange={(inner) => {
            onChange({ not: inner });
          }}
        />
      </View>
    );
  return <ConditionFields catalog={catalog} condition={condition} onChange={onChange} />;
}

function ConditionCard({
  catalog,
  condition,
  onChange,
  onRemove,
}: {
  readonly catalog: Catalog;
  readonly condition: ConditionV2;
  readonly onChange: (condition: ConditionV2) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <StepCard
      kind={CONDITION_LOOKS[conditionKindOf(condition)].label}
      icon={conditionIcon(condition)}
      summary={describeCondition(catalog.names, condition)}
      onRemove={onRemove}
    >
      <ConditionBody catalog={catalog} condition={condition} onChange={onChange} />
    </StepCard>
  );
}

function ConditionGroup({ catalog, mode, items, nested, onChange }: GroupProps): ReactNode {
  const apply = (change: ListChange<ConditionV2>): void => {
    onChange(mode, changeList(items, change));
  };
  return (
    <View className="gap-3">
      {!nested && items.length >= 2 ? (
        <Select
          label="Match"
          value={mode}
          options={[
            { value: 'all', label: 'All conditions' },
            { value: 'any', label: 'Any condition' },
          ]}
          onChange={(next) => {
            onChange(next, items);
          }}
        />
      ) : null}
      {items.map((condition, index) => (
        <ConditionCard
          key={String(index)}
          catalog={catalog}
          condition={condition}
          onChange={(item) => {
            apply({ kind: 'set', index, item });
          }}
          onRemove={() => {
            apply({ kind: 'remove', index });
          }}
        />
      ))}
      <AddMenu
        label={items.length === 0 ? 'Add a condition' : 'Add another condition'}
        groups={() =>
          groupOptions(catalog, mode, (item) => {
            apply({ kind: 'add', item });
          })
        }
      />
    </View>
  );
}

export function OnlyIfFields({
  catalog,
  condition,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly condition: ConditionV2 | undefined;
  readonly onChange: (condition: ConditionV2 | undefined) => void;
}): ReactNode {
  const group = rootGroup(condition);
  return (
    <ConditionGroup
      catalog={catalog}
      mode={group.mode}
      items={group.items}
      nested={false}
      onChange={(mode, items) => {
        onChange(conditionOfGroup({ mode, items }));
      }}
    />
  );
}
