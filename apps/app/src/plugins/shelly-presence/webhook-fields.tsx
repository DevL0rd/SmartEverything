import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { ValueRow, SwitchRow } from '../../components/rows';
import { Select } from '../../components/select';
import { TextField } from '../../components/text-field';
import { StringListInput } from './string-list-input';
import { TimeWindowInput } from './time-window-input';
import { ConditionBuilder } from './condition-builder';
import type { WebhookDraft } from './use-webhook-draft';

export function WebhookIdentity({
  sensor,
  draft,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly draft: WebhookDraft;
}): ReactNode {
  const { value, change } = draft;
  const events = (sensor.resources?.webhookTypes?.types ?? []).flatMap((type) =>
    Object.keys(type).map((event) => ({ value: event, label: event.replaceAll('_', ' ') })),
  );
  return (
    <View className="gap-3">
      <TextField
        label="Action name"
        value={value.name}
        onChange={(name) => {
          change({ ...value, name });
        }}
      />
      <SwitchRow
        title="Enabled"
        value={value.enable}
        onChange={(enable) => {
          change({ ...value, enable });
        }}
      />
      <Select
        label="Event"
        value={value.event}
        options={events}
        onChange={(event) => {
          change({ ...value, event });
        }}
      />
      <TextField
        label="Event component ID"
        kind="number"
        value={value.cid}
        onChange={(cid) => {
          change({ ...value, cid });
        }}
      />
    </View>
  );
}

export function WebhookTiming({
  draft,
  sensor,
}: {
  readonly draft: WebhookDraft;
  readonly sensor: ShellyPresenceDevice;
}): ReactNode {
  const { value, change } = draft;
  return (
    <View className="gap-3">
      <ConditionBuilder
        sensor={sensor}
        event={value.event}
        condition={value.condition}
        change={(condition) => {
          change({ ...value, condition });
        }}
      />
      <TextField
        label="Condition expression"
        value={value.condition}
        onChange={(condition) => {
          change({ ...value, condition });
        }}
      />
      <TextField
        label="Repeat period (seconds)"
        kind="number"
        value={value.repeat}
        onChange={(repeat) => {
          change({ ...value, repeat });
        }}
        helper="Negative: edge only · zero: every event · positive: repeat interval"
      />
      <TimeWindowInput
        title="Active hours"
        value={value.window}
        change={(window) => {
          change({ ...value, window });
        }}
      />
    </View>
  );
}

export function WebhookDestinations({ draft }: { readonly draft: WebhookDraft }): ReactNode {
  const { value, change } = draft;
  return (
    <View className="gap-3">
      <DestinationInputs draft={draft} />
      <Select
        label="TLS verification"
        value={value.ca ?? 'none'}
        options={[
          { value: 'none', label: 'No TLS' },
          { value: 'ca.pem', label: 'Built-in CA' },
          { value: 'user_ca.pem', label: 'User CA' },
          { value: '*', label: 'Skip certificate verification' },
        ]}
        onChange={(ca) => {
          change({ ...value, ca: ca === 'none' ? null : ca });
        }}
      />
    </View>
  );
}

function DestinationInputs({ draft }: { readonly draft: WebhookDraft }): ReactNode {
  const { value, change } = draft;
  if (draft.destinationsLocked)
    return (
      <View className="gap-2">
        <Text tone="warning">
          Private URL details are hidden and preserved on the device. Replace destinations
          explicitly to change them.
        </Text>
        {value.urls.map((url, index) => (
          <ValueRow
            key={index}
            title={`Destination ${String(index + 1)} · private details hidden`}
            value={url}
          />
        ))}
        <Button
          label="Replace protected destinations"
          variant="tonal"
          onPress={draft.replaceDestinations}
        />
      </View>
    );
  return (
    <StringListInput
      title="Destination"
      url
      value={value.urls}
      change={(urls) => {
        change({ ...value, urls });
      }}
    />
  );
}
