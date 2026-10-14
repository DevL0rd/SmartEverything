import { usePresenceSelection } from './use-presence-selection';
import { useState, type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import {
  SHELLY_PRESENCE_ACTION,
  SHELLY_PRESENCE_OPERATIONS,
  type JsonValue,
  type ShellyPresenceDevice,
  type ShellyPresencePage,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { NavRow, SwitchRow } from '../../components/rows';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { presenceActionAvailable } from './availability';
import { ACTION_FORMS, type ActionForm, type ActionParameter } from './action-forms';
import { withPath, type PresenceFormObject } from './form-model';
import { pickTextFile } from '../../platform/text-file';
import { StringListInput } from './string-list-input';
import { HeaderInput } from './header-input';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';

function ParameterInput({
  field,
  value,
  change,
}: {
  readonly field: ActionParameter;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  if (field.kind === 'boolean')
    return <SwitchRow title={field.title} value={value === true} onChange={change} />;
  if (field.kind === 'numbers')
    return (
      <StringListInput
        maximum={256}
        title={field.title}
        value={Array.isArray(value) ? value.map(String) : []}
        change={change}
      />
    );
  if (field.kind === 'headers') return <HeaderInput change={change} />;
  if (field.options !== undefined)
    return (
      <Select
        label={field.title}
        value={typeof value === 'string' ? value : null}
        options={field.options.map((option) => ({
          value: option,
          label: option.replaceAll('_', ' '),
        }))}
        onChange={change}
      />
    );
  return <TextParameter field={field} value={value} change={change} />;
}

function actionArguments(form: ActionForm, draft: PresenceFormObject): PresenceFormObject {
  if (
    form.action === 'firmware_update' &&
    typeof draft['update.url'] === 'string' &&
    draft['update.url'] !== ''
  )
    return { action: form.action, update: { url: draft['update.url'] } };
  return form.fields.reduce<PresenceFormObject>(
    (args, field) => {
      const value = draft[field.path];
      if (value === undefined || (value === '' && field.nullable !== true)) return args;
      const next =
        field.nullable === true && value === ''
          ? null
          : field.kind === 'numbers' && Array.isArray(value)
            ? value.map((item) =>
                typeof item === 'string' && item.trim() === '' ? null : Number(item),
              )
            : field.kind === 'number' && typeof value === 'string'
              ? Number(value)
              : value;
      return withPath(args, field.path, next);
    },
    { action: form.action },
  );
}

function ActionParameters({
  form,
  sensor,
  draft,
  change,
}: {
  readonly form: ActionForm;
  readonly sensor: ShellyPresenceDevice;
  readonly draft: PresenceFormObject;
  readonly change: (value: PresenceFormObject) => void;
}): ReactNode {
  return form.fields.map((field) => (
    <View key={field.path} className="gap-1">
      <ParameterInput
        field={
          form.action === 'certificate_put' && field.path === 'target'
            ? { ...field, options: certificateDestinations(sensor) }
            : field
        }
        value={draft[field.path]}
        change={(value) => {
          change({ ...draft, [field.path]: value });
        }}
      />
      {field.nullable === true ? (
        <Button
          label={`Clear ${field.title.toLowerCase()}`}
          variant="text"
          onPress={() => {
            change({ ...draft, [field.path]: null });
          }}
        />
      ) : null}
    </View>
  ));
}

function ActionEditor({
  sensor,
  form,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly form: ActionForm;
  readonly close: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<PresenceFormObject>({});
  const [error, setError] = useState<string | null>(null);
  const operation = usePresenceOperation(sensor);
  const descriptor = SHELLY_PRESENCE_OPERATIONS.find((item) => item.action === form.action);
  const execute = (): void => {
    const args = actionArguments(form, draft);
    const parsed = SHELLY_PRESENCE_ACTION.safeParse(args);
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    void operation.run(parsed.data);
  };
  return (
    <View className="gap-3">
      <Text variant="title-3">{descriptor?.title ?? form.action}</Text>
      <ActionParameters form={form} sensor={sensor} draft={draft} change={setDraft} />
      <CertificateImport
        form={form}
        change={(next) => {
          setDraft({ ...draft, ...next });
        }}
        failure={setError}
      />
      <CurrentTime form={form} change={setDraft} />
      {error === null ? null : <Text tone="critical">{error}</Text>}
      <OperationFeedback operation={operation} />
      <View className="flex-row gap-2">
        <Button
          label={descriptor?.title ?? 'Run'}
          variant={descriptor?.permission === 'destructive' ? 'destructive' : 'filled'}
          loading={operation.busy}
          disabled={sensor.connection.state !== 'online'}
          onPress={execute}
        />
        <Button label="Back" variant="text" onPress={close} />
      </View>
    </View>
  );
}

export function ManagementActions({
  sensor,
  page,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly page: ShellyPresencePage;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string }>();
  const operations = SHELLY_PRESENCE_OPERATIONS.filter(
    (operation) =>
      operation.page === page &&
      presenceActionAvailable(sensor, operation.action) &&
      ACTION_FORMS.some((form) => form.action === operation.action),
  );
  const [selected, setSelected] = usePresenceSelection(
    'action',
    operations.find((operation) => operation.focus === params.focus)?.action ?? null,
  );
  const form = ACTION_FORMS.find((item) => item.action === selected);
  if (form !== undefined)
    return (
      <ActionEditor
        key={form.action}
        sensor={sensor}
        form={form}
        close={() => {
          setSelected(null);
        }}
      />
    );
  return operations.length === 0 ? null : (
    <List title="Actions">
      {operations.map((operation) => (
        <NavRow
          key={operation.action}
          title={operation.title}
          onPress={() => {
            setSelected(operation.action);
          }}
        />
      ))}
    </List>
  );
}

function CurrentTime({
  form,
  change,
}: {
  readonly form: ActionForm;
  readonly change: (value: PresenceFormObject) => void;
}): ReactNode {
  return form.action !== 'device_set_time' ? null : (
    <Button
      label="Use current time"
      variant="tonal"
      onPress={() => {
        change({ unixtime: Math.floor(Date.now() / 1000) });
      }}
    />
  );
}

function CertificateImport({
  form,
  change,
  failure,
}: {
  readonly form: ActionForm;
  readonly change: (value: PresenceFormObject) => void;
  readonly failure: (message: string) => void;
}): ReactNode {
  const [fileDraft, setFileDraft] = useState<string | null>(null);
  if (form.action !== 'certificate_put') return null;
  const importFile = (): void => {
    pickTextFile('application/x-pem-file,text/plain')
      .then((data) => {
        if (data !== null) setFileDraft(data);
      })
      .catch((error: unknown) => {
        failure(String(error));
      });
  };
  return (
    <View className="gap-2">
      <Button label="Import PEM file" icon="upload" variant="tonal" onPress={importFile} />
      {fileDraft === null ? null : (
        <Button
          label="Use imported PEM draft"
          variant="tonal"
          onPress={() => {
            change({ data: fileDraft });
          }}
        />
      )}
    </View>
  );
}

function TextParameter({
  field,
  value,
  change,
}: {
  readonly field: ActionParameter;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly param?: string }>();
  if (field.kind === 'boolean' || field.kind === 'headers' || field.kind === 'numbers') return null;
  return (
    <TextField
      label={field.title}
      focusOnMount={params.param === field.path}
      kind={field.kind === 'code' ? 'text' : field.kind}
      multiline={field.kind === 'code'}
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      onChange={change}
      {...(field.nullable === true ? { helper: 'Blank explicitly clears this value' } : {})}
    />
  );
}

function certificateDestinations(sensor: ShellyPresenceDevice): readonly string[] {
  const methods: Readonly<Record<string, string>> = {
    user_ca: 'Shelly.PutUserCA',
    tls_client_cert: 'Shelly.PutTLSClientCert',
    tls_client_key: 'Shelly.PutTLSClientKey',
    http_server_cert: 'Shelly.PutHTTPServerCert',
    http_server_key: 'Shelly.PutHTTPServerKey',
    http_server_ca: 'Shelly.PutHTTPServerCABundle',
  };
  return Object.entries(methods)
    .filter(([, method]) =>
      sensor.methods.some((entry) => entry.toLowerCase() === method.toLowerCase()),
    )
    .map(([name]) => name);
}
