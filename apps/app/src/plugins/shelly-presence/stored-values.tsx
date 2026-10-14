import { usePresenceSelection } from './use-presence-selection';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  SHELLY_PRESENCE_ACTION,
  type JsonValue,
  type ShellyPresenceDevice,
  type ShellyResources,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { List } from '../../components/section';
import { NavRow } from '../../components/rows';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { SchemaEditor } from '../../components/schema-editor';
import { valueSummary } from '../../components/schema-values';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';

type Selection = { readonly kind: 'new' } | { readonly kind: 'existing'; readonly key: string };
const VALUE_SCHEMA = {
  type: 'object',
  properties: {
    value: {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
        { type: 'object', additionalProperties: true },
        { type: 'array', items: {} },
      ],
    },
  },
  additionalProperties: false,
} as const;

function StoredValueEditor({
  sensor,
  chosen,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly chosen: Selection;
  readonly close: () => void;
}): ReactNode {
  const { original, key, setKey, value, setValue, error, operation, conflict, save } =
    useStoredDraft(sensor, chosen);
  return (
    <View className="gap-3">
      <TextField
        label="Key"
        value={key}
        onChange={setKey}
        disabled={chosen.kind === 'existing' || operation.acceptedEtag !== null}
        helper="Up to 42 characters · values up to 253 UTF-8 bytes"
      />
      <SchemaEditor schema={VALUE_SCHEMA} value={value} change={setValue} />
      {error === null ? null : <Text tone="critical">{error}</Text>}
      {conflict ? (
        <Text tone="warning">The stored value changed. Reopen it to reload before saving.</Text>
      ) : null}
      <OperationFeedback operation={operation} />
      <Button label="Save value" loading={operation.busy} disabled={conflict} onPress={save} />
      <StoredDelete
        sensor={sensor}
        entry={
          original === undefined ? undefined : { etag: operation.acceptedEtag ?? original.etag }
        }
        disabled={conflict}
        name={key}
        close={close}
      />
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}
function StoredDelete({
  sensor,
  entry,
  disabled,
  name,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly entry: { readonly etag: string } | undefined;
  readonly name: string;
  readonly disabled: boolean;
  readonly close: () => void;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  if (entry === undefined) return null;
  return (
    <View className="gap-2">
      <Button
        label="Delete value"
        disabled={disabled}
        variant="destructive"
        onPress={() => {
          void operation
            .run({ action: 'kvs_delete', key: name, etag: entry.etag })
            .then((saved) => {
              if (saved) close();
            });
        }}
      />
      <OperationFeedback operation={operation} />
    </View>
  );
}

export function StoredValues({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const [selected, select] = usePresenceSelection('item');
  const chosen: Selection | null =
    selected === null
      ? null
      : selected.startsWith('key:')
        ? { kind: 'existing', key: selected.slice(4) }
        : { kind: 'new' };
  const page = sensor.resources?.storedValues;
  if (chosen !== null)
    return (
      <StoredValueEditor
        key={chosen.kind === 'new' ? 'new' : chosen.key}
        sensor={sensor}
        chosen={chosen}
        close={() => {
          select(null);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <Text tone="variant">
        {page === undefined
          ? 'Stored value inventory unavailable.'
          : `${String(page.total)} of 50 keys`}
      </Text>
      <StoredList sensor={sensor} select={select} />
      <Button
        label="Add stored value"
        icon="plus"
        variant="tonal"
        disabled={page === undefined || page.total >= 50}
        onPress={() => {
          select('new');
        }}
      />
    </View>
  );
}

interface StoredDraft {
  readonly original: NonNullable<ShellyResources['storedValues']>['items'][string] | undefined;
  readonly key: string;
  readonly setKey: (value: string) => void;
  readonly value: Readonly<Record<string, JsonValue>>;
  readonly setValue: (value: Readonly<Record<string, JsonValue>>) => void;
  readonly error: string | null;
  readonly operation: ReturnType<typeof usePresenceOperation>;
  readonly conflict: boolean;
  readonly save: () => void;
}
function useStoredDraft(sensor: ShellyPresenceDevice, chosen: Selection): StoredDraft {
  const [original] = useState(
    chosen.kind === 'new' ? undefined : sensor.resources?.storedValues?.items[chosen.key],
  );
  const [key, setKey] = useState(chosen.kind === 'new' ? '' : chosen.key);
  const [value, setValue] = useState<Readonly<Record<string, JsonValue>>>({
    value: original?.value ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const operation = usePresenceOperation(sensor);
  const conflict = storedConflict({
    sensor,
    chosen,
    original,
    acceptedEtag: operation.acceptedEtag,
    key,
  });
  const save = (): void => {
    const parsed = SHELLY_PRESENCE_ACTION.safeParse({
      action: 'kvs_set',
      key,
      value: value['value'],
      ...(operation.acceptedEtag === null && original === undefined
        ? {}
        : { etag: operation.acceptedEtag ?? original?.etag }),
    });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    void operation.run(parsed.data);
  };
  return { original, key, setKey, value, setValue, error, operation, conflict, save };
}

function StoredList({
  sensor,
  select,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly select: (value: string) => void;
}): ReactNode {
  return (
    <List title="Stored values">
      {Object.entries(sensor.resources?.storedValues?.items ?? {}).map(([key, entry]) => (
        <NavRow
          key={key}
          title={key}
          subtitle={valueSummary(entry.value)}
          onPress={() => {
            select(`key:${key}`);
          }}
        />
      ))}
    </List>
  );
}

function storedConflict({
  sensor,
  chosen,
  original,
  acceptedEtag,
  key,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly chosen: Selection;
  readonly original: StoredDraft['original'];
  readonly acceptedEtag: string | null;
  readonly key: string;
}): boolean {
  if (chosen.kind === 'new' && acceptedEtag === null) return storedEtag(sensor, key) !== undefined;
  const etag = acceptedEtag ?? original?.etag;
  return etag === undefined || storedEtag(sensor, key) !== etag;
}
function storedEtag(sensor: ShellyPresenceDevice, key: string): string | undefined {
  return sensor.resources?.storedValues?.items[key]?.etag;
}
