import type { PlannerGuestRow, PlannerItemRow, PlannerRsvpAnswer } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useRow } from '../../../store/selectors';
import type { PlannerPerson } from '../data';
import { useGuestWrites, useMyGuest, type RsvpChoice } from '../data/guests';
import { ANSWER_ORDER } from './guests-model';
import { reported } from './item-actions';

const ANSWER: Readonly<Record<PlannerRsvpAnswer, { label: string; icon: IconName }>> = {
  yes: { label: 'Yes', icon: 'check' },
  maybe: { label: 'Maybe', icon: 'circle' },
  no: { label: 'No', icon: 'x' },
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
  readonly onAnswer: (choice: RsvpChoice) => void;
}

function Answers({
  guest,
  disabled,
  onAnswer,
  note,
}: BarProps & { readonly note: string }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ANSWER_ORDER.map((answer) => (
        <Button
          key={answer}
          label={ANSWER[answer].label}
          icon={ANSWER[answer].icon}
          variant={guest.response === answer ? 'filled' : 'outlined'}
          disabled={disabled}
          onPress={() => {
            onAnswer({ response: answer, note: noteOf(note) });
          }}
        />
      ))}
    </View>
  );
}

function Bar(props: BarProps): ReactNode {
  const { guest, organiser, disabled, onAnswer } = props;
  const [note, setNote] = useState(guest.note ?? '');
  const answered = guest.response !== 'needs_action';
  return (
    <View className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-2 p-3">
      <Text variant="label">{questionOf(guest, organiser)}</Text>
      <Answers {...props} note={note} />
      {answered ? (
        <TextField
          label="Note for the organiser"
          value={note}
          onChange={setNote}
          onBlur={() => {
            const next = noteOf(note);
            if (next !== guest.note && guest.response !== 'needs_action') {
              onAnswer({ response: guest.response, note: next });
            }
          }}
          placeholder="Running ten minutes late"
          disabled={disabled}
        />
      ) : null}
    </View>
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
      onAnswer={(choice) => {
        reported(writes.respond(guest, choice), 'Couldn’t send your answer');
      }}
    />
  );
}
