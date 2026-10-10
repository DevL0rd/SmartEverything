import type { ReactNode } from 'react';
import { useState } from 'react';
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
import { TextEditSheet, type TextEditRequest } from '../../settings/text-edit-sheet';

type SexChoice = Sex | 'unset';

const SEX_OPTIONS = [
  { value: 'unset', label: 'Not set' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function saveProfile(profileId: string, change: ProfileChange): void {
  updateProfile(profileId, change).catch((error: unknown) => {
    notify({ message: 'The profile was not changed', error, tone: 'critical' });
  });
}

function birthText(birthDate: string | null): string {
  if (birthDate === null) {
    return 'Not set';
  }
  return new Date(`${birthDate}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function BirthDate({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  return (
    <>
      <ListRow
        icon="calendar"
        title="Birth date"
        value={birthText(profile.birth_date)}
        chevron
        onPress={() => {
          setRequest({
            title: 'Birth date',
            label: 'Birth date',
            initial: profile.birth_date ?? '',
            placeholder: '1990-05-01',
            confirmLabel: 'Save',
            maxLength: 10,
            helper: 'Year, month and day, like 1990-05-01',
            problemOf: (text) =>
              DATE.test(text) && !Number.isNaN(Date.parse(text)) ? null : 'Use the form 1990-05-01',
            save: (text) => updateProfile(profile.id, { birth_date: text }).then(() => undefined),
          });
        }}
      />
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}

const TYPICAL_HEIGHT_CM = 170;

function Height({ profile }: { readonly profile: ProfileRow }): ReactNode {
  const height = profile.height_cm;
  if (height === null) {
    return (
      <ListRow
        icon="ruler"
        title="Height"
        value="Add"
        chevron
        onPress={() => {
          saveProfile(profile.id, { height_cm: TYPICAL_HEIGHT_CM });
        }}
      />
    );
  }
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
          value={height}
          onChange={(next) => {
            saveProfile(profile.id, { height_cm: next });
          }}
        />
      }
    />
  );
}

export function BodyDetails({ profile }: { readonly profile: ProfileRow }): ReactNode {
  return (
    <>
      <SelectRow<SexChoice>
        icon="user"
        title="Sex"
        options={SEX_OPTIONS}
        value={profile.sex ?? 'unset'}
        onChange={(choice) => {
          saveProfile(profile.id, { sex: choice === 'unset' ? null : choice });
        }}
      />
      <BirthDate profile={profile} />
      <Height profile={profile} />
    </>
  );
}
