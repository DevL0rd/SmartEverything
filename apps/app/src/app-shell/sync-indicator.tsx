import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { IconButton } from '../components/icon-button';
import type { IconName } from '../components/icon';
import { notify } from '../components/toast-store';
import { useSyncStatus } from '../store/selectors';
import { href } from './hrefs';

interface SyncNotice {
  readonly label: string;
  readonly detail: string;
  readonly icon: IconName;
  readonly tone: 'warning' | 'critical';
  readonly settings: boolean;
}

const OUTDATED: SyncNotice = {
  label: 'Update the app to see everything',
  detail: 'Some of what your server holds is newer than this app can read.',
  icon: 'download',
  tone: 'warning',
  settings: false,
};

const CONNECTING: SyncNotice = {
  label: 'Connecting',
  detail: 'Reaching your server.',
  icon: 'wifi',
  tone: 'warning',
  settings: false,
};

function useSyncNotice(): SyncNotice | null {
  const sync = useSyncStatus();
  switch (sync.status) {
    case 'live':
      return sync.outdated.length === 0 ? null : OUTDATED;
    case 'refused':
      return {
        label: 'Your server refused this device',
        detail: sync.problem ?? 'The server no longer accepts this device.',
        icon: 'warning',
        tone: 'critical',
        settings: true,
      };
    case 'interrupted':
      return sync.problem === null
        ? {
            label: 'Reconnecting',
            detail: 'The connection to your server dropped. Trying again.',
            icon: 'wifi',
            tone: 'warning',
            settings: false,
          }
        : {
            label: 'Can’t reach your server',
            detail: sync.problem,
            icon: 'warning',
            tone: 'critical',
            settings: true,
          };
    case 'connecting':
    case 'loading':
      return CONNECTING;
  }
}

function explain(notice: SyncNotice): void {
  notify({
    message: notice.label,
    detail: notice.detail,
    tone: notice.tone === 'critical' ? 'critical' : 'default',
    ...(notice.settings
      ? {
          action: {
            label: 'Server settings',
            onPress: (): void => {
              router.push(href.settings.page('server'));
            },
          },
        }
      : {}),
  });
}

export function SyncIndicator(): ReactNode {
  const notice = useSyncNotice();
  if (notice === null) {
    return null;
  }
  return (
    <IconButton
      icon={notice.icon}
      label={notice.label}
      tone={notice.tone}
      onPress={() => {
        explain(notice);
      }}
    />
  );
}
