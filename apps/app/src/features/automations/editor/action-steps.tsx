import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { ACTION_TYPES, blankAction, type ActionType } from '../model/blanks';
import { describeAction } from '../model/describe';
import type { ListChange } from '../model/editor-state';
import { ActionFields } from './action-fields';
import { AddMenu } from './add-menu';
import { addItems, choicesOf } from './add-items';
import { ACTION_KINDS, actionIcon } from './kinds';
import { BlockProblems, StepCard, movesOf } from './step-card';

function ActionStep({
  action,
  index,
  count,
  catalog,
  onChange,
}: {
  readonly action: Action;
  readonly index: number;
  readonly count: number;
  readonly catalog: Catalog;
  readonly onChange: (change: ListChange<Action>) => void;
}): ReactNode {
  return (
    <StepCard
      icon={actionIcon(action, catalog.allDevices)}
      kind={ACTION_KINDS[action.type].label}
      summary={describeAction(catalog.names, action)}
      onRemove={() => {
        onChange({ kind: 'remove', index });
      }}
      moves={
        count > 1
          ? movesOf(index, count, (by) => {
              onChange({ kind: 'move', index, by });
            })
          : null
      }
    >
      <ActionFields
        action={action}
        catalog={catalog}
        onChange={(item) => {
          onChange({ kind: 'set', index, item });
        }}
      />
    </StepCard>
  );
}

export function ActionSteps({
  actions,
  catalog,
  problems,
  onChange,
  types = ACTION_TYPES,
}: {
  readonly actions: readonly Action[];
  readonly catalog: Catalog;
  readonly problems: readonly string[];
  readonly onChange: (change: ListChange<Action>) => void;
  readonly types?: readonly ActionType[];
}): ReactNode {
  return (
    <View className="gap-3">
      {actions.map((action, index) => (
        <ActionStep
          key={`${String(index)}:${action.type}`}
          action={action}
          index={index}
          count={actions.length}
          catalog={catalog}
          onChange={onChange}
        />
      ))}
      <BlockProblems problems={problems} />
      <AddMenu
        label={actions.length === 0 ? 'Add an action' : 'Add another action'}
        items={addItems(
          types,
          ACTION_KINDS,
          (type) => blankAction(type, choicesOf(catalog)),
          onChange,
        )}
      />
    </View>
  );
}
