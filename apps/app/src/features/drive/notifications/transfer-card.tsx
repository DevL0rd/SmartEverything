import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveTransfer } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useSyncStatus } from '../../../store/selectors';
import { useTransferAnswer } from '../data';

export function TransferAnswerButtons({
  transfer,
  fromName,
}: {
  readonly transfer: DriveTransfer;
  readonly fromName: string;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const answer = useTransferAnswer();
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Accept"
          spoken={`Accept ${transfer.itemName} from ${fromName}`}
          icon="check"
          loading={answer.busy}
          disabled={!live}
          onPress={() => {
            answer.run(transfer.id, true);
          }}
        />
        <Button
          label="Decline"
          spoken={`Decline ${transfer.itemName} from ${fromName}`}
          variant="text"
          disabled={!live || answer.busy}
          onPress={() => {
            answer.run(transfer.id, false);
          }}
        />
      </View>
      {answer.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {answer.problem}
        </Text>
      )}
    </View>
  );
}
