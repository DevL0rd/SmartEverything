import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { useConnection, type ConnectionState } from '../api/transport';
import type { AppHref } from '../components/app-href';
import { ShellNotice } from '../components/update-notice';
import { useUpdateNoticeShown } from '../components/update-notice-presence';
import { useSyncStatus, type SyncStatus } from '../store/selectors';
import type { SectionFailure, SyncProblem } from '../store/state';
import { href, UPDATES_SETTINGS_PAGE } from './hrefs';
import { sectionFailureText } from './section-failure';

interface NoticeAction {
  readonly label: string;
  readonly href: AppHref;
}

export interface ConnectionNotice {
  readonly title: string;
  readonly body: string;
  readonly tone: 'warning' | 'critical';
  readonly action: NoticeAction | null;
}

const UPDATES: NoticeAction = { label: 'Updates', href: href.settings.page(UPDATES_SETTINGS_PAGE) };

const SERVER: NoticeAction = { label: 'Server settings', href: href.settings.page('server') };

const PAIR: NoticeAction = { label: 'Pair', href: '/pair' };

const CONNECTING: ConnectionNotice = {
  title: 'Connecting',
  body: 'Reaching your server.',
  tone: 'warning',
  action: null,
};

function failedNotice(failed: readonly SectionFailure[]): ConnectionNotice {
  return {
    title: 'Update the app to see everything',
    body: `This app can’t read ${failed.map(sectionFailureText).join('; ')}. Everything else works.`,
    tone: 'warning',
    action: UPDATES,
  };
}

function problemNotice(problem: SyncProblem): ConnectionNotice {
  return problem.remedy === 'update-app'
    ? { title: 'Update the app to connect', body: problem.text, tone: 'critical', action: UPDATES }
    : { title: 'Can’t reach your server', body: problem.text, tone: 'critical', action: SERVER };
}

function syncNoticeOf(sync: SyncStatus): ConnectionNotice | null {
  switch (sync.status) {
    case 'live':
      return sync.failed.length === 0 ? null : failedNotice(sync.failed);
    case 'refused':
      return {
        title: 'Your server refused this device',
        body: sync.problem?.text ?? 'The server no longer accepts this device.',
        tone: 'critical',
        action: SERVER,
      };
    case 'interrupted':
      return sync.problem === null
        ? {
            title: 'Reconnecting',
            body: 'The connection to your server dropped. Trying again.',
            tone: 'warning',
            action: null,
          }
        : problemNotice(sync.problem);
    case 'connecting':
    case 'loading':
      return CONNECTING;
  }
}

function unpairedNoticeOf(
  state: Exclude<ConnectionState, { readonly status: 'paired' }>,
): ConnectionNotice {
  switch (state.status) {
    case 'loading':
      return CONNECTING;
    case 'unpaired':
      return {
        title: 'Not paired with a server',
        body: 'Pair this device with your server to see your home.',
        tone: 'warning',
        action: PAIR,
      };
    case 'unavailable':
      return {
        title: 'Can’t read this device’s server connection',
        body: state.problem,
        tone: 'critical',
        action: null,
      };
    case 'removed':
      return {
        title: 'Your server removed this device',
        body: `Your server at ${state.url} no longer accepts this device.`,
        tone: 'critical',
        action: PAIR,
      };
  }
}

function NoticeBar({ notice }: { readonly notice: ConnectionNotice }): ReactNode {
  const onPair = usePathname() === '/pair';
  const action = notice.action === PAIR && onPair ? null : notice.action;
  return (
    <View
      aria-label="Connection notice"
      pointerEvents="box-none"
      className="shell-update-inset z-30 shrink-0 bg-chrome pt-safe"
    >
      <ShellNotice
        tone={notice.tone}
        title={notice.title}
        body={notice.body}
        wrapBody
        announceTitle
        {...(action === null ? {} : { action: { label: action.label, href: action.href } })}
      />
    </View>
  );
}

function PairedNotice(): ReactNode {
  const notice = syncNoticeOf(useSyncStatus());
  return notice === null ? null : <NoticeBar notice={notice} />;
}

export function ConnectionNoticeHost(): ReactNode {
  const state = useConnection();
  if (useUpdateNoticeShown()) return null;
  if (state.status === 'paired') return <PairedNotice />;
  return <NoticeBar notice={unpairedNoticeOf(state)} />;
}
