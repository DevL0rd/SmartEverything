import type { PlannerGuestRow, PlannerItemRow, PlannerRsvpAnswer } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';
import { useRow } from '../../../store/selectors';
import type { PlannerPerson } from '../data';
import { useGuestWrites, useMyGuest, type RsvpChoice } from '../data/guests';
import { ANSWER_ORDER, RESPONSE_TEXT } from './guests-model';
import { reported } from './item-actions';

const ANSWER: Readonly<Record<PlannerRsvpAnswer, { label: string; icon: IconName }>> = {
  yes: { label: RESPONSE_TEXT.yes, icon: 'check' },
  maybe: { label: RESPONSE_TEXT.maybe, icon: 'circleHelp' },
  no: { label: RESPONSE_TEXT.no, icon: 'x' },
};

export function noteOf(text: string): string | null {
  const note = text.trim();
  return note === '' ? null : note;
}

const ANSWERED: Readonly<Record<PlannerRsvpAnswer, string>> = {
  yes: 'You’re going',
  maybe: 'You might go',
  no: 'You’re not going',
};

function questionOf(guest: PlannerGuestRow, organiser: string): string {
  if (guest.response === 'needs_action') return `${organiser} invited you. Going?`;
  return ANSWERED[guest.response];
}

interface BarProps {
  readonly guest: PlannerGuestRow;
  readonly organiser: string;
  readonly disabled: boolean;
  readonly onAnswer: (choice: RsvpChoice) => Promise<unknown>;
}

const FAILED = 'Couldn’t send your answer';

function Answers({
  guest,
  disabled,
  onAnswer,
  note,
}: BarProps & { readonly note: string }): ReactNode {
  const phone = useIsPhone();
  return (
    <View className={cn('flex-row gap-2', !phone && 'self-start')}>
      {ANSWER_ORDER.map((answer) => (
        <Button
          key={answer}
          label={ANSWER[answer].label}
          {...(phone ? {} : { icon: ANSWER[answer].icon })}
          grow={phone}
          variant={guest.response === answer ? 'filled' : 'outlined'}
          disabled={disabled}
          onPress={() => {
            reported(onAnswer({ response: answer, note: noteOf(note) }), FAILED);
          }}
        />
      ))}
    </View>
  );
}

function Bar(props: BarProps): ReactNode {
  const { guest, organiser, disabled, onAnswer } = props;
  const [note, setNote] = useState(guest.note ?? '');
  const [sent, setSent] = useState(false);
  const answered = guest.response !== 'needs_action';
  return (
    <Card>
      <Text variant="label">{questionOf(guest, organiser)}</Text>
      <Answers {...props} note={note} />
      {answered ? (
        <TextField
          label="Note for the organiser"
          value={note}
          onChange={(value) => {
            setNote(value);
            setSent(false);
          }}
          onBlur={() => {
            const next = noteOf(note);
            if (next !== guest.note && guest.response !== 'needs_action') {
              reported(
                onAnswer({ response: guest.response, note: next }).then(() => {
                  setSent(true);
                }),
                FAILED,
              );
            }
          }}
          placeholder="Running ten minutes late"
          disabled={disabled}
          {...(sent ? { helper: 'Note sent' } : {})}
        />
      ) : null}
    </Card>
  );
}

export function RsvpBar({
  item,
  person,
  disabled,
}: {
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}): ReactNode {
  const guest = useMyGuest(person, item.series_id ?? item.id);
  const organiser = useRow('profiles', item.profile_id)?.name ?? 'Someone';
  const writes = useGuestWrites(person);
  if (guest === null) return null;
  return (
    <Bar
      key={guest.id}
      guest={guest}
      organiser={organiser}
      disabled={disabled}
      onAnswer={(choice) => writes.respond(guest, choice)}
    />
  );
}
