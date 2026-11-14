import type { ReactNode } from 'react';
import { View } from 'react-native';
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

interface SceneOption {
  readonly value: string;
  readonly label: string;
}

function routineText(scene: SceneOption | undefined, lead: number | null): string {
  if (scene === undefined || lead === null) return 'Run a scene before the alarm rings.';
  return `${scene.label} starts ${leadText(lead)}.`;
}

function WakeChoices({
  draft,
  compact,
  disabled,
  onChange,
  scenes,
}: WakeProps & { readonly scenes: readonly SceneOption[] }): ReactNode {
  const lead = draft.wake_lead_minutes ?? DEFAULT_WAKE_LEAD_MINUTES;
  return (
    <FieldRows compact={compact}>
      <SelectRow
        title="Scene"
        icon="sun"
        compact={compact}
        options={scenes}
        value={draft.wake_scene_id}
        searchable
        disabled={disabled}
        onChange={(sceneId) => {
          onChange(wakeEdit(sceneId, lead));
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
          onChange(wakeEdit(draft.wake_scene_id, Number(minutes)));
        }}
      />
    </FieldRows>
  );
}

export function WakeRoutine(
  props: WakeProps & { readonly defaultSceneId: string | null },
): ReactNode {
  const { draft, disabled, onChange, defaultSceneId } = props;
  const scenes = useRows('scenes').map((scene) => ({ value: scene.id, label: scene.name }));
  const on = draft.wake_scene_id !== null;
  const first = scenes.find((entry) => entry.value === defaultSceneId) ?? scenes[0];
  const scene = scenes.find((entry) => entry.value === draft.wake_scene_id);
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
          disabled={disabled || (!on && first === undefined)}
          onChange={(next) => {
            onChange(wakeEdit(next ? (first?.value ?? null) : null, DEFAULT_WAKE_LEAD_MINUTES));
          }}
        />
      </View>
      <Text variant="footnote" tone="variant">
        {first === undefined && !on
          ? 'Make a scene first to start it before the alarm.'
          : routineText(scene, draft.wake_lead_minutes)}
      </Text>
      {on ? <WakeChoices {...props} scenes={scenes} /> : null}
    </View>
  );
}
