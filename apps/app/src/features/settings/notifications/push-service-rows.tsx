import type { ReactNode } from 'react';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { usePushDeliveries } from '../../../api/diagnostics';
import {
  clearPushAccount,
  savePushAccount,
  serviceAccountOf,
  ServiceAccountError,
} from '../../../api/settings';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { ActionRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { jsonText } from '../../../format/json-text';
import { relative } from '../../../format/time';
import { pickTextFile } from '../../../platform/text-file';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';

export const FIREBASE_PAGE = 'notifications/push-service/firebase';

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({
      message,
      error,
      tone: 'critical',
    });
  };
}

async function saveKey(read: () => Promise<string | null>): Promise<boolean> {
  const text = await read();
  if (text === null) {
    return false;
  }
  const parsed = jsonText(text);
  if (!parsed.ok) {
    throw new ServiceAccountError('it is not JSON');
  }
  const account = serviceAccountOf(parsed.value);
  await savePushAccount(account);
  notify({
    message: 'Key saved',
    detail: `${account.project_id} · ${account.client_email}`,
    tone: 'positive',
  });
  return true;
}

function useSaving(): {
  readonly busy: boolean;
  readonly run: (read: () => Promise<string | null>) => void;
} {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: (read): void => {
      setBusy(true);
      saveKey(read).then(
        () => {
          setBusy(false);
        },
        (error: unknown) => {
          setBusy(false);
          failed('The key was not saved')(error);
        },
      );
    },
  };
}

function deliverySummary(
  status: ReturnType<typeof usePushDeliveries>,
  now: number,
): { readonly text: string; readonly tone: 'variant' | 'positive' | 'critical' } {
  const data = status.data;
  if (data === undefined) {
    return { text: 'Checking the last alert', tone: 'variant' };
  }
  if (data.lastError !== null) {
    return { text: `Last alert failed · ${data.lastError}`, tone: 'critical' };
  }
  if (data.lastSentAt === null) {
    return { text: 'No alert sent yet', tone: 'variant' };
  }
  return { text: `Last alert sent ${relative(data.lastSentAt, now)}`, tone: 'positive' };
}

export function PushStatusRow(): ReactNode {
  const project = useSettings().push_project_id;
  const deliveries = usePushDeliveries();
  const summary = deliverySummary(deliveries, useMinute());
  return (
    <ListRow
      title="Alerts when the app is closed"
      subtitle={
        project === null
          ? 'Not set up · phones get alerts while the app is open'
          : `${project} · ${summary.text}`
      }
      subtitleTone={project === null ? 'variant' : summary.tone}
      wrapSubtitle
      icon={project === null ? 'bellOff' : 'bell'}
      iconTone={project === null ? 'variant' : 'positive'}
      value={project === null ? 'Off' : 'On'}
    />
  );
}

export function PushPurposeRow(): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      Lets your hub send call alerts to your phone through Firebase.
    </Text>
  );
}

export function ChooseKeyRow(): ReactNode {
  const saving = useSaving();
  return (
    <ActionRow
      title="Import key file"
      subtitle="Pick the .json key you downloaded from Firebase"
      icon="key"
      disabled={saving.busy}
      onPress={() => {
        saving.run(() => pickTextFile('application/json,application/octet-stream'));
      }}
    />
  );
}

export function PasteKeyRow(): ReactNode {
  const saving = useSaving();
  return (
    <ActionRow
      title="Paste instead"
      subtitle="Use a key copied to the clipboard"
      icon="copy"
      disabled={saving.busy}
      onPress={() => {
        saving.run(() => Clipboard.getStringAsync());
      }}
    />
  );
}

export function ForgetKeyRow(): ReactNode {
  return (
    <ActionRow
      title="Forget key"
      icon="trash"
      destructive
      onPress={() => {
        confirm({
          title: 'Forget the push key?',
          body: 'Phones stop getting alerts until you add a key again.',
          confirmLabel: 'Forget',
          tone: 'destructive',
        })
          .then((accepted) => (accepted ? clearPushAccount() : undefined))
          .catch(failed('The key was not forgotten'));
      }}
    />
  );
}

export function PushServiceHelp(): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      The app must be built with the same project. In Firebase, open Project settings › Service
      accounts and generate a private key.
    </Text>
  );
}
