import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveTransfer, ProfileRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import {
  useDriveTransferRows,
  useDriveUsage,
  useTransferCancel,
  useTransferOffer,
  useViewerId,
} from '../data';
import type { DriveAccess } from '../model/drive-access';
import { PersonPick, SectionTitle } from './people-section';
import {
  TRANSFER_KEEP_LINE,
  TRANSFER_TITLE,
  canOfferOf,
  offerButtonOf,
  offerWaitingLineOf,
  openOfferOf,
  transferCandidatesOf,
  transferMovesLineOf,
  transferRoomLineOf,
  transferRoomOf,
} from './transfer-model';

type TransferItem = Pick<DriveItem, 'id' | 'kind' | 'name' | 'bytes'>;

function Problem({ text }: { readonly text: string | null }): ReactNode {
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

function Waiting({
  offer,
  recipient,
}: {
  readonly offer: DriveTransfer;
  readonly recipient: string;
}): ReactNode {
  const now = useMinute();
  const live = useSyncStatus().status === 'live';
  const cancel = useTransferCancel();
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-2 p-3">
      <Text variant="callout">{offerWaitingLineOf(offer, recipient, now)}</Text>
      <View className="flex-row">
        <Button
          label="Take back the offer"
          variant="tonal"
          loading={cancel.busy}
          disabled={!live}
          onPress={() => {
            cancel.run(offer.id);
          }}
        />
      </View>
      <Problem text={cancel.problem} />
    </View>
  );
}

function Confirm({
  item,
  person,
  onCancel,
}: {
  readonly item: TransferItem;
  readonly person: ProfileRow;
  readonly onCancel: () => void;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const usage = useDriveUsage().data ?? null;
  const offer = useTransferOffer();
  const room = transferRoomOf(item.bytes, usage, person.id);
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-2 p-3">
      <Text variant="callout">{transferMovesLineOf(item, person.name)}</Text>
      <Text variant="footnote" tone={room.kind === 'short' ? 'critical' : 'variant'}>
        {transferRoomLineOf(room, person.name)}
      </Text>
      <Text variant="footnote" tone="variant">
        {TRANSFER_KEEP_LINE}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label={offerButtonOf(person.name)}
          icon="user"
          loading={offer.busy}
          disabled={!canOfferOf(room, live)}
          onPress={() => {
            offer.run({ itemId: item.id, toProfileId: person.id });
          }}
        />
        <Button label="Cancel" variant="text" onPress={onCancel} />
      </View>
      <Problem text={offer.problem} />
    </View>
  );
}

function Offer({ item }: { readonly item: TransferItem }): ReactNode {
  const live = useSyncStatus().status === 'live';
  const profiles = useProfiles();
  const candidates = transferCandidatesOf(profiles, useViewerId());
  const [picked, setPicked] = useState<string | null>(null);
  const person = candidates.find((each) => each.id === picked) ?? null;
  if (candidates.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        There is nobody else in the home to give it to.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <View role="list" aria-label="Who gets it" className="flex-row flex-wrap gap-2">
        {candidates.map((each) => (
          <PersonPick
            key={each.id}
            person={each}
            spoken={`Give ${item.name} to ${each.name}`}
            picked={each.id === picked}
            disabled={!live}
            onPick={() => {
              setPicked((current) => (current === each.id ? null : each.id));
            }}
          />
        ))}
      </View>
      {person === null ? null : (
        <Confirm
          item={item}
          person={person}
          onCancel={() => {
            setPicked(null);
          }}
        />
      )}
    </View>
  );
}

export function TransferSection({
  item,
  access,
}: {
  readonly item: TransferItem;
  readonly access: DriveAccess;
}): ReactNode {
  const transfers = useDriveTransferRows();
  const profiles = useProfiles();
  if (access !== 'own') return null;
  const offer = openOfferOf(transfers, item.id);
  const recipient =
    offer === null
      ? null
      : (profiles.find((profile) => profile.id === offer.toProfileId)?.name ?? 'A former member');
  return (
    <View className="gap-3">
      <SectionTitle text={TRANSFER_TITLE} />
      {offer === null || recipient === null ? (
        <Offer item={item} />
      ) : (
        <Waiting offer={offer} recipient={recipient} />
      )}
    </View>
  );
}
