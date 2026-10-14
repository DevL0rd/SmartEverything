import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type {
  JsonValue,
  ShellyPresenceAction,
  ShellyPresenceDevice,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { OrderedGroups } from './ordered-groups';
import { PresenceFieldInput, type PresenceField } from './presence-fields';
import { atPath } from './form-model';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { presenceActionAvailable, presenceFeature } from './availability';
import { useCoreForm, type CoreDraft } from './use-core-form';

function DraftFeedback({ draft }: { readonly draft: CoreDraft }): ReactNode {
  return (
    <View className="gap-2">
      {draft.conflict ? (
        <View className="gap-2">
          <Text tone="warning">
            The sensor configuration changed. Reload accepted settings before saving.
          </Text>
          <Button label="Reload settings" variant="tonal" onPress={draft.reload} />
        </View>
      ) : null}
      {draft.validation === null ? null : (
        <Text tone="critical" selectable>
          {draft.validation}
        </Text>
      )}
      <OperationFeedback operation={draft.operation} />
    </View>
  );
}

export function CoreForm({
  sensor,
  fields,
  accepted,
  action,
  component,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly fields: readonly PresenceField[];
  readonly accepted: unknown;
  readonly action: 'set_presence' | 'set_light' | 'set_component';
  readonly component?: string;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string; readonly field?: string }>();
  const visible = fields.filter(
    (field) =>
      presenceFeature(sensor, field.id) !== undefined ||
      atPath(accepted, field.path.join('.')) !== undefined,
  );
  const draft = useCoreForm(sensor, visible, {
    action,
    id: atPath(accepted, 'id'),
    component,
    accepted,
  });
  return (
    <View className="gap-4">
      <CoreFields
        sensor={sensor}
        fields={visible}
        accepted={accepted}
        draft={draft}
        focus={params.focus}
        fieldId={params.field}
      />
      <DraftFeedback draft={draft} />
      <Button
        label="Save"
        loading={draft.operation.busy}
        disabled={
          draft.conflict ||
          Object.keys(draft.value).length === 0 ||
          sensor.connection.state !== 'online'
        }
        onPress={draft.save}
      />
    </View>
  );
}

export function PresenceActionButton({
  sensor,
  label,
  action,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly label: string;
  readonly action: ShellyPresenceAction;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-2">
      <Button
        label={label}
        variant="tonal"
        loading={operation.busy}
        disabled={!presenceActionAvailable(sensor, action.action)}
        onPress={() => {
          void operation.run(action);
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  );
}

interface CoreFieldProps {
  readonly sensor: ShellyPresenceDevice;
  readonly accepted: unknown;
  readonly draft: CoreDraft;
  readonly focus: string | undefined;
  readonly fieldId: string | undefined;
  readonly field: PresenceField;
}
function CoreFields({
  sensor,
  fields,
  accepted,
  draft,
  focus,
  fieldId,
}: Omit<CoreFieldProps, 'field'> & { readonly fields: readonly PresenceField[] }): ReactNode {
  return (
    <View className="gap-4">
      {fields.map((field) => (
        <CoreField
          key={field.id}
          sensor={sensor}
          accepted={accepted}
          draft={draft}
          focus={focus}
          fieldId={fieldId}
          field={field}
        />
      ))}
    </View>
  );
}
function CoreField({ sensor, accepted, draft, focus, fieldId, field }: CoreFieldProps): ReactNode {
  const path = field.path.join('.');
  const value = Object.hasOwn(draft.value, path) ? draft.value[path] : atPath(accepted, path);
  const feature = presenceFeature(sensor, field.id);
  const highlighted = fieldId === undefined ? focus === field.focus : fieldId === field.id;
  const change = (next: JsonValue): void => {
    draft.change(path, next);
  };
  return (
    <View className={highlighted ? 'gap-1 rounded-md bg-primary-container p-2' : 'gap-1'}>
      {field.id === 'sys.ui_data.dash' ? (
        <OrderedGroups sensor={sensor} value={value} change={change} />
      ) : (
        <PresenceFieldInput
          field={field}
          value={value}
          focused={fieldId === field.id}
          disabled={feature?.available === false}
          change={change}
        />
      )}
      {feature?.reason === null || feature?.reason === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {feature.reason}
        </Text>
      )}
    </View>
  );
}
