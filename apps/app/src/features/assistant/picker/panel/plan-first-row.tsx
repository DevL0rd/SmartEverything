import type { ReactNode } from 'react';
import { SwitchRow } from '../../../../components/rows';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { planModeView } from '../../plan/plan-model';
import { useHarnessCommand } from '../../plan/use-harness-command';
import { KeyedRow } from './panel-chrome';

export const PLAN_FIRST_ROW = 'plan';

export interface PlanFirst {
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly subtitle: string;
  readonly toggle: () => void;
}

export function usePlanFirst(): PlanFirst | null {
  const chat = useEngineAccessory()?.chat;
  const engine = chat?.engine;
  const dsh = engine?.kind === 'dsh' ? chat : undefined;
  const command = useHarnessCommand(dsh);
  if (dsh === undefined) return null;
  const mode = planModeView(command.plan);
  return {
    enabled: mode.line === '/plan off',
    disabled: command.reason !== null || command.running !== null,
    subtitle: command.running === null ? (command.reason ?? mode.status) : 'Changing plan mode…',
    toggle: (): void => {
      command.run(mode.line);
    },
  };
}

export function PlanFirstRow({ plan }: { readonly plan: PlanFirst }): ReactNode {
  return (
    <KeyedRow id={PLAN_FIRST_ROW} className="rounded-sm">
      <SwitchRow
        title="Plan first"
        subtitle={plan.subtitle}
        icon="plan"
        value={plan.enabled}
        disabled={plan.disabled}
        onChange={plan.toggle}
        compact
      />
    </KeyedRow>
  );
}
