import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { PresentedCapability, JsonValue } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { Select } from '../../../components/select';
import { Sheet } from '../../../components/sheet';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device, DeviceValues } from '../../../store/state';
import { microwaveReason } from './model';
import {
  MICROWAVE_FORM_SPECS,
  UPDATE_AVAILABLE_KEY,
  type MicrowaveFormSpec,
  type MicrowaveField,
} from './form-specs';
import { rawErrorText } from '../../../format/errors';
import {
  DateField,
  DEFAULT_UPDATE_TIME,
  defaultUpdateDate,
  TimeOfDayField,
} from './schedule-fields';

function defaultValue(field: MicrowaveField): string {
  switch (field.kind) {
    case 'date':
      return defaultUpdateDate();
    case 'time':
      return DEFAULT_UPDATE_TIME;
    case 'text':
    case 'number':
    case 'json':
    case 'enum':
      return '';
  }
}
function initialValues(
  spec: MicrowaveFormSpec,
  current: JsonValue | undefined,
): Readonly<Record<string, string>> {
  if (typeof current !== 'object' || current === null || Array.isArray(current)) {
    return Object.fromEntries(spec.fields.map((field) => [field.key, defaultValue(field)]));
  }
  return Object.fromEntries(
    spec.fields.map((field) => {
      const value = Object.entries(current).find(([key]) => key === field.key)?.[1];
      return [
        field.key,
        value === undefined
          ? defaultValue(field)
          : typeof value === 'string'
            ? value
            : JSON.stringify(value),
      ];
    }),
  );
}
function Field({
  field,
  value,
  onChange,
}: {
  readonly field: MicrowaveField;
  readonly value: string;
  readonly onChange: (text: string) => void;
}): ReactNode {
  if (field.kind === 'date') {
    return <DateField label={field.label} value={value} onChange={onChange} />;
  }
  if (field.kind === 'time') {
    return (
      <TimeOfDayField label={field.label} value={value} helper={field.helper} onChange={onChange} />
    );
  }
  return field.kind === 'enum' ? (
    <Select
      label={field.label}
      value={value}
      options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
      onChange={onChange}
    />
  ) : (
    <TextField
      label={field.label}
      value={value}
      onChange={onChange}
      kind={field.kind === 'number' ? 'number' : 'text'}
      multiline={field.kind === 'json'}
      {...(field.helper === undefined ? {} : { helper: field.helper })}
    />
  );
}
interface FormProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly spec: MicrowaveFormSpec;
  readonly onClose: () => void;
}
const log = new Logger('app.devices');

function logSkipped(device: Device, presented: PresentedCapability, blocked: boolean): void {
  log.debug('form.save_skipped', { deviceId: device.id, capability: presented.key, blocked });
}

function buildFailure(device: Device, presented: PresentedCapability, cause: unknown): string {
  const reason = rawErrorText(cause);
  log.warn('form.build_failed', { deviceId: device.id, capability: presented.key, reason });
  return reason;
}

function StructuredSheet({ device, presented, spec, onClose }: FormProps): ReactNode {
  const control = useControl(device.id, presented.key);
  const [given, setGiven] = useState(initialValues(spec, control.value));
  const [error, setError] = useState<string | null>(null);
  const reason = formReason(device, spec, useDeviceValues(device.id));
  const save = async (): Promise<void> => {
    if (reason !== null || control.pending) {
      logSkipped(device, presented, reason !== null);
      return;
    }
    try {
      const payload = spec.build(given);
      setError(null);
      if (await control.set(payload)) {
        onClose();
      }
    } catch (cause) {
      setError(buildFailure(device, presented, cause));
    }
  };
  return (
    <Sheet
      open
      title={presented.label}
      detents={['full']}
      onClose={onClose}
      footer={
        <FormFooter
          label={presented.label}
          pending={control.pending}
          disabled={reason !== null}
          onClose={onClose}
          onSave={() => {
            background(save(), 'structured_row.save_failed');
          }}
        />
      }
    >
      <FormFields
        spec={spec}
        given={given}
        reason={reason}
        error={error}
        onChange={(key, text) => {
          setGiven({ ...given, [key]: text });
        }}
      />
    </Sheet>
  );
}
export function MicrowaveStructuredRow({
  device,
  presented,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const values = useDeviceValues(device.id);
  const spec = MICROWAVE_FORM_SPECS[presented.key];
  if (spec === undefined || (!spec.cooking && values[UPDATE_AVAILABLE_KEY]?.value !== true)) {
    return null;
  }
  return (
    <>
      <ListRow
        title={presented.label}
        icon="customize"
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <StructuredSheet
          device={device}
          presented={presented}
          spec={spec}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function FormFields({
  spec,
  given,
  reason,
  error,
  onChange,
}: {
  readonly spec: MicrowaveFormSpec;
  readonly given: Readonly<Record<string, string>>;
  readonly reason: string | null;
  readonly error: string | null;
  readonly onChange: (key: string, text: string) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {spec.help}
      </Text>
      {spec.fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={given[field.key] ?? ''}
          onChange={(text) => {
            onChange(field.key, text);
          }}
        />
      ))}
      {reason === null ? null : (
        <Text variant="footnote" tone="variant">
          {reason}
        </Text>
      )}
      {error === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

function FormFooter({
  label,
  pending,
  disabled,
  onClose,
  onSave,
}: {
  readonly label: string;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button label={label} loading={pending} disabled={disabled} onPress={onSave} />
    </>
  );
}

function formReason(device: Device, spec: MicrowaveFormSpec, values: DeviceValues): string | null {
  return spec.cooking
    ? microwaveReason(device, values)
    : device.online
      ? null
      : 'The microwave is offline.';
}
