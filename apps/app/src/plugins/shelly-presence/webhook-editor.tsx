import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { OperationFeedback } from './operation-feedback';
import { useWebhookDraft, type WebhookRow } from './use-webhook-draft';
import { WebhookIdentity, WebhookTiming, WebhookDestinations } from './webhook-fields';
export type { WebhookRow } from './use-webhook-draft';

export function WebhookEditor({
  sensor,
  row,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly row: WebhookRow | null;
  readonly close: () => void;
}): ReactNode {
  const draft = useWebhookDraft(sensor, row);
  return (
    <View className="gap-3">
      <WebhookIdentity sensor={sensor} draft={draft} />
      <WebhookTiming draft={draft} sensor={sensor} />
      <WebhookDestinations draft={draft} />
      {draft.error === null ? null : <Text tone="critical">{draft.error}</Text>}
      <OperationFeedback operation={draft.operation} />
      {draft.conflict ? (
        <Text tone="warning">Configuration changed. Reopen this action before saving.</Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          label="Save action"
          loading={draft.operation.busy}
          disabled={draft.conflict}
          onPress={draft.save}
        />
        <Button label="Back" variant="text" onPress={close} />
      </View>
      {row === null ? null : (
        <Button
          label="Delete action"
          variant="destructive"
          onPress={() => {
            void draft.operation.run({ action: 'webhook_delete', id: row.id }).then((saved) => {
              if (saved) close();
            });
          }}
        />
      )}
    </View>
  );
}
