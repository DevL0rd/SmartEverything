import type { ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  HEIGHT_LIMITS,
  type ProfileChange,
  type ProfileRow,
  type Sex,
} from '@smarteverything/domain';
import { updateProfile } from '../../api/people';
import { ListRow } from '../../components/list-row';
import { NumberStepper } from '../../components/number-stepper';
import { SelectRow } from '../../components/rows';
import { notify } from '../../components/toast-store';
import { useCommittedNumber } from '../../design/use-committed-number';
import { dateFormat } from '../../format/locale';
import { AddHeightSheet, BirthDateSheet } from './body-sheets';

type SexChoice = Sex | 'unset';

const SEX_OPTIONS = [
  { value: 'unset', label: 'Not set' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const;

export function useProfileSave(profileId: string): {
  readonly save: (change: ProfileChange, onSaved?: () => void) => void;
  readonly saveAsync: (change: ProfileChange) => Promise<unknown>;
} {
  const mutation = useMutation({
    mutationFn: (change: ProfileChange) => updateProfile(profileId, change),
    onError: (error): void => {
      notify({ message: 'The profile was not changed', error, tone: 'critical' });
    },
  });
  return {
    save: (change, onSaved): void => {
      mutation.mutate(change, onSaved === undefined ? {} : { onSuccess: onSaved });
    },
    saveAsync: mutation.mutateAsync,
  };
}

function birthText(birthDate: string | null): string {
  if (birthDate === null) {
    return 'Not set';
  }
  return dateFormat({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${birthDate}T12:00:00Z`));
}

function BirthDate({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const { save } = useProfileSave(profile.id);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <ListRow
        icon="calendar"
        title="Birth date"
        value={birthText(profile.birth_date)}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <BirthDateSheet
          birthDate={profile.birth_date}
          onClose={close}
          onSave={(birthDate) => {
            save({ birth_date: birthDate }, close);
          }}
        />
      ) : null}
    </>
  );
}

function HeightStepper({
  profileId,
  height,
}: {
  readonly profileId: string;
  readonly height: number;
}): ReactNode {
  const { saveAsync } = useProfileSave(profileId);
  const committed = useCommittedNumber(height, (cm) => saveAsync({ height_cm: cm }));
  return (
    <ListRow
      icon="ruler"
      title="Height"
      trailing={
        <NumberStepper
          label="Height"
          unit="cm"
          min={HEIGHT_LIMITS.min}
          max={HEIGHT_LIMITS.max}
          step={1}
          value={committed.shown}
          onChange={committed.set}
        />
      }
    />
  );
}

function Height({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const [adding, setAdding] = useState(false);
  const { save } = useProfileSave(profile.id);
  if (profile.height_cm !== null) {
    return <HeightStepper profileId={profile.id} height={profile.height_cm} />;
  }
  const close = (): void => {
    setAdding(false);
  };
  return (
    <>
      <ListRow
        icon="ruler"
        title="Height"
        value="Add"
        chevron
        onPress={() => {
          setAdding(true);
        }}
      />
      {adding ? (
        <AddHeightSheet
          onClose={close}
          onSave={(heightCm) => {
            save({ height_cm: heightCm }, close);
          }}
        />
      ) : null}
    </>
  );
}

export function BodyDetails({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const { save } = useProfileSave(profile.id);
  return (
    <>
      <SelectRow<SexChoice>
        icon="user"
        title="Sex"
        options={SEX_OPTIONS}
        value={profile.sex ?? 'unset'}
        onChange={(choice) => {
          save({ sex: choice === 'unset' ? null : choice });
        }}
      />
      <BirthDate profile={profile} />
      <Height profile={profile} />
    </>
  );
}
