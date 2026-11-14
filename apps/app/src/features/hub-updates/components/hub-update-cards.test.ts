import type { HubUpdateSourceCheck, HubUpdateRecoveryStatus } from '@smarteverything/domain';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ButtonProps } from '../../../components/button';
import { pendingConfirm, settleConfirm } from '../../../components/confirm-store';
import { SourceReleaseAction } from '../components/source-release-action';
import { PHASE_LABEL } from '../model/update-copy';
import { HubUpdateCards } from './hub-update-cards';

const hooks = vi.hoisted(() => ({
  useIsOwner: vi.fn<() => boolean>(),
  useHubUpdateStatus: vi.fn(),
  useHubUpdateStarting: vi.fn(() => false),
  useStartHubUpdateSource: vi.fn(),
  useUpdateRevisions: vi.fn(() => ({ data: undefined, isError: false })),
  button: vi.fn<(props: ButtonProps) => ReactNode>(),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('../../../store/selectors', () => ({ useIsOwner: hooks.useIsOwner }));
vi.mock('../../../components/section', () => ({ Section: childrenOf }));
vi.mock('../../../components/card', () => ({ Card: childrenOf }));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../components/button', () => ({ Button: hooks.button }));
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
const RUN: NonNullable<HubUpdateRecoveryStatus['release']> = {
  runId: 'd589fc4f-9cce-4033-ae3e-b838a0694bc8',
  phase: 'verifying',
  interrupted: false,
  startedAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  finishedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.useIsOwner.mockReturnValue(true);
  hooks.useHubUpdateStarting.mockReturnValue(false);
  hooks.button.mockImplementation(() => null);
  hooks.useHubUpdateStatus.mockReturnValue({ data: { release: null } });
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
  return renderToStaticMarkup(createElement(HubUpdateCards, { source }));
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
  'reverting',
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
