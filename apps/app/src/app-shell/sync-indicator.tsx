import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { useConnection, type ConnectionState } from '../api/transport';
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
  readonly tone: 'positive' | 'warning' | 'critical';
  readonly action: 'server' | 'updates' | null;
  readonly opens: 'toast' | 'updates';
}

function failedNotice(failed: readonly SectionFailure[]): SyncNotice {
  return {
    label: 'Update the app to see everything',
    detail: `This app can’t read ${failed.map(sectionFailureText).join('; ')}. Everything else works.`,
    icon: 'download',
    tone: 'warning',
    action: 'updates',
    opens: 'updates',
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
        opens: 'toast',
      }
    : {
        label: 'Can’t reach your server',
        detail: problem.text,
        icon: 'warning',
        tone: 'critical',
        action: 'server',
        opens: 'toast',
      };
}

const CONNECTING: SyncNotice = {
  label: 'Connecting',
  detail: 'Reaching your server.',
  icon: 'wifi',
  tone: 'warning',
  action: null,
  opens: 'toast',
};

const CONNECTED: SyncNotice = {
  label: 'Connected to your server',
  detail: 'This device is online and gets every change as it happens.',
  icon: 'wifi',
  tone: 'positive',
  action: null,
  opens: 'toast',
};

function useSyncNotice(): SyncNotice {
  const sync = useSyncStatus();
  switch (sync.status) {
    case 'live':
      return sync.failed.length === 0 ? CONNECTED : failedNotice(sync.failed);
    case 'refused':
      return {
        label: 'Your server refused this device',
        detail: sync.problem?.text ?? 'The server no longer accepts this device.',
        icon: 'warning',
        tone: 'critical',
        action: 'server',
        opens: 'toast',
      };
    case 'interrupted':
      return sync.problem === null
        ? {
            label: 'Reconnecting',
            detail: 'The connection to your server dropped. Trying again.',
            icon: 'wifi',
            tone: 'warning',
            action: null,
            opens: 'toast',
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

function unpairedNotice(
  state: Exclude<ConnectionState, { readonly status: 'paired' }>,
): SyncNotice {
  switch (state.status) {
    case 'loading':
      return CONNECTING;
    case 'unpaired':
      return {
        label: 'Not paired with a server',
        detail: 'Pair this device with your server to see your home.',
        icon: 'wifi',
        tone: 'warning',
        action: null,
        opens: 'toast',
      };
    case 'unavailable':
      return {
        label: 'Can’t read this device’s server connection',
        detail: state.problem,
        icon: 'warning',
        tone: 'critical',
        action: null,
        opens: 'toast',
      };
    case 'removed':
      return {
        label: 'Your server removed this device',
        detail: `Your server at ${state.url} no longer accepts this device.`,
        icon: 'warning',
        tone: 'critical',
        action: null,
        opens: 'toast',
      };
  }
}

function NoticeButton({ notice }: { readonly notice: SyncNotice }): ReactNode {
  return (
    <IconButton
      icon={notice.icon}
      label={notice.label}
      tone={notice.tone}
      onPress={() => {
        if (notice.opens === 'updates') router.push(href.settings.page(UPDATES_SETTINGS_PAGE));
        else explain(notice);
      }}
    />
  );
}

function PairedIndicator(): ReactNode {
  return <NoticeButton notice={useSyncNotice()} />;
}

export function SyncIndicator(): ReactNode {
  const state = useConnection();
  if (state.status === 'paired') return <PairedIndicator />;
  return <NoticeButton notice={unpairedNotice(state)} />;
}
