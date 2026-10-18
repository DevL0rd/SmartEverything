import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LegacyAction as Action } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { ACTION_TYPES, blankAction, type ActionType, type Choices } from '../model/action-blanks';
import { describeAction } from '../model/describe-action';
import type { ListChange } from '../model/editor-state';
import { ActionFields } from './action-fields';
import { AddMenu, type AddGroup } from './add-menu';
import { ACTION_KINDS, actionIcon } from './action-kinds';
import { BlockProblems, StepCard, movesOf } from './step-card';

function choicesOf(catalog: Catalog): Choices {
  return {
    devices: catalog.devices,
    sceneIds: catalog.scenes.map((scene) => scene.id),
    wakeProfileId: catalog.wakeProfileId,
  };
}

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

function actionGroups(
  catalog: Catalog,
  types: readonly ActionType[],
  onChange: (change: ListChange<Action>) => void,
): readonly AddGroup[] {
  const choices = choicesOf(catalog);
  const entries = types.flatMap((type) => {
    const item = blankAction(type, choices);
    return item === null
      ? []
      : [
          {
            key: type,
            label: ACTION_KINDS[type].label,
            help: '',
            icon: ACTION_KINDS[type].icon,
            onPress: (): void => {
              onChange({ kind: 'add', item });
            },
          },
        ];
  });
  return entries.length === 0 ? [] : [{ title: 'Steps', options: entries }];
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
        groups={() => actionGroups(catalog, types, onChange)}
      />
    </View>
  );
}
