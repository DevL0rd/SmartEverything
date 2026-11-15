import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow, SwitchRow } from '../../../components/rows';
import { useRows } from '../../../store/selectors';
import {
  DEFAULT_WAKE_LEAD_MINUTES,
  wakeEdit,
  type AlarmDraft,
  type AlarmEdit,
} from './alarm-draft';
import { leadOptions, leadText, smartMinutesOf, smartOptions, OFF } from './alarm-options';

export interface WakeProps {
  readonly draft: AlarmDraft;
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}

export function SmartWakeRow({ draft, compact, disabled, onChange }: WakeProps): ReactNode {
  return (
    <SelectRow
      title="Smart wake"
      subtitle="The watch wakes you in light sleep"
      wrapSubtitle
      icon="moon"
      compact={compact}
      options={smartOptions(draft.smart_minutes)}
      value={draft.smart_minutes === null ? OFF : String(draft.smart_minutes)}
      disabled={disabled}
      onChange={(value) => {
        onChange({ smart_minutes: smartMinutesOf(value) });
      }}
    />
  );
}

interface AutomationOption {
  readonly value: string;
  readonly label: string;
}

function routineText(automation: AutomationOption | undefined, lead: number | null): string {
  if (automation === undefined || lead === null) return 'Run an automation before the alarm rings';
  return `${automation.label} starts ${leadText(lead)}`;
}

function WakeChoices({
  draft,
  compact,
  disabled,
  onChange,
  automations,
}: WakeProps & { readonly automations: readonly AutomationOption[] }): ReactNode {
  const lead = draft.wake_lead_minutes ?? DEFAULT_WAKE_LEAD_MINUTES;
  return (
    <>
      <SelectRow
        title="Automation"
        icon="automations"
        compact={compact}
        options={automations}
        value={draft.wake_automation_id}
        searchable
        disabled={disabled}
        onChange={(automationId) => {
          onChange(wakeEdit(automationId, lead));
        }}
      />
      <SelectRow
        title="Starts"
        icon="clock"
        compact={compact}
        options={leadOptions(draft.wake_lead_minutes)}
        value={String(lead)}
        disabled={disabled}
        onChange={(minutes) => {
          onChange(wakeEdit(draft.wake_automation_id, Number(minutes)));
        }}
      />
    </>
  );
}

export function WakeRoutine(
  props: WakeProps & { readonly defaultAutomationId: string | null },
): ReactNode {
  const { draft, compact, disabled, onChange, defaultAutomationId } = props;
  const automations = useRows('automations').map((automation) => ({
    value: automation.id,
    label: automation.name,
  }));
  const on = draft.wake_automation_id !== null;
  const first = automations.find((entry) => entry.value === defaultAutomationId) ?? automations[0];
  const chosen = automations.find((entry) => entry.value === draft.wake_automation_id);
  if (first === undefined && !on) {
    return (
      <NavRow
        title="Wake routine"
        subtitle="Set up an automation to start it before the alarm"
        icon="automations"
        compact={compact}
        href={href.automationNew()}
      />
    );
  }
  return (
    <View>
      <SwitchRow
        title="Wake routine"
        subtitle={routineText(chosen, draft.wake_lead_minutes)}
        wrapSubtitle
        icon="automations"
        compact={compact}
        value={on}
        disabled={disabled}
        onChange={(next) => {
          onChange(wakeEdit(next ? (first?.value ?? null) : null, DEFAULT_WAKE_LEAD_MINUTES));
        }}
      />
      {on ? <WakeChoices {...props} automations={automations} /> : null}
    </View>
  );
}
