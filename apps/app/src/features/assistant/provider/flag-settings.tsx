import { z } from 'zod';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { ProviderMetadata, ProviderControl, JsonValue } from '@smarteverything/domain';
import { PROVIDER_CONTROL } from '@smarteverything/domain';
import { SchemaSettingsSheet } from '../../../components/schema-settings-sheet';
import { SchemaEditor } from '../../../components/schema-editor';
import { replaceField, schemaOf } from '../../../components/schema-values';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { OperationFieldInput } from './operation-fields';
import { useProviderControl } from './provider-data';

const FLAG_KEYS: ReadonlySet<string> = new Set([
  'effortLevel',
  'fastMode',
  'ultracode',
  'outputStyle',
]);
type Source = 'session' | 'localSettings' | 'userSettings';

function fieldsFor(metadata: ProviderMetadata, source: Source): ProviderMetadata['settings'] {
  const keys =
    source === 'session'
      ? FLAG_KEYS
      : new Set([source === 'localSettings' ? 'outputStyle' : 'effortLevel']);
  return metadata.settings
    .filter((setting) => keys.has(setting.key))
    .map((setting) =>
      source === 'userSettings' && setting.kind === 'enum'
        ? {
            ...setting,
            values: setting.values.filter((value) =>
              ['low', 'medium', 'high', 'xhigh'].includes(value),
            ),
          }
        : setting,
    );
}
function EditableSetting({
  setting,
  value,
  change,
}: {
  readonly setting: ProviderMetadata['settings'][number];
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue | undefined) => void;
}): ReactNode {
  const options = setting.kind === 'enum' ? setting.values : undefined;
  return (
    <OperationFieldInput
      field={{
        key: setting.key,
        label:
          setting.kind === 'integer'
            ? `${setting.label} (${String(setting.minimum)}–${String(setting.maximum)})`
            : setting.label,
        kind: setting.kind === 'integer' ? 'number' : setting.kind,
        ...(options === undefined ? {} : { options }),
      }}
      value={value}
      change={change}
    />
  );
}

function SettingsSource({
  source,
  change,
}: {
  readonly source: Source;
  readonly change: (source: Source) => void;
}): ReactNode {
  return (
    <SelectRow
      title="Apply settings to"
      value={source}
      options={[
        { value: 'session', label: 'This session only' },
        { value: 'localSettings', label: 'Project local settings' },
        { value: 'userSettings', label: 'User settings on this computer' },
      ]}
      onChange={(value) => {
        change(value);
      }}
    />
  );
}

function SettingsFields({
  metadata,
  source,
  values,
  change,
  focus,
}: {
  readonly focus?: string;
  readonly metadata: ProviderMetadata;
  readonly source: Source;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly change: (values: Readonly<Record<string, JsonValue>>) => void;
}): ReactNode {
  const schema =
    source === 'session'
      ? metadata.flag_settings_schema
      : schemaOf(metadata.settings_writer_schema[source]);
  if (Object.keys(schema).length > 0 && source !== 'session')
    return <SchemaEditor schema={schema} value={values} change={change} />;
  return (
    <>
      <QuickSettings metadata={metadata} source={source} values={values} change={change} />
      {Object.keys(schema).length === 0 ? null : (
        <SchemaSettingsSheet
          schema={schema}
          value={values}
          change={change}
          exclusions={metadata.flag_settings_exclusions}
          {...(focus === undefined ? {} : { focus })}
        />
      )}
    </>
  );
}
function QuickSettings({
  metadata,
  source,
  values,
  change,
}: {
  readonly metadata: ProviderMetadata;
  readonly source: Source;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly change: (values: Readonly<Record<string, JsonValue>>) => void;
}): ReactNode {
  return fieldsFor(metadata, source).map((setting) => (
    <EditableSetting
      key={setting.key}
      setting={setting}
      value={values[setting.key]}
      change={(next) => {
        change(replaceField(values, setting.key, next));
      }}
    />
  ));
}
function settingsBody(
  metadata: ProviderMetadata,
  source: Source,
  values: Readonly<Record<string, JsonValue>>,
): ProviderControl | null {
  const schema =
    source === 'session'
      ? metadata.flag_settings_schema
      : schemaOf(metadata.settings_writer_schema[source]);
  if (Object.keys(schema).length > 0 && !z.fromJSONSchema(schema).safeParse(values).success)
    return null;
  const checked = PROVIDER_CONTROL.safeParse(
    source === 'session'
      ? { action: 'apply_flags', values }
      : { action: 'update_settings', source, values },
  );
  return checked.success ? checked.data : null;
}
export function FlagSettings({
  chatId,
  metadata,
  focus,
}: {
  readonly focus?: string;
  readonly chatId: string;
  readonly metadata: ProviderMetadata;
}): ReactNode {
  const [source, setSource] = useState<Source>('session');
  const [values, setValues] = useState<Readonly<Record<string, JsonValue>>>({});
  const control = useProviderControl(chatId);
  const body = settingsBody(metadata, source, values);
  return (
    <View className="gap-4">
      <Text tone="variant">
        Only edited values are sent. The computer validates selected-model support and supported
        persistent keys.
      </Text>
      <SettingsSource
        source={source}
        change={(next) => {
          setSource(next);
          setValues({});
        }}
      />
      <SettingsFields
        metadata={metadata}
        source={source}
        values={values}
        change={setValues}
        {...(focus === undefined ? {} : { focus })}
      />
      <Button
        label="Apply edited settings"
        loading={control.isPending}
        disabled={body === null || Object.keys(values).length === 0}
        onPress={() => {
          if (body !== null) control.mutate(body);
        }}
      />
    </View>
  );
}
