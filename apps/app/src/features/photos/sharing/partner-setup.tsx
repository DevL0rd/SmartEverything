import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { PhotoGroup } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { DateNav } from '../../../components/date-nav';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { localDayKey } from '../../../format/time';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { FaceAvatar } from '../people/face-avatar';
import { usePhotoPeople } from '../people/queries';
import { longDay } from '../model/media-text';
import { setPartner } from './api';
import {
  STEP_TITLE,
  PARTNER_STEPS,
  bodyOf,
  nextStep,
  previousStep,
  stepNumber,
  stepReady,
  toggleGroup,
  withScope,
  type PartnerDraft,
} from './partner-draft';
import { groupNamesOf, nameOf } from './model';
import { invalidateSharing } from './queries';

interface StepProps {
  readonly draft: PartnerDraft;
  readonly onDraft: (draft: PartnerDraft) => void;
}

function PersonStep({ draft, onDraft }: StepProps): ReactNode {
  const me = useActiveProfile()?.id ?? null;
  const people = useProfiles().filter((profile) => profile.id !== me);
  if (people.length === 0) {
    return (
      <Text variant="body" tone="variant">
        Nobody else lives in this home yet. Add a person in Settings, then share with them.
      </Text>
    );
  }
  return (
    <View className="gap-1">
      {people.map((profile) => (
        <ListRow
          key={profile.id}
          title={profile.name}
          leading={<ProfileAvatar profile={profile} />}
          selected={draft.recipientId === profile.id}
          onPress={() => {
            onDraft({ ...draft, recipientId: profile.id });
          }}
        />
      ))}
    </View>
  );
}

function FaceChoice({
  group,
  chosen,
  onPress,
}: {
  readonly group: PhotoGroup;
  readonly chosen: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const name = group.name ?? 'Unnamed';
  return (
    <Interactive
      label={name}
      role="checkbox"
      checked={chosen}
      onPress={onPress}
      className="w-24 items-center gap-1.5 rounded-md p-1.5"
      layerClassName="rounded-md"
    >
      <FaceAvatar
        itemId={group.coverItemId}
        box={group.coverBox}
        kind={group.kind}
        size={72}
        className={cn(chosen ? 'border-2 border-primary' : 'border-2 border-transparent')}
      />
      <Text variant="caption" numberOfLines={1} tone={chosen ? 'primary' : 'default'}>
        {name}
      </Text>
    </Interactive>
  );
}

function FacePicker({ draft, onDraft }: StepProps): ReactNode {
  const groups = (usePhotoPeople('person').data?.groups ?? []).filter(
    (group) => !group.hidden && group.name !== null,
  );
  if (groups.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Name people in People and pets first; then you can choose them here.
      </Text>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-1">
      {groups.map((group) => (
        <FaceChoice
          key={group.id}
          group={group}
          chosen={draft.groupIds.includes(group.id)}
          onPress={() => {
            onDraft(toggleGroup(draft, group.id));
          }}
        />
      ))}
    </View>
  );
}

function ScopeStep({ draft, onDraft }: StepProps): ReactNode {
  return (
    <View className="gap-3">
      <Segmented
        options={[
          { value: 'all', label: 'All photos' },
          { value: 'people', label: 'Chosen people' },
        ]}
        value={draft.scope}
        label="Which photos"
        fill
        onChange={(scope) => {
          onDraft(withScope(draft, scope));
        }}
      />
      {draft.scope === 'people' ? <FacePicker draft={draft} onDraft={onDraft} /> : null}
    </View>
  );
}

function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

function DateStep({ draft, onDraft }: StepProps): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="footnote" tone="variant">
        Photos taken on or after this day are shared. Older photos stay private.
      </Text>
      <DateNav
        value={dayDate(draft.fromDay)}
        range="day"
        max={new Date()}
        onChange={(date) => {
          onDraft({ ...draft, fromDay: localDayKey(date) });
        }}
      />
      <Text variant="title-3" className="tabular-nums">
        {longDay(draft.fromDay)}
      </Text>
    </View>
  );
}

function ReviewStep({ draft }: StepProps): ReactNode {
  const people = useProfiles();
  const groups = usePhotoPeople('person').data?.groups ?? [];
  const body = bodyOf(draft);
  if (body === null) return null;
  const who = nameOf(body.recipientId, people, null);
  const what =
    body.scope === 'all'
      ? 'All your photos'
      : `Your photos of ${groupNamesOf(body.groupIds, groups)}`;
  return (
    <View className="gap-2">
      <Text variant="body">{`${what}, taken from ${longDay(body.fromDay)}, are shared with ${who}.`}</Text>
      <Text variant="footnote" tone="variant">
        {`${who} sees them once they accept. You can change or stop this at any time.`}
      </Text>
    </View>
  );
}

const STEP_BODY = {
  person: PersonStep,
  scope: ScopeStep,
  date: DateStep,
  review: ReviewStep,
} as const;

function Footer({
  draft,
  onDraft,
  onClose,
}: StepProps & { readonly onClose: () => void }): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const back = previousStep(draft);
  const last = draft.step === 'review';
  const send = (): void => {
    const body = bodyOf(draft);
    if (body === null) return;
    mutation.run(() => setPartner(body), {
      failure: 'Partner sharing was not set up',
      label: 'photos.partner.set',
      onDone: () => {
        invalidateSharing(client);
        notify({ message: 'Partner sharing is set up' });
        onClose();
      },
    });
  };
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      {back === null ? null : (
        <Button
          label="Back"
          variant="text"
          onPress={() => {
            onDraft(back);
          }}
        />
      )}
      <Button
        label={last ? 'Share' : 'Next'}
        variant="filled"
        disabled={!stepReady(draft)}
        loading={mutation.busy}
        onPress={
          last
            ? send
            : (): void => {
                onDraft(nextStep(draft));
              }
        }
      />
    </View>
  );
}

export function PartnerSetup({
  draft,
  onDraft,
  onClose,
}: {
  readonly draft: PartnerDraft | null;
  readonly onDraft: (draft: PartnerDraft) => void;
  readonly onClose: () => void;
}): ReactNode {
  if (draft === null) return null;
  const Body = STEP_BODY[draft.step];
  return (
    <Sheet
      open
      onClose={onClose}
      title={STEP_TITLE[draft.step]}
      footer={<Footer draft={draft} onDraft={onDraft} onClose={onClose} />}
    >
      <View className="gap-4">
        <Text variant="caption" tone="variant" className="tabular-nums">
          {`Step ${String(stepNumber(draft.step))} of ${String(PARTNER_STEPS.length)}`}
        </Text>
        <Body draft={draft} onDraft={onDraft} />
      </View>
    </Sheet>
  );
}
