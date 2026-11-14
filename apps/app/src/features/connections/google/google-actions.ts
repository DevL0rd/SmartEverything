import { useState } from 'react';
import type { GoogleAccountRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  chooseGoogleTask,
  storeGoogleApp,
  syncGoogle,
  unlinkGoogle,
  updateGoogleAccount,
} from '../../../api/google';
import { confirm } from '../../../components/confirm-store';
import { notify, notifyFailure } from '../../../components/toast-store';
import { trackConnection } from '../connections-log';
import { calendarIdsWith } from './google-choices';
import type { GoogleAppDraft } from './google-app-setup';
import { useRefreshSyncLog } from './use-google';

export interface Busy {
  readonly busy: boolean;
  readonly run: () => void;
}

function useBusy(work: () => Promise<void>): Busy {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: (): void => {
      if (busy) return;
      setBusy(true);
      background(
        work().finally(() => {
          setBusy(false);
        }),
        'google.action_failed',
      );
    },
  };
}

export function useSyncNow(personId: string): Busy {
  return useBusy(() =>
    trackConnection('google.sync', {}, () => syncGoogle(personId)).then(() => {
      notify({ message: 'Google synced' });
    }, notifyFailure('Google didn’t sync')),
  );
}

export function useSaveGoogleApp(draft: GoogleAppDraft, saved: () => void): Busy {
  return useBusy(() =>
    trackConnection('google.app_store', {}, () => storeGoogleApp(draft)).then(() => {
      saved();
      notify({ message: 'Google app saved' });
    }, notifyFailure('The Google app wasn’t saved')),
  );
}

export function setCalendarSync(account: GoogleAccountRow, googleId: string, on: boolean): void {
  const calendar_ids = calendarIdsWith(account, googleId, on);
  trackConnection('google.calendars', {}, () =>
    updateGoogleAccount(account.profile_id, { calendar_ids }),
  ).catch(notifyFailure('The calendar choice wasn’t saved'));
}

export function useChooseTask(personId: string): (logId: string, googleId: string) => void {
  const refresh = useRefreshSyncLog(personId);
  return (logId, googleId) => {
    trackConnection('google.choice', {}, () => chooseGoogleTask(personId, logId, googleId))
      .then(refresh)
      .catch(notifyFailure('That task wasn’t kept'));
  };
}

export function unlinkGoogleOf(personId: string, subject: string): void {
  background(
    confirm({
      title: `Unlink ${subject}?`,
      body: 'Syncing stops and the stored Google sign-in is deleted. Every planner item stays here.',
      confirmLabel: 'Unlink',
      tone: 'destructive',
    }).then((accepted) => {
      if (!accepted) return;
      trackConnection('google.unlink', {}, () => unlinkGoogle(personId)).catch(
        notifyFailure('Google wasn’t unlinked'),
      );
    }),
    'google.confirm_failed',
  );
}
