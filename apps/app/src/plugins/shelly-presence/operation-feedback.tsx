import type { ReactNode } from 'react';
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
  return operation.message === null ? null : (
    <Text tone="positive" accessibilityLiveRegion="polite">
      {operation.message}
    </Text>
  );
}
