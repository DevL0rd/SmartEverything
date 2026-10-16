import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Trigger } from '@smarteverything/domain';
import { Section } from '../../../components/section';
import type { Catalog } from '../data/use-automations';
import { TRIGGER_TYPES, blankTrigger } from '../model/blanks';
import { describeTrigger } from '../model/describe';
import type { Draft, DraftChange, ListChange } from '../model/editor-state';
import type { Problems } from '../model/validate';
import { ProgramSteps } from './program-steps';
import { ProgramConditions } from './program-conditions';
import { addItems, choicesOf } from './add-items';
import { AddMenu } from './add-menu';
import { TRIGGER_KINDS, triggerIcon } from './kinds';
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

export function OnlyIfBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  return (
    <Section title="Only if" footer="Optional. With no conditions it always runs.">
      <ProgramConditions
        conditions={{ mode: draft.mode, items: [...draft.conditions] }}
        catalog={catalog}
        onChange={(conditions) => {
          change({ type: 'replace-conditions', conditions });
        }}
      />
      <BlockProblems problems={problems?.only ?? []} />
    </Section>
  );
}

export function ThenBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  return (
    <Section title="Then">
      <ProgramSteps
        actions={draft.actions}
        catalog={catalog}
        onChange={(actions) => {
          change({ type: 'replace-actions', actions });
        }}
      />
      <BlockProblems problems={problems?.then ?? []} />
    </Section>
  );
}
