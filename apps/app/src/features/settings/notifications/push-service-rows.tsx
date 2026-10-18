import type { ReactNode } from 'react';
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
import { notify, notifyFailure } from '../../../components/toast-store';
import { jsonText } from '../../../format/json-text';
import { relative } from '../../../format/time';
import { pickTextFile } from '../../../platform/text-file';
import { useMinuteOf } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useSettings } from '../../../store/selectors';

import { settingsLog, trackSetting } from '../settings-log';
export const FIREBASE_PAGE = 'notifications/push-service/firebase';

const KEY_FAILURE = { failure: 'The key was not saved' } as const;

async function saveKey(read: () => Promise<string | null>): Promise<boolean> {
  const text = await read();
  if (text === null) {
    settingsLog.debug('push_key.pick_cancelled');
    return false;
  }
  const parsed = jsonText(text);
  if (!parsed.ok) {
    settingsLog.warn('push_key.not_json', { length: text.length });
    throw new ServiceAccountError('it is not JSON');
  }
  const account = serviceAccountOf(parsed.value);
  await trackSetting('push_key.save', { projectId: account.project_id }, () =>
    savePushAccount(account),
  );
  notify({
    message: 'Key saved',
    detail: `${account.project_id} · ${account.client_email}`,
    tone: 'positive',
  });
  return true;
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
  const summary = useMinuteOf(
    (now) => deliverySummary(deliveries, now),
    (left, right) => left.text === right.text && left.tone === right.tone,
  );
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
      Lets your hub send call alerts to your phone through Firebase while the app is closed. While
      the app is running, alerts reach your phone without it.
    </Text>
  );
}

export function ChooseKeyRow(): ReactNode {
  const saving = useMutationState();
  return (
    <ActionRow
      title="Import key file"
      subtitle="Pick the .json key you downloaded from Firebase"
      icon="key"
      disabled={saving.busy}
      onPress={() => {
        saving.run(
          () => saveKey(() => pickTextFile('application/json,application/octet-stream')),
          KEY_FAILURE,
        );
      }}
    />
  );
}

export function PasteKeyRow(): ReactNode {
  const saving = useMutationState();
  return (
    <ActionRow
      title="Paste instead"
      subtitle="Use a key copied to the clipboard"
      icon="copy"
      disabled={saving.busy}
      onPress={() => {
        saving.run(() => saveKey(() => Clipboard.getStringAsync()), KEY_FAILURE);
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
          .then((accepted) =>
            accepted ? trackSetting('push_key.forget', {}, () => clearPushAccount()) : undefined,
          )
          .catch(notifyFailure('The key was not forgotten'));
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
