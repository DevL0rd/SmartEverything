import type {
  BuildSourceSettings,
  HubUpdateSourceCheck,
  HubUpdateRecoveryStatus,
  ReleaseUpload,
} from '@smarteverything/domain';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ButtonProps } from '../../../components/button';
import type { SegmentedProps } from '../../../components/segmented';
import { pendingConfirm, settleConfirm } from '../../../components/confirm-store';
import { SourceReleaseAction } from '../components/source-release-action';
import { decisionResultLine, PHASE_LABEL } from '../model/update-copy';
import { HubUpdateCards } from './hub-update-cards';

const hooks = vi.hoisted(() => ({
  useIsOwner: vi.fn<() => boolean>(),
  useHubUpdateStatus: vi.fn(),
  useHubUpdateStarting: vi.fn(() => false),
  useStartHubUpdateSource: vi.fn(),
  useUpdateRevisions: vi.fn(() => ({ data: undefined, isError: false })),
  useBuildSources: vi.fn(),
  useChangeBuildSources: vi.fn(),
  useReleaseUploads: vi.fn(),
  useUpdateHome: vi.fn(() => 'https://fixture-home.local'),
  button: vi.fn<(props: ButtonProps) => ReactNode>(),
  segmented: vi.fn<(props: SegmentedProps<string>) => ReactNode>(() => null),
  mutate: vi.fn(),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('../../../store/selectors', () => ({ useIsOwner: hooks.useIsOwner }));
vi.mock('../../../components/section', () => ({ Section: childrenOf }));
vi.mock('../../../components/card', () => ({ Card: childrenOf }));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../components/button', () => ({ Button: hooks.button }));
vi.mock('../../../components/segmented', () => ({ Segmented: hooks.segmented }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/badge', () => ({
  Badge: ({ label }: { readonly label: string }): string => label,
}));
vi.mock('../../../components/charts/progress-bar', () => ({ ProgressBar: (): null => null }));
vi.mock('../../../store/clock', () => ({
  useMinute: (): number => Date.parse('2026-11-06T00:05:00.000Z'),
}));
vi.mock('../components/source-save-action', () => ({
  SourceSaveAction: ({ disabled }: { readonly disabled: boolean }): ReactNode =>
    createElement(hooks.button, { disabled, label: 'Save changes to a branch' }),
}));
vi.mock('../data/update-queries', () => hooks);

const SOURCE: HubUpdateSourceCheck = {
  remote: 'origin',
  branch: 'main',
  head: 'a'.repeat(40),
  tip: 'b'.repeat(40),
  relation: 'remote_ahead',
  offerId: '87db8f33-398c-46ab-bea0-5cf25cb0ae58',
  pending: { staged: 1, unstaged: 0, untracked: 0, conflicts: 0 },
};
const NOW = '2026-11-06T00:00:00.000Z';
const RUN: NonNullable<HubUpdateRecoveryStatus['release']> = {
  runId: 'd589fc4f-9cce-4033-ae3e-b838a0694bc8',
  phase: 'verifying',
  interrupted: false,
  startedAt: NOW,
  updatedAt: NOW,
  finishedAt: null,
  reason: null,
  failedChecks: [],
  backupKept: false,
};
const DECISION: NonNullable<HubUpdateRecoveryStatus['release']> = {
  ...RUN,
  phase: 'awaiting_decision',
  reason: 'the new release did not answer its health check',
  failedChecks: [{ name: 'startup', ok: false, detail: 'no answer within 120 s' }],
  backupKept: true,
};
const SOURCES: BuildSourceSettings = {
  hub: 'hub',
  apk: 'provided',
  ui: 'provided',
  desktop: 'github',
};
const STAGED: ReleaseUpload = {
  uploadId: '4a9a2a63-7d6e-4f53-8f1a-0f3f0d8f4c11',
  artifact: 'desktop',
  size: 4096,
  sha256: 'c'.repeat(64),
  state: 'staged',
  createdAt: NOW,
  received: [{ start: 0, end: 4096 }],
  receivedBytes: 4096,
  release: {
    version: '0.9.6',
    commit: 'd'.repeat(40),
    target: 'linux-x64',
    fingerprint: 'e'.repeat(64),
    files: 3,
    bytes: 2048,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.useIsOwner.mockReturnValue(true);
  hooks.useHubUpdateStarting.mockReturnValue(false);
  hooks.button.mockImplementation(() => null);
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: null } });
  hooks.useBuildSources.mockReturnValue({ data: SOURCES, isError: false });
  hooks.useChangeBuildSources.mockReturnValue({
    isPending: false,
    isError: false,
    mutate: hooks.mutate,
  });
  hooks.useReleaseUploads.mockReturnValue({ data: { uploads: [] }, isError: false });
  hooks.useStartHubUpdateSource.mockReturnValue({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
  });
});

afterEach(() => {
  settleConfirm(false);
});

function cards(): string {
  const source = new QueryObserver<HubUpdateSourceCheck>(new QueryClient(), {
    queryKey: ['hub-updates', 'source'],
    initialData: SOURCE,
    initialDataUpdatedAt: Date.parse(RUN.updatedAt),
    enabled: false,
  }).getCurrentResult();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(HubUpdateCards, { source }),
    ),
  );
}

function button(label: string): ButtonProps {
  const props = hooks.button.mock.calls.find(([entry]) => entry.label === label)?.[0];
  if (props === undefined) throw new Error(`Missing button ${label}.`);
  return props;
}

it.each([
  'planned',
  'built',
  'backed_up',
  'applying',
  'verifying',
  'restarting',
  'awaiting_decision',
] as const)('disables release during %s while retaining branch saving', (phase) => {
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: { ...RUN, phase } } });
  const html = cards();
  expect(html).toContain(PHASE_LABEL[phase]);
  expect(button('Release remote snapshot').disabled).toBe(true);
  expect(button('Save changes to a branch').disabled).toBe(false);
});

it('disables the Settings release as soon as the shell starts its request', () => {
  hooks.useHubUpdateStarting.mockReturnValue(true);
  cards();
  expect(button('Release remote snapshot').disabled).toBe(true);
});

it('allows a fresh release after the previous release finishes', () => {
  hooks.useHubUpdateStatus.mockReturnValue({
    data: { release: { ...RUN, phase: 'done', finishedAt: RUN.updatedAt } },
  });
  cards();
  expect(button('Release remote snapshot').disabled).toBe(false);
});

it('states the pending-file choice and possible hub restart in the release confirmation', () => {
  cards();
  button('Release remote snapshot').onPress?.();
  expect(pendingConfirm.get()).toMatchObject({
    confirmLabel: 'Include changes and release',
    body: [
      'origin / main',
      'Your pending changes will be included in the release. Your files and branch will stay as they are.',
      'The hub may restart during the release.',
    ].join('\n\n'),
  });
});

it('states that the hub may restart when releasing without the saved changes', () => {
  renderToStaticMarkup(
    createElement(SourceReleaseAction, {
      offerId: '87db8f33-398c-46ab-bea0-5cf25cb0ae58',
      source: SOURCE,
      disabled: false,
      saved: {
        branch: 'wip/pending-hub-changes',
        savedRequestId: '876b8f33-398c-46ab-bea0-5cf25cb0ae58',
        requestId: '786b8f33-398c-46ab-bea0-5cf25cb0ae58',
      },
    }),
  );
  button('Release without saved changes').onPress?.();
  expect(pendingConfirm.get()).toMatchObject({
    confirmLabel: 'Release without changes',
    body: [
      'origin / main',
      'Your changes will remain in your checkout and on wip/pending-hub-changes. This release will use the remote snapshot alone.',
      'The hub may restart during the release.',
    ].join('\n\n'),
  });
});

it('keeps hub controls and status queries out of the member update screen', () => {
  hooks.useIsOwner.mockReturnValue(false);
  expect(cards()).toBe('');
  expect(hooks.useHubUpdateStatus).not.toHaveBeenCalled();
});

it('shows the build source of every artifact and asks before the hub builds one', () => {
  cards();
  const rows = hooks.segmented.mock.calls.map(([props]) => [props.label, props.value]);
  expect(rows).toEqual([
    ['Hub service build source', 'hub'],
    ['Android app build source', 'provided'],
    ['Over the air build source', 'provided'],
    ['Desktop app build source', 'github'],
  ]);
  const apk = hooks.segmented.mock.calls[1]?.[0];
  apk?.onChange('github');
  expect(hooks.mutate).toHaveBeenCalledWith({ apk: 'github' });
  apk?.onChange('hub');
  expect(hooks.mutate).toHaveBeenCalledTimes(1);
  expect(pendingConfirm.get()).toMatchObject({ confirmLabel: 'Build on the hub' });
});

it('offers the Git source release only when the hub service is built on the hub', () => {
  hooks.useBuildSources.mockReturnValue({ data: { ...SOURCES, hub: 'provided' }, isError: false });
  const html = cards();
  expect(hooks.button.mock.calls.some(([props]) => props.label === 'Release remote snapshot')).toBe(
    false,
  );
  expect(html).toContain('Set its build source to Hub to release from here.');
});

it('lists staged uploads with their version, commit and target', () => {
  hooks.useReleaseUploads.mockReturnValue({ data: { uploads: [STAGED] }, isError: false });
  const html = cards();
  expect(html).toContain('Staged');
  expect(html).toContain('0.9.6 · dddddddd · linux-x64 · 2.0 KB');
});

it('shows the failure report with Roll back, Try again and Keep in one row', () => {
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: DECISION }, refetch: vi.fn() });
  const html = cards();
  expect(html).toContain('the new release did not answer its health check');
  expect(html).toContain('startup · no answer within 120 s');
  expect(html).toContain('The backup of the previous version is kept.');
  const labels = hooks.button.mock.calls.map(([props]) => props.label);
  expect(labels).toEqual(expect.arrayContaining(['Roll back', 'Try again', 'Keep']));
  expect(button('Roll back').disabled).toBe(false);
  expect(button('Try again').disabled).toBe(false);
  button('Roll back').onPress?.();
  expect(pendingConfirm.get()).toMatchObject({ confirmLabel: 'Roll back' });
});

it('confirms Keep with the blocked-updates consequence stated and no local memory of it', () => {
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: DECISION }, refetch: vi.fn() });
  cards();
  expect(button('Keep').disabled).toBe(false);
  button('Keep').onPress?.();
  expect(pendingConfirm.get()).toMatchObject({ confirmLabel: 'Keep' });
  expect(pendingConfirm.get()?.body).toContain('new hub updates can start again');
});

it('words a kept release and its refusal', () => {
  expect(decisionResultLine('keep', { status: 'started', runId: DECISION.runId })).toContain(
    'Kept.',
  );
  expect(decisionResultLine('keep', { status: 'refused', refusal: 'not_recoverable' })).toBe(
    'This release is no longer waiting for a decision.',
  );
});

it('allows only a roll back after a restore that did not finish', () => {
  hooks.useHubUpdateStatus.mockReturnValue({
    data: { release: { ...DECISION, phase: 'unrecoverable', finishedAt: NOW } },
    refetch: vi.fn(),
  });
  const html = cards();
  expect(button('Roll back').disabled).toBe(false);
  expect(button('Try again').disabled).toBe(true);
  expect(button('Keep').disabled).toBe(true);
  expect(html).toContain('so only a roll back can run now.');
});

it('words a refused roll back as a roll back and a refused retry as a recovery', () => {
  const refused = { status: 'refused', refusal: 'not_recoverable' } as const;
  expect(decisionResultLine('rollback', refused)).toBe(
    'This release can no longer be rolled back.',
  );
  expect(decisionResultLine('rollback', { status: 'refused', refusal: 'unavailable' })).toBe(
    'Rolling back is unavailable on this hub.',
  );
  expect(decisionResultLine('retry', refused)).toBe(
    'This release is no longer available for recovery.',
  );
});
