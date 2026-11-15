import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { IconButton } from '../components/icon-button';
import type { IconName } from '../components/icon';
import { notify } from '../components/toast-store';
import { useSyncStatus } from '../store/selectors';
import type { SectionFailure, SyncProblem } from '../store/state';
import { href, UPDATES_SETTINGS_PAGE } from './hrefs';
import { sectionFailureText } from './section-failure';

interface SyncNotice {
  readonly label: string;
  readonly detail: string;
  readonly icon: IconName;
  readonly tone: 'warning' | 'critical';
  readonly action: 'server' | 'updates' | null;
}

function failedNotice(failed: readonly SectionFailure[]): SyncNotice {
  return {
    label: 'Update the app to see everything',
    detail: `This app can’t read ${failed.map(sectionFailureText).join('; ')}. Everything else works.`,
    icon: 'download',
    tone: 'warning',
    action: 'updates',
  };
}

function problemNotice(problem: SyncProblem): SyncNotice {
  return problem.remedy === 'update-app'
    ? {
        label: 'Update the app to connect',
        detail: problem.text,
        icon: 'download',
        tone: 'critical',
        action: 'updates',
      }
    : {
        label: 'Can’t reach your server',
        detail: problem.text,
        icon: 'warning',
        tone: 'critical',
        action: 'server',
      };
}

const CONNECTING: SyncNotice = {
  label: 'Connecting',
  detail: 'Reaching your server.',
  icon: 'wifi',
  tone: 'warning',
  action: null,
};

function useSyncNotice(): SyncNotice | null {
  const sync = useSyncStatus();
  switch (sync.status) {
    case 'live':
      return sync.failed.length === 0 ? null : failedNotice(sync.failed);
    case 'refused':
      return {
        label: 'Your server refused this device',
        detail: sync.problem?.text ?? 'The server no longer accepts this device.',
        icon: 'warning',
        tone: 'critical',
        action: 'server',
      };
    case 'interrupted':
      return sync.problem === null
        ? {
            label: 'Reconnecting',
            detail: 'The connection to your server dropped. Trying again.',
            icon: 'wifi',
            tone: 'warning',
            action: null,
          }
        : problemNotice(sync.problem);
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
    ...(notice.action === null
      ? {}
      : {
          action: {
            label: notice.action === 'updates' ? 'Updates' : 'Server settings',
            onPress: (): void => {
              router.push(
                href.settings.page(notice.action === 'updates' ? UPDATES_SETTINGS_PAGE : 'server'),
              );
            },
          },
        }),
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
