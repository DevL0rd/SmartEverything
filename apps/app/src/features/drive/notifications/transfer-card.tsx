import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveTransfer } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Text } from '../../../components/text';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useTransferAnswer } from '../data';
import { offerBodyOf, offerTitleOf } from '../share/transfer-model';

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

export function TransferOfferCard({ transfer }: { readonly transfer: DriveTransfer }): ReactNode {
  const profiles = useProfiles();
  const fromName =
    profiles.find((profile) => profile.id === transfer.fromProfileId)?.name ?? 'A former member';
  return (
    <View className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad">
      <View className="flex-row items-center gap-3">
        <FileGlyph
          kind={transfer.itemKind === 'folder' ? 'folder' : 'file'}
          name={transfer.itemName}
          well="m"
        />
        <Text variant="body-strong" numberOfLines={2} className="min-w-0 flex-1">
          {offerTitleOf(transfer, fromName)}
        </Text>
      </View>
      <Text variant="footnote" tone="variant">
        {offerBodyOf(transfer, fromName)}
      </Text>
      <TransferAnswerButtons transfer={transfer} fromName={fromName} />
    </View>
  );
}
