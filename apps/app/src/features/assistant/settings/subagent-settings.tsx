import { createElement, useState, type ReactNode } from 'react';
import type { AiAgentLoopSettings } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import type { SettingDefinition } from '../../../settings/types';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { known, owner, writeAssistant } from './assistant-write';

type Subagents = AiAgentLoopSettings['subagents'];

export type CapacityField = 'max_active' | 'max_depth';

interface CapacitySpec {
  readonly title: string;
  readonly description: string;
  readonly least: number;
}

const SPECS: Readonly<Record<CapacityField, CapacitySpec>> = {
  max_active: {
    title: 'Helpers at once',
    description: 'How many helpers may work at the same time in one chat.',
    least: 1,
  },
  max_depth: {
    title: 'Helper levels',
    description:
      'How many levels deep helpers may start helpers of their own. 0 turns helpers off.',
    least: 0,
  },
};

const HARNESS_DECIDES = 'Harness decides';

const DIGITS = String(Number.MAX_SAFE_INTEGER).length;

export function capacityProblem(field: CapacityField, text: string): string | null {
  const least = SPECS[field].least;
  if (!/^\d+$/.test(text)) return 'Use a whole number';
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return 'Use a smaller number';
  return value < least ? `Use ${String(least)} or more` : null;
}

export function withCapacity(
  loops: AiAgentLoopSettings,
  field: CapacityField,
  text: string,
): AiAgentLoopSettings {
  const value = text === '' ? undefined : Number(text);
  const valueOf = (key: CapacityField): number | undefined =>
    key === field ? value : loops.subagents[key];
  const depth = valueOf('max_depth');
  const active = valueOf('max_active');
  const subagents: Subagents = {
    ...(depth === undefined ? {} : { max_depth: depth }),
    ...(active === undefined ? {} : { max_active: active }),
  };
  return { ...loops, subagents };
}

function storedOf(field: CapacityField): (state: StoreState) => string {
  return (state) => {
    const value = state.assistant?.settings.agent_loops.subagents[field];
    return value === undefined ? '' : String(value);
  };
}

function CapacityRow({ field }: { readonly field: CapacityField }): ReactNode {
  const store = useEntityStore();
  const stored = useStoreSelector(storedOf(field));
  const [editing, setEditing] = useState(false);
  const spec = SPECS[field];
  return (
    <>
      <ListRow
        title={spec.title}
        subtitle={spec.description}
        wrapSubtitle
        value={stored === '' ? HARNESS_DECIDES : stored}
        chevron
        onPress={() => {
          setEditing(true);
        }}
      />
      <TextEditSheet
        request={
          editing
            ? {
                title: spec.title,
                label: spec.title,
                initial: stored,
                placeholder: HARNESS_DECIDES,
                helper: 'Leave empty to let the harness decide.',
                confirmLabel: 'Save',
                kind: 'number',
                maxLength: DIGITS,
                allowEmpty: true,
                problemOf: (text) => capacityProblem(field, text),
                save: async (text): Promise<void> => {
                  const loops = store.get().assistant?.settings.agent_loops;
                  if (loops === undefined) return;
                  await writeAssistant(
                    { agent_loops: withCapacity(loops, field, text) },
                    { state: store.get(), store },
                  );
                },
              }
            : null
        }
        onClose={() => {
          setEditing(false);
        }}
      />
    </>
  );
}

function capacitySetting(field: CapacityField, keywords: readonly string[]): SettingDefinition {
  return {
    id: `assistant.helpers.${field}`,
    page: 'assistant/helpers',
    title: SPECS[field].title,
    description: SPECS[field].description,
    keywords,
    scope: 'server',
    control: 'custom',
    row: true,
    visible: owner,
    when: known,
    render: () => createElement(CapacityRow, { field }),
  };
}

export const SUBAGENT_SETTINGS: readonly SettingDefinition[] = [
  capacitySetting('max_active', ['helpers', 'agents', 'at once', 'parallel', 'concurrent']),
  capacitySetting('max_depth', ['helpers', 'agents', 'depth', 'levels', 'nested', 'delegation']),
];
