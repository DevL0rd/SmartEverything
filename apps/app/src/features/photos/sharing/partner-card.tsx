import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { PartnerShare } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useSyncStatus } from '../../../store/selectors';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { partnerTabIdOf } from '../model/library-tabs';
import { usePhotoPeople } from '../people/queries';
import { acceptPartner, setPartnerAutoSave, stopPartner } from './api';
import {
  groupNamesOf,
  nameOf,
  partnerScopeLine,
  partnerSidesOf,
  partnerStateLine,
  type PartnerSides,
} from './model';
import { invalidateSharing } from './queries';
import { SectionTitle } from './section-title';

function useRefreshAfter(): (
  mutation: MutationState,
  work: () => Promise<unknown>,
  failure: string,
  label: string,
) => void {
  const client = useQueryClient();
  return (mutation, work, failure, label) => {
    mutation.run(work, {
      failure,
      label,
      onDone: () => {
        invalidateSharing(client);
      },
    });
  };
}

function PartnerHead({
  share,
  other,
}: {
  readonly share: PartnerShare;
  readonly other: string;
}): ReactNode {
  const people = useProfiles();
  const profile = people.find((candidate) => candidate.id === other);
  const me = useActiveProfile()?.id ?? null;
  const groups = usePhotoPeople().data?.groups ?? [];
  const names = share.sharerId === me ? groupNamesOf(share.groupIds, groups) : 'chosen people';
  return (
    <View className="flex-row items-center gap-3">
      {profile === undefined ? (
        <Icon name="user" size={24} tone="variant" />
      ) : (
        <ProfileAvatar profile={profile} size="l" />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-3" numberOfLines={1}>
          {nameOf(other, people, me)}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {`${partnerStateLine(share, me)} · ${partnerScopeLine(share, names)}`}
        </Text>
      </View>
    </View>
  );
}

function useLive(): boolean {
  return useSyncStatus().status === 'live';
}

function stopQuestion(name: string, sharing: boolean): Promise<boolean> {
  return confirm({
    title: sharing ? `Stop sharing with ${name}?` : `Stop seeing ${name}’s photos?`,
    body: sharing
      ? 'They no longer see your photos. Photos they saved stay in their library.'
      : 'Their tab leaves your Library. Photos you saved stay in your library.',
    confirmLabel: sharing ? 'Stop sharing' : 'Stop seeing',
    tone: 'destructive',
  });
}

function StopButton({
  share,
  name,
  sharing,
  label,
}: {
  readonly share: PartnerShare;
  readonly name: string;
  readonly sharing: boolean;
  readonly label: string;
}): ReactNode {
  const mutation = useMutationState();
  const after = useRefreshAfter();
  const live = useLive();
  return (
    <Button
      label={label}
      variant="text"
      disabled={!live}
      loading={mutation.busy}
      onPress={() => {
        background(
          stopQuestion(name, sharing).then((accepted) => {
            if (!accepted) return;
            after(
              mutation,
              () => stopPartner(share.id),
              'Sharing did not stop',
              'photos.partner.stop',
            );
          }),
          'photos.partner.stop_confirm_failed',
        );
      }}
    />
  );
}

export interface PartnerRowProps {
  readonly share: PartnerShare;
  readonly onChange: (share: PartnerShare) => void;
}

function Outgoing({ share, onChange }: PartnerRowProps): ReactNode {
  const name = nameOf(share.recipientId, useProfiles(), null);
  const live = useLive();
  return (
    <View className="gap-3">
      <PartnerHead share={share} other={share.recipientId} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Change"
          icon="pencil"
          variant="tonal"
          disabled={!live}
          onPress={() => {
            onChange(share);
          }}
        />
        <StopButton share={share} name={name} sharing label="Stop sharing" />
      </View>
    </View>
  );
}

function Offered({ share }: { readonly share: PartnerShare }): ReactNode {
  const mutation = useMutationState();
  const after = useRefreshAfter();
  const live = useLive();
  return (
    <View className="gap-3 rounded-md bg-primary-container/40 p-3">
      <PartnerHead share={share} other={share.sharerId} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Accept"
          icon="check"
          variant="filled"
          disabled={!live}
          loading={mutation.busy}
          onPress={() => {
            after(
              mutation,
              () => acceptPartner(share.id),
              'The offer was not accepted',
              'photos.partner.accept',
            );
          }}
        />
        <Button
          label="Decline"
          variant="text"
          disabled={!live || mutation.busy}
          onPress={() => {
            after(
              mutation,
              () => stopPartner(share.id),
              'The offer was not declined',
              'photos.partner.decline',
            );
          }}
        />
      </View>
    </View>
  );
}

function Receiving({ share }: { readonly share: PartnerShare }): ReactNode {
  const mutation = useMutationState();
  const after = useRefreshAfter();
  const name = nameOf(share.sharerId, useProfiles(), null);
  const live = useLive();
  return (
    <View className="gap-3">
      <PartnerHead share={share} other={share.sharerId} />
      <View className="-mx-4">
        <SwitchRow
          title="Auto-save to my library"
          subtitle={`Every new photo ${name} shares lands in your library by itself.`}
          wrapSubtitle
          value={share.autoSave}
          disabled={!live || mutation.busy}
          onChange={(on) => {
            after(
              mutation,
              () => setPartnerAutoSave(share.id, on),
              'Auto-save did not change',
              'photos.partner.auto_save',
            );
          }}
        />
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={`Open ${name}’s photos`}
          icon="image"
          variant="tonal"
          href={href.photos({ tab: partnerTabIdOf(share.id) })}
        />
        <StopButton share={share} name={name} sharing={false} label="Stop seeing" />
      </View>
    </View>
  );
}

function NoPartner({ onStart }: { readonly onStart: () => void }): ReactNode {
  const live = useLive();
  return (
    <View className="gap-3">
      <Text variant="body" tone="variant">
        Share all your photos, or only photos of chosen people, with one person at home. New photos
        reach them by themselves.
      </Text>
      <View className="flex-row">
        <Button
          label="Share with a partner"
          icon="plus"
          variant="filled"
          disabled={!live}
          onPress={onStart}
        />
      </View>
    </View>
  );
}

function Side({
  title,
  shares,
  children,
}: {
  readonly title: string;
  readonly shares: readonly PartnerShare[];
  readonly children: (share: PartnerShare) => ReactNode;
}): ReactNode {
  if (shares.length === 0) return null;
  return (
    <View className="gap-3">
      <Text variant="caption" tone="variant" className="font-sans-medium">
        {title}
      </Text>
      {shares.map(children)}
    </View>
  );
}

function sidesEmpty(sides: PartnerSides): boolean {
  return sides.outgoing.length + sides.offered.length + sides.receiving.length === 0;
}

export function PartnerCard({
  partners,
  onStart,
  onChange,
}: {
  readonly partners: readonly PartnerShare[];
  readonly onStart: () => void;
  readonly onChange: (share: PartnerShare) => void;
}): ReactNode {
  const me = useActiveProfile()?.id ?? null;
  const sides = partnerSidesOf(partners, me);
  const live = useLive();
  return (
    <View className="gap-3">
      <SectionTitle
        title="Partner sharing"
        action={
          sidesEmpty(sides) ? undefined : (
            <Button
              label="Add partner"
              icon="plus"
              variant="text"
              disabled={!live}
              onPress={onStart}
            />
          )
        }
      />
      <Card>
        <View className="gap-5">
          <Side title="Offered to you" shares={sides.offered}>
            {(share) => <Offered key={share.id} share={share} />}
          </Side>
          <Side title="Shared with you" shares={sides.receiving}>
            {(share) => <Receiving key={share.id} share={share} />}
          </Side>
          <Side title="You share with" shares={sides.outgoing}>
            {(share) => <Outgoing key={share.id} share={share} onChange={onChange} />}
          </Side>
          {sidesEmpty(sides) ? <NoPartner onStart={onStart} /> : null}
        </View>
      </Card>
    </View>
  );
}
