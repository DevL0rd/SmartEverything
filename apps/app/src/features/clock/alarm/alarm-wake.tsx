import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { SelectRow } from '../../../components/rows';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useRows } from '../../../store/selectors';
import {
  DEFAULT_WAKE_LEAD_MINUTES,
  wakeEdit,
  type AlarmDraft,
  type AlarmEdit,
} from './alarm-draft';
import { FieldRows } from './alarm-fields';
import { leadOptions, leadText, smartMinutesOf, smartOptions, OFF } from './alarm-options';

export interface WakeProps {
  readonly draft: AlarmDraft;
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onChange: (edit: AlarmEdit) => void;
}

export function SmartWakeRow({ draft, compact, disabled, onChange }: WakeProps): ReactNode {
  return (
    <FieldRows compact={compact}>
      <SelectRow
        title="Smart wake"
        subtitle="The watch wakes you in light sleep"
        wrapSubtitle
        icon="watch"
        compact={compact}
        options={smartOptions(draft.smart_minutes)}
        value={draft.smart_minutes === null ? OFF : String(draft.smart_minutes)}
        disabled={disabled}
        onChange={(value) => {
          onChange({ smart_minutes: smartMinutesOf(value) });
        }}
      />
    </FieldRows>
  );
}

interface AutomationOption {
  readonly value: string;
  readonly label: string;
}

function routineText(automation: AutomationOption | undefined, lead: number | null): string {
  if (automation === undefined || lead === null) return 'Run an automation before the alarm rings.';
  return `${automation.label} starts ${leadText(lead)}.`;
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
    <FieldRows compact={compact}>
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
    </FieldRows>
  );
}

export function WakeRoutine(
  props: WakeProps & { readonly defaultAutomationId: string | null },
): ReactNode {
  const { draft, disabled, onChange, defaultAutomationId } = props;
  const automations = useRows('automations').map((automation) => ({
    value: automation.id,
    label: automation.name,
  }));
  const on = draft.wake_automation_id !== null;
  const first = automations.find((entry) => entry.value === defaultAutomationId) ?? automations[0];
  const chosen = automations.find((entry) => entry.value === draft.wake_automation_id);
  const none = first === undefined && !on;
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <Icon name="sunrise" size={18} tone="primary" />
        <Text variant="body-strong" className="flex-1">
          Wake routine
        </Text>
        <Switch
          label="Wake routine"
          value={on}
          disabled={disabled || none}
          onChange={(next) => {
            onChange(wakeEdit(next ? (first?.value ?? null) : null, DEFAULT_WAKE_LEAD_MINUTES));
          }}
        />
      </View>
      <Text variant="footnote" tone="variant">
        {none
          ? 'Set up an automation to start it before the alarm.'
          : routineText(chosen, draft.wake_lead_minutes)}
      </Text>
      {none ? (
        <View className="flex-row">
          <Button
            label="Set up an automation"
            icon="automations"
            variant="tonal"
            href={href.automationNew()}
          />
        </View>
      ) : null}
      {on ? <WakeChoices {...props} automations={automations} /> : null}
    </View>
  );
}
