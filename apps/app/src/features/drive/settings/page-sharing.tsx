import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveSettings } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { count } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useDriveSettings } from '../data';
import { DriveSettingsSection } from './page';
import { SettingsQueryState, saveDriveSettings } from './page-indexing';

const WHOLE_NUMBER = /^\d+$/;

export const NUMBER_LENGTH = String(Number.MAX_SAFE_INTEGER).length;

export function daysText(days: number): string {
  return days === 1 ? '1 day' : `${count(days)} days`;
}

export function daysOf(text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return null;
  const days = Number(trimmed);
  return Number.isSafeInteger(days) && days > 0 ? days : null;
}

class DaysEntryError extends Error {
  override readonly name = 'DaysEntryError';
}

export function requiredDays(text: string): number {
  const days = daysOf(text);
  if (days === null) throw new DaysEntryError(`${text} is not a whole number of days.`);
  return days;
}

export function daysProblemOf(text: string): string | null {
  return daysOf(text) === null ? 'Use a whole number of days, 1 or more' : null;
}

export function membersLineOf(allowed: boolean): string {
  return allowed
    ? 'Everyone in the home can make links to share outside it'
    : 'Only you can make links to share outside the home';
}

function MembersRow({ settings }: { readonly settings: DriveSettings }): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  return (
    <SwitchRow
      title="Members can make links"
      icon="users"
      subtitle={membersLineOf(settings.membersMayShare)}
      wrapSubtitle
      value={settings.membersMayShare}
      disabled={mutation.busy}
      onChange={(next) => {
        mutation.run(() => saveDriveSettings(client, { membersMayShare: next }), {
          failure: 'Who can make links did not change',
          label: 'drive_settings.members_may_share',
        });
      }}
    />
  );
}

function useUploadExpiryRequest(
  settings: DriveSettings,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  const client = useQueryClient();
  return {
    id: 'drive.sharing.upload_expiry',
    opener,
    title: 'Unfinished uploads',
    label: 'Days to keep an unfinished upload',
    initial: String(settings.uploadExpiryDays),
    placeholder: String(settings.uploadExpiryDays),
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: 'number',
    helper:
      'An upload that stops part way can resume until then. After that its parts are removed.',
    problemOf: daysProblemOf,
    save: async (text): Promise<void> => {
      await saveDriveSettings(client, { uploadExpiryDays: requiredDays(text) });
    },
  };
}

function UploadExpiryRow({ settings }: { readonly settings: DriveSettings }): ReactNode {
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useUploadExpiryRequest(settings, opener);
  return (
    <>
      <ListRow
        title="Unfinished uploads"
        icon="upload"
        subtitle="How long a stopped upload can resume"
        value={daysText(settings.uploadExpiryDays)}
        chevron
        pressRef={opener}
        onPress={() => {
          setOpen(true);
        }}
      />
      <TextEditSheet
        request={open ? request : null}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function SharingBody({ settings }: { readonly settings: DriveSettings }): ReactNode {
  return (
    <List inset>
      <MembersRow settings={settings} />
      <UploadExpiryRow settings={settings} />
    </List>
  );
}

export function SharingSection(): ReactNode {
  const settings = useDriveSettings();
  return (
    <DriveSettingsSection section="sharing">
      {settings.data === undefined ? (
        <SettingsQueryState query={settings} event="drive_settings.sharing_refetch_failed" />
      ) : (
        <SharingBody settings={settings.data} />
      )}
    </DriveSettingsSection>
  );
}
