import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Condition, Trigger } from '@smarteverything/domain';
import { Section } from '../../../components/section';
import { Select } from '../../../components/select';
import type { Catalog } from '../data/use-automations';
import { CONDITION_TYPES, TRIGGER_TYPES, blankCondition, blankTrigger } from '../model/blanks';
import { describeCondition, describeTrigger } from '../model/describe';
import type { Draft, DraftChange, ListChange } from '../model/editor-state';
import type { Problems } from '../model/validate';
import { ActionSteps } from './action-steps';
import { addItems, choicesOf } from './add-items';
import { AddMenu } from './add-menu';
import { ConditionFields } from './condition-fields';
import { CONDITION_KINDS, TRIGGER_KINDS, conditionIcon, triggerIcon } from './kinds';
import { BlockProblems, StepCard } from './step-card';
import { TriggerFields } from './trigger-fields';

export interface BlockProps {
  readonly draft: Draft;
  readonly change: (change: DraftChange) => void;
  readonly catalog: Catalog;
  readonly problems: Problems | null;
}

export function WhenBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  const apply = (next: ListChange<Trigger>): void => {
    change({ type: 'triggers', change: next });
  };
  return (
    <Section title="When">
      <View className="gap-3">
        {draft.triggers.map((trigger, index) => (
          <StepCard
            key={`${String(index)}:${trigger.type}`}
            icon={triggerIcon(trigger, catalog.allDevices)}
            kind={TRIGGER_KINDS[trigger.type].label}
            summary={describeTrigger(catalog.names, trigger)}
            onRemove={() => {
              apply({ kind: 'remove', index });
            }}
          >
            <TriggerFields
              trigger={trigger}
              devices={catalog.devices}
              onChange={(item) => {
                apply({ kind: 'set', index, item });
              }}
            />
          </StepCard>
        ))}
        <BlockProblems problems={problems?.when ?? []} />
        <AddMenu
          label={draft.triggers.length === 0 ? 'Add a trigger' : 'Add another trigger'}
          items={addItems(
            TRIGGER_TYPES,
            TRIGGER_KINDS,
            (type) => blankTrigger(type, choicesOf(catalog)),
            apply,
          )}
        />
      </View>
    </Section>
  );
}

function ModeSelect({ draft, change }: Pick<BlockProps, 'draft' | 'change'>): ReactNode {
  return (
    <Select
      label="Conditions to match"
      showLabel={false}
      value={draft.mode}
      options={[
        { value: 'all', label: 'All of these' },
        { value: 'any', label: 'Any of these' },
      ]}
      onChange={(mode) => {
        change({ type: 'mode', mode });
      }}
    />
  );
}

export function OnlyIfBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  const apply = (next: ListChange<Condition>): void => {
    change({ type: 'conditions', change: next });
  };
  return (
    <Section
      title="Only if"
      {...(draft.conditions.length === 0
        ? { footer: 'Optional. Without one it always runs.' }
        : {})}
    >
      <View className="gap-3">
        {draft.conditions.length > 1 ? <ModeSelect draft={draft} change={change} /> : null}
        {draft.conditions.map((condition, index) => (
          <StepCard
            key={`${String(index)}:${condition.type}`}
            icon={conditionIcon(condition, catalog.allDevices)}
            kind={CONDITION_KINDS[condition.type].label}
            summary={describeCondition(catalog.names, condition)}
            onRemove={() => {
              apply({ kind: 'remove', index });
            }}
          >
            <ConditionFields
              condition={condition}
              devices={catalog.devices}
              onChange={(item) => {
                apply({ kind: 'set', index, item });
              }}
            />
          </StepCard>
        ))}
        <BlockProblems problems={problems?.only ?? []} />
        <AddMenu
          label="Add a condition"
          items={addItems(
            CONDITION_TYPES,
            CONDITION_KINDS,
            (type) => blankCondition(type, choicesOf(catalog)),
            apply,
          )}
        />
      </View>
    </Section>
  );
}

export function ThenBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  return (
    <Section title="Then">
      <ActionSteps
        actions={draft.actions}
        catalog={catalog}
        problems={problems?.then ?? []}
        onChange={(next) => {
          change({ type: 'actions', change: next });
        }}
      />
    </Section>
  );
}
