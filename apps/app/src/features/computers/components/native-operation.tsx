import type { z } from 'zod';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_CONTROLLED, CLAUDE_STARTED, type CODEX_OPERATION } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { StructuredValue } from '../../../components/structured-value';
import { Text } from '../../../components/text';
import { rawErrorText } from '../../../format/errors';
import type { NativeOperationState } from '../data/native-operation';

const OPERATION_LABELS = {
  pending: 'Running on this computer…',
  completed: 'Done.',
  failed: 'Couldn’t finish it.',
  uncertain: 'Couldn’t confirm it arrived. Check status before trying again.',
} as const;

function operationMessage(receipt: z.output<typeof CODEX_OPERATION>): string {
  if (receipt.state === 'completed' && receipt.operation === 'control') {
    const result = CLAUDE_CONTROLLED.safeParse(receipt.value);
    if (result.success && result.data.delivery === 'queued_unverified')
      return 'Sent to this computer…';
  }
  return OPERATION_LABELS[receipt.state];
}

function NativeOperationValue({
  receipt,
}: {
  readonly receipt: z.output<typeof CODEX_OPERATION>;
}): ReactNode {
  if (receipt.value === null) return null;
  if (receipt.operation === 'control') {
    const result = CLAUDE_CONTROLLED.safeParse(receipt.value);
    if (result.success) return null;
  }
  if (receipt.operation === 'start') {
    const result = CLAUDE_STARTED.safeParse(receipt.value);
    if (result.success) return <Text>{result.data.detail}</Text>;
  }
  return <StructuredValue value={receipt.value} />;
}

export function NativeOperationFeedback({
  operation,
}: {
  readonly operation: NativeOperationState;
}): ReactNode {
  const receipt = operation.receipt;
  if (receipt === null) return null;
  return (
    <View className="gap-2">
      <Text tone={receipt.state === 'failed' ? 'critical' : 'variant'}>
        {operationMessage(receipt)}
      </Text>
      <Text variant="footnote" tone="variant" selectable>
        Operation {receipt.id}
      </Text>
      {receipt.error === null ? null : <Text tone="critical">{receipt.error}</Text>}
      <NativeOperationValue receipt={receipt} />
      <Button
        label="Check status"
        variant="tonal"
        loading={operation.checking}
        onPress={operation.check}
      />
      {operation.error === null ? null : (
        <Text tone="critical">{rawErrorText(operation.error)}</Text>
      )}
    </View>
  );
}
