import type { PlannerRsvpAnswer } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useRow, useSettings } from '../../../store/selectors';
import { useGuestWrites, useMyInvitations, type Invitation } from '../data/guests';
import { usePlannerFrame } from '../frame/frame-context';
import {
  ANSWER_ORDER,
  invitationWhenOf,
  invitationsTitleOf,
  openInvitationsOf,
} from '../item/guests-model';
import { reported } from '../item/item-actions';
import { PersonBadge } from '../item/person-badge';
import { useItemOpen } from '../item/selection';
import { useInstantClock } from '../../../store/clock-format';

const ANSWER_LABEL: Readonly<Record<PlannerRsvpAnswer, string>> = {
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
};

function Answers({ invitation }: { readonly invitation: Invitation }): ReactNode {
  const { person, offline } = usePlannerFrame();
  const writes = useGuestWrites(person);
  return (
    <View className="flex-row flex-wrap gap-2">
      {ANSWER_ORDER.map((answer) => (
        <Button
          key={answer}
          label={ANSWER_LABEL[answer]}
          spoken={`${ANSWER_LABEL[answer]} to ${invitation.item.title}`}
          variant={invitation.guest.response === answer ? 'tonal' : 'outlined'}
          disabled={offline}
          onPress={() => {
            reported(
              writes.respond(invitation.guest, { response: answer, note: null }),
              'Couldn’t send your answer',
            );
          }}
        />
      ))}
    </View>
  );
}

const InvitationRow = memo(function InvitationRow({
  invitation,
  when,
}: {
  readonly invitation: Invitation;
  readonly when: string;
}): ReactNode {
  const organiser = useRow('profiles', invitation.item.profile_id);
  const name = organiser?.name ?? 'Someone in the home';
  const open = useItemOpen(invitation.item.id, null);
  return (
    <View className="gap-2 py-2">
      <Interactive
        {...open}
        label={`${invitation.item.title}, ${when}, from ${name}`}
        className="min-h-11 flex-row items-center gap-3 rounded-sm"
        layerClassName="rounded-sm"
      >
        <PersonBadge profile={organiser} name={name} />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {invitation.item.title}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {`${when} · from ${name}`}
          </Text>
        </View>
      </Interactive>
      <Answers invitation={invitation} />
    </View>
  );
});

export function InvitationsCard(): ReactNode {
  const { person } = usePlannerFrame();
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  const instant = useInstantClock();
  const myInvitations = useMyInvitations(person);
  const shown = openInvitationsOf(myInvitations, now);
  if (shown.length === 0) return null;
  return (
    <Card title={invitationsTitleOf(shown.length)} icon="users">
      <View>
        {shown.map((invitation) => (
          <InvitationRow
            key={invitation.guest.id}
            invitation={invitation}
            when={invitationWhenOf(invitation.item, now, timeZone, instant)}
          />
        ))}
      </View>
    </Card>
  );
}
