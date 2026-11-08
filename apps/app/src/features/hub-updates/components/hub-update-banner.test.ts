import type { HubUpdateSourceCheck, SelfUpdateRecoveryStatus } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateNoticeProps } from '../../../components/update-notice';
import type { UpdateDetailsOffer } from '../../../components/use-update-details';
import { releaseNoticeOf, sourceReleaseRequest } from '../model/update-copy';
import { HubUpdateBanner } from './hub-update-banner';

const hooks = vi.hoisted(() => ({
  updateNotice: vi.fn<(props: UpdateNoticeProps) => void>(),
  useUpdateDetails: vi.fn((offer: UpdateDetailsOffer | null) => ({
    secondaryAction: offer?.footer.kind === 'action' ? { label: 'Details' } : undefined,
    modal: null,
  })),
  useIsOwner: vi.fn(() => true),
  useHubUpdateSource: vi.fn(),
  useHubUpdateStatus: vi.fn(),
  useHubUpdateStarting: vi.fn(() => false),
  useStartHubUpdateSource: vi.fn(() => ({ isPending: false })),
  useForeground: vi.fn(() => true),
  useSyncStatus: vi.fn<() => { readonly status: 'live' | 'interrupted' }>(() => ({
    status: 'live',
  })),
}));

vi.mock('../../../api/transport', () => ({
  useConnection: (): {
    readonly status: 'paired';
    readonly connection: { readonly url: string };
  } => ({
    status: 'paired',
    connection: { url: 'https://fixture-home.local' },
  }),
}));
vi.mock('../../../store/local-prefs', () => ({
  localPref: (): Readonly<Record<string, readonly string[]>> => ({}),
  setLocalPref: vi.fn(),
}));

vi.mock('../../../store/selectors', () => ({
  useIsOwner: hooks.useIsOwner,
  useSession: (): { readonly client: { readonly id: string } } => ({
    client: { id: 'owner-client' },
  }),
  useSyncStatus: hooks.useSyncStatus,
}));
vi.mock('../../../design/animation-gate', () => ({ useForeground: hooks.useForeground }));
vi.mock('../data/update-queries', () => hooks);
vi.mock('../../../components/use-update-details', () => ({
  useUpdateDetails: hooks.useUpdateDetails,
}));
vi.mock('../../../components/update-notice', () => ({
  UpdateNotice: (props: UpdateNoticeProps): ReactNode => {
    hooks.updateNotice(props);
    const { title, body, brief, action, secondaryAction } = props;
    return createElement('div', null, title, body, brief, secondaryAction?.label, action?.label);
  },
}));

const OFFER_ID = '87db8f33-398c-46ab-bea0-5cf25cb0ae58';
const SOURCE: HubUpdateSourceCheck = {
  remote: 'origin',
  branch: 'main',
  head: 'a'.repeat(40),
  tip: 'b'.repeat(40),
  relation: 'remote_ahead',
  pending: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
  offerId: OFFER_ID,
};
const RUN: NonNullable<SelfUpdateRecoveryStatus['release']> = {
  runId: 'd589fc4f-9cce-4033-ae3f-b838a0694bc8',
  phase: 'restarting',
  interrupted: false,
  startedAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  finishedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.useIsOwner.mockReturnValue(true);
  hooks.useForeground.mockReturnValue(true);
  hooks.useHubUpdateStarting.mockReturnValue(false);
  hooks.useSyncStatus.mockReturnValue({ status: 'live' });
  hooks.useHubUpdateSource.mockReturnValue({ data: SOURCE });
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: null } });
});

function banner(): string {
  return renderToStaticMarkup(createElement(HubUpdateBanner));
}

describe('the shell hub update banner', () => {
  it('does not read the Git offer or release status for a member', () => {
    hooks.useIsOwner.mockReturnValue(false);
    expect(banner()).toBe('');
    expect(hooks.useHubUpdateSource).not.toHaveBeenCalled();
    expect(hooks.useHubUpdateStatus).not.toHaveBeenCalled();
    expect(hooks.useUpdateDetails).not.toHaveBeenCalled();
  });

  it('prompts the owner with the branch when a verified Git release can start', () => {
    expect(banner()).toContain('Hub update available');
    expect(banner()).toContain('origin / main');
    hooks.useHubUpdateSource.mockReturnValue({ data: { ...SOURCE, offerId: undefined } });
    expect(banner()).toBe('');
  });

  it('previews the first line and passes the exact owner offer to Details', () => {
    const notes = 'Improves camera recovery.\nFixes restarts after reconnecting.';
    hooks.useHubUpdateSource.mockReturnValue({ data: { ...SOURCE, notes } });

    const html = banner();
    expect(html).toContain('Improves camera recovery.');
    expect(html).not.toContain('Fixes restarts after reconnecting.');
    expect(html).toMatch(/Details(?:<!-- -->)?Update/u);
    const [selected] = hooks.useUpdateDetails.mock.lastCall ?? [];
    const [notice] = hooks.updateNotice.mock.lastCall ?? [];
    expect(notice).toMatchObject({ body: 'origin / main', brief: 'Improves camera recovery.' });
    expect(selected).toMatchObject({
      id: `${SOURCE.tip}:${OFFER_ID}:false`,
      scope: 'owner-client',
      content: { notes },
      footer: { kind: 'action', label: notice?.action?.label },
    });
    expect(selected?.content.reviewSource).toEqual(expect.anything());
    expect(selected?.footer).toHaveProperty('onPress', expect.any(Function));
  });

  it('keeps the exact offer readable during revalidation without exposing its action', () => {
    hooks.useHubUpdateSource.mockReturnValue({ data: SOURCE, isFetching: true });

    const html = banner();
    expect(html).toContain('Review');
    expect(html).not.toContain('Details');
    expect(hooks.useUpdateDetails.mock.lastCall?.[0]).toMatchObject({
      id: `${SOURCE.tip}:${OFFER_ID}:false`,
      footer: { kind: 'status', label: 'Checking the latest Git source…' },
    });
  });

  it('offers review without installation when a newer Git version is blocked', () => {
    const { offerId: _offerId, ...source } = SOURCE;
    const blocked: HubUpdateSourceCheck = {
      ...source,
      availableUpdate: 'running_behind',
      applyBlockedBy: 'remote_apply_disabled',
    };
    hooks.useHubUpdateSource.mockReturnValue({ data: blocked });
    const html = banner();
    expect(html).toContain('Hub update available');
    expect(html).toContain('Installing updates from Git is turned off on this hub.');
    expect(html).toContain('Review');
    expect(html).not.toContain('Details');
    expect(hooks.useUpdateDetails.mock.lastCall?.[0]).toBeNull();
  });

  it('enables the owner source check again after reconnect and on returning to the foreground', () => {
    hooks.useSyncStatus.mockReturnValue({ status: 'interrupted' });
    banner();
    hooks.useSyncStatus.mockReturnValue({ status: 'live' });
    banner();
    hooks.useForeground.mockReturnValue(false);
    banner();
    hooks.useForeground.mockReturnValue(true);
    banner();
    expect(hooks.useHubUpdateSource.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  it('shows the recorded release phase instead of offering a second update', () => {
    hooks.useHubUpdateStatus.mockReturnValue({ data: { release: RUN } });
    expect(banner()).toContain('Restarting the hub');
    expect(banner()).not.toContain('Hub update available');
    expect(releaseNoticeOf(RUN, false, false)?.title).toBe('Waiting for the hub to reconnect');
    expect(releaseNoticeOf({ ...RUN, phase: 'done' }, false, true)).toBeNull();
  });

  it('shows request progress when Settings starts a release', () => {
    hooks.useHubUpdateStarting.mockReturnValue(true);
    expect(banner()).toContain('Starting hub update');
    expect(banner()).not.toContain('Hub update available');
  });

  it('shows an unseen recorded outcome independently of source revalidation', () => {
    hooks.useHubUpdateSource.mockReturnValue({ data: SOURCE, isFetching: true });
    hooks.useHubUpdateStatus.mockReturnValue({
      data: { release: { ...RUN, phase: 'failed', finishedAt: RUN.updatedAt } },
    });
    expect(banner()).toContain('Hub update failed');
    expect(banner()).not.toContain('Hub update available');
    hooks.useHubUpdateSource.mockReturnValue({ data: SOURCE, isFetching: false });
    expect(banner()).toContain('Hub update failed');
  });

  it('uses the offer ID for an idempotent release and explicitly includes pending work', () => {
    expect(sourceReleaseRequest(SOURCE, OFFER_ID)).toEqual({
      offerId: OFFER_ID,
      requestId: OFFER_ID,
      includePending: false,
    });
    const dirty = { ...SOURCE, pending: { ...SOURCE.pending, untracked: 1 } };
    expect(sourceReleaseRequest(dirty, OFFER_ID).includePending).toBe(true);
  });
});
