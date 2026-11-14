import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HubUpdateSourceCheck, HubUpdateRecoveryStatus } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateNoticeProps } from '../../../components/update-notice';
import { localPref, setLocalPref } from '../../../store/local-prefs';
import { releaseOutcomeOf } from '../model/update-copy';
import { HubUpdateBanner } from './hub-update-banner';

type Release = NonNullable<HubUpdateRecoveryStatus['release']>;

interface OutcomeObservation {
  notice: UpdateNoticeProps | null;
  home: string;
  hubId: string | null;
  foreground: boolean;
  live: boolean;
  starting: boolean;
  release: Release | null;
  fetching: boolean;
  sourceError: boolean;
  saved: Map<string, string>;
}

const observed = vi.hoisted((): OutcomeObservation => ({
  notice: null,
  home: 'https://home-one.local',
  hubId: null,
  foreground: true,
  live: true,
  starting: false,
  release: null,
  fetching: false,
  sourceError: false,
  saved: new Map<string, string>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: (key: string, value: string): Promise<void> => {
      observed.saved.set(key, value);
      return Promise.resolve();
    },
  },
}));
vi.mock('../../../api/transport', () => ({
  useConnection: (): {
    readonly status: 'paired';
    readonly connection: {
      readonly url: string;
      readonly trustedMetadata?: { readonly identity: { readonly id: string } };
    };
  } => ({
    status: 'paired',
    connection: {
      url: observed.home,
      ...(observed.hubId === null ? {} : { trustedMetadata: { identity: { id: observed.hubId } } }),
    },
  }),
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useSession: (): { readonly client: { readonly id: string } } => ({ client: { id: 'owner' } }),
  useSyncStatus: (): { readonly status: string } => ({
    status: observed.live ? 'live' : 'interrupted',
  }),
}));
vi.mock('../../../design/animation-gate', () => ({
  useForeground: (): boolean => observed.foreground,
}));
vi.mock('../../../components/update-notice', () => ({
  UpdateNotice: (props: UpdateNoticeProps): null => {
    observed.notice = props;
    return null;
  },
}));
vi.mock('../../../components/use-update-details', () => ({
  useUpdateDetails: (): { readonly secondaryAction: undefined; readonly modal: null } => ({
    secondaryAction: undefined,
    modal: null,
  }),
}));
vi.mock('../data/update-queries', () => ({
  useHubUpdateStatus: (): { readonly data: { readonly release: Release | null } } => ({
    data: { release: observed.release },
  }),
  useHubUpdateSource: (): {
    readonly data: HubUpdateSourceCheck;
    readonly isFetching: boolean;
    readonly isError: boolean;
  } => ({ data: SOURCE, isFetching: observed.fetching, isError: observed.sourceError }),
  useStartHubUpdateSource: (): { readonly isPending: false } => ({ isPending: false }),
  useHubUpdateStarting: (): boolean => observed.starting,
}));

const SOURCE: HubUpdateSourceCheck = {
  remote: 'origin',
  branch: 'main',
  head: 'a'.repeat(40),
  tip: 'b'.repeat(40),
  relation: 'remote_ahead',
  pending: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
  offerId: '87db8f33-398c-46ab-bea0-5cf25cb0ae58',
};
const RUN: Release = {
  runId: 'd589fc4f-9cce-4033-ae3f-b838a0694bc8',
  phase: 'done',
  interrupted: false,
  startedAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:01:00.000Z',
  finishedAt: '2026-11-06T00:01:00.000Z',
};

let root: Root;

function mount(): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  render();
}

function render(): void {
  observed.notice = null;
  act(() => {
    root.render(createElement(HubUpdateBanner));
  });
}

function remount(): void {
  act(() => {
    root.unmount();
  });
  mount();
}

function notice(): UpdateNoticeProps {
  if (observed.notice === null) throw new Error('Expected an update notice.');
  return observed.notice;
}

function dismiss(): void {
  const close = notice().onDismiss;
  if (close === undefined) throw new Error('Expected a dismissible result notice.');
  act(close);
}

beforeEach(() => {
  observed.home = 'https://home-one.local';
  observed.hubId = null;
  observed.foreground = true;
  observed.live = true;
  observed.starting = false;
  observed.release = RUN;
  observed.fetching = false;
  observed.sourceError = false;
  setLocalPref('hubUpdateNotices', {});
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  mount();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('hub release outcome announcements', () => {
  it.each(['done', 'failed', 'reverted'] as const)(
    'shows %s once and preserves source offers after dismissal, reconnect, revalidation and remount',
    (phase) => {
      setLocalPref('hubUpdateNotices', {});
      observed.release = { ...RUN, phase };
      remount();
      expect(notice().title).toBe(
        phase === 'done'
          ? 'Hub update complete'
          : phase === 'failed'
            ? 'Hub update failed'
            : 'Previous hub version restored',
      );
      expect(notice().action?.label).toBe('Review');
      expect(localPref('hubUpdateNotices')[observed.home]).toHaveLength(1);
      dismiss();
      expect(notice().title).toBe('Hub update available');
      observed.fetching = true;
      render();
      expect(notice().title).toBe('Hub update available');
      observed.sourceError = true;
      render();
      expect(notice().title).toBe('Hub update available');
      observed.live = false;
      render();
      observed.live = true;
      observed.foreground = false;
      render();
      observed.foreground = true;
      render();
      remount();
      expect(notice().title).toBe('Hub update available');
      expect(localPref('hubUpdateNotices')[observed.home]).toHaveLength(1);
    },
  );

  it('records presentation before dismissal so remount cannot announce it again', () => {
    expect(notice().title).toBe('Hub update complete');
    remount();
    expect(notice().title).toBe('Hub update available');
  });

  it('does not consume an outcome before the app reaches the foreground', () => {
    setLocalPref('hubUpdateNotices', {});
    observed.foreground = false;
    remount();
    expect(localPref('hubUpdateNotices')).toEqual({});
    observed.foreground = true;
    render();
    expect(notice().title).toBe('Hub update complete');
    expect(localPref('hubUpdateNotices')[observed.home]).toHaveLength(1);
  });

  it('keeps homes separate and shows a new run or terminal recovery outcome once', () => {
    dismiss();
    observed.home = 'https://home-two.local';
    render();
    expect(notice().title).toBe('Hub update complete');
    dismiss();
    observed.home = 'https://home-one.local';
    render();
    expect(notice().title).toBe('Hub update available');
    observed.release = { ...RUN, runId: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11' };
    render();
    expect(notice().title).toBe('Hub update complete');
    dismiss();
    observed.release = { ...RUN, phase: 'reverted', finishedAt: '2026-11-06T00:02:00.000Z' };
    render();
    expect(notice().title).toBe('Previous hub version restored');
    dismiss();
    observed.release = RUN;
    render();
    expect(notice().title).toBe('Hub update available');
  });

  it('keeps the acknowledgement with the trusted home when its connection URL changes', () => {
    observed.hubId = 'a'.repeat(64);
    remount();
    expect(notice().title).toBe('Hub update complete');
    dismiss();
    observed.home = 'https://remote-home.local';
    remount();
    expect(notice().title).toBe('Hub update available');
    expect(localPref('hubUpdateNotices')[observed.hubId]).toHaveLength(1);
    observed.hubId = 'b'.repeat(64);
    render();
    expect(notice().title).toBe('Hub update complete');
  });

  it('keeps active and recovery states visible even after an outcome was seen', () => {
    dismiss();
    observed.starting = true;
    render();
    expect(notice().title).toBe('Starting hub update…');
    observed.starting = false;
    render();
    expect(notice().title).toBe('Hub update available');
    observed.release = { ...RUN, phase: 'restarting', finishedAt: null };
    render();
    expect(notice().title).toBe('Restarting the hub');
    expect(notice().onDismiss).toBeUndefined();
    observed.live = false;
    render();
    expect(notice().title).toBe('Waiting for the hub to reconnect');
    observed.release = { ...RUN, phase: 'applying', interrupted: true, finishedAt: null };
    render();
    expect(notice().title).toBe('Hub update interrupted');
    expect(notice().onDismiss).toBeUndefined();
    observed.release = { ...RUN, phase: 'unrecoverable' };
    render();
    expect(notice().title).toBe('Hub recovery needs attention');
    expect(notice().onDismiss).toBeUndefined();
    expect(releaseOutcomeOf(observed.release)).toBeNull();
  });
});
