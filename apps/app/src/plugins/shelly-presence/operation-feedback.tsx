import type { ReactNode } from 'react';
import { View } from 'react-native';
import { OperationResult } from './operation-result';
import { Text } from '../../components/text';
import type { PresenceOperation } from './use-presence-operation';

export function OperationFeedback({
  operation,
}: {
  readonly operation: PresenceOperation;
}): ReactNode {
  if (operation.error !== null)
    return (
      <Text tone="critical" accessibilityLiveRegion="polite" selectable>
        {operation.error}
      </Text>
    );
  return (
    <View className="gap-3">
      {operation.message === null ? null : (
        <Text tone="positive" accessibilityLiveRegion="polite">
          {operation.message}
        </Text>
      )}
      <OperationResult result={operation.result} run={operation.run} />
    </View>
  );
}
