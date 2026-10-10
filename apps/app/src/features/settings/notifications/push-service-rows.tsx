import type { ReactNode } from 'react';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
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
import { pickTextFile } from '../../../platform/text-file';
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
  await savePushAccount(serviceAccountOf(parsed.value));
  notify({ message: 'Push service is ready', tone: 'positive' });
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

export function PushStatusRow(): ReactNode {
  const project = useSettings().push_project_id;
  return (
    <ListRow
      title="Alerts when the app is closed"
      subtitle={
        project === null
          ? 'Phones get alerts while the app is open'
          : `Through Firebase · ${project}`
      }
      icon={project === null ? 'bellOff' : 'bell'}
      iconTone={project === null ? 'variant' : 'positive'}
      value={project === null ? 'Off' : 'On'}
    />
  );
}

export function ChooseKeyRow(): ReactNode {
  const saving = useSaving();
  return (
    <ActionRow
      title="Choose key file"
      icon="key"
      disabled={saving.busy}
      onPress={() => {
        saving.run(() => pickTextFile('application/json,.json'));
      }}
    />
  );
}

export function PasteKeyRow(): ReactNode {
  const saving = useSaving();
  return (
    <ActionRow
      title="Paste key"
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
