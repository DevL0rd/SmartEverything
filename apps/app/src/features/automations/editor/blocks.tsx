import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../../components/section';
import type { Catalog } from '../data/use-automations';
import { TRIGGER_KINDS, blankTrigger, triggerAvailable } from '../model/blanks';
import { describeTrigger } from '../model/describe';
import type { Draft, DraftChange } from '../model/editor-state';
import { triggerKindOf } from '../model/kind-labels';
import type { Problems } from '../model/validate';
import { AddMenu, groupedOptions } from './add-menu';
import { OnlyIfFields } from './condition-list';
import { TRIGGER_LOOKS, triggerIcon } from './kinds';
import { StepList } from './step-list';
import { BlockProblems, StepCard } from './step-card';
import { TriggerFields } from './trigger-fields';
import { ROOT_BLOCK } from '../model/steps';

export interface BlockProps {
  readonly draft: Draft;
  readonly change: (change: DraftChange) => void;
  readonly catalog: Catalog;
  readonly problems: Problems | null;
}

const UNAVAILABLE: Readonly<Partial<Record<(typeof TRIGGER_KINDS)[number], string>>> = {
  device: 'Needs a device with a reading.',
  signal: 'No other signals are available.',
};

export function WhenBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  const { when } = draft.automation;
  return (
    <Section title="When">
      <View className="gap-3">
        {when.map((trigger, index) => (
          <StepCard
            key={trigger.id ?? String(index)}
            icon={triggerIcon(trigger, catalog.allDevices)}
            kind={TRIGGER_LOOKS[triggerKindOf(trigger)].label}
            summary={describeTrigger(catalog.names, trigger)}
            onRemove={() => {
              change({ type: 'when', change: { kind: 'remove', index } });
            }}
          >
            <TriggerFields
              catalog={catalog}
              trigger={trigger}
              onChange={(item) => {
                change({ type: 'when', change: { kind: 'set', index, item } });
              }}
            />
          </StepCard>
        ))}
        <BlockProblems problems={problems?.when ?? []} />
        <AddMenu
          label={when.length === 0 ? 'Add a trigger' : 'Add another trigger'}
          groups={() =>
            groupedOptions(
              TRIGGER_KINDS,
              TRIGGER_LOOKS,
              (kind) => {
                const item = blankTrigger(kind, catalog);
                if (item !== null) change({ type: 'when', change: { kind: 'add', item } });
              },
              (kind) => (triggerAvailable(kind, catalog) ? undefined : UNAVAILABLE[kind]),
            )
          }
        />
      </View>
    </Section>
  );
}

export function OnlyIfBlock({ draft, change, catalog, problems }: BlockProps): ReactNode {
  const { onlyIf } = draft.automation;
  return (
    <Section
      title="Only if"
      {...(onlyIf === undefined ? { footer: 'Optional. Without a condition it always runs.' } : {})}
    >
      <OnlyIfFields
        catalog={catalog}
        condition={onlyIf}
        onChange={(condition) => {
          change({ type: 'only-if', condition });
        }}
      />
      <BlockProblems problems={problems?.only ?? []} />
    </Section>
  );
}

export function ThenBlock({ draft, problems }: BlockProps): ReactNode {
  return (
    <Section title="Then">
      <StepList block={ROOT_BLOCK} steps={draft.automation.steps} />
      <BlockProblems problems={problems?.then ?? []} />
    </Section>
  );
}
