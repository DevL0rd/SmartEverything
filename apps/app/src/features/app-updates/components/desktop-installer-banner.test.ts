import { act, createElement, Fragment, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UpdateDetailsFooter } from '../../../components/update-details';
import { pendingRestart, settleRestart } from '../data/restart-confirmation';
import { DesktopInstallerBanner, type DesktopInstaller } from './desktop-installer-banner';

interface NoticeAction {
  readonly label: string;
  readonly ref?: Ref<{ readonly focus: () => void }>;
  readonly onPress?: () => void;
}

const observed = vi.hoisted(() => ({
  focus: vi.fn<(label: string) => void>(),
  notice: vi.fn<(action?: NoticeAction, secondaryAction?: NoticeAction) => void>(),
  details: vi.fn<(footer: UpdateDetailsFooter) => void>(),
  body: vi.fn<(body: string | undefined) => void>(),
  progress: vi.fn<(progress: number) => void>(),
}));

function FocusTarget({ label, ref }: NoticeAction): null {
  useImperativeHandle(
    ref,
    () => ({
      focus: (): void => {
        observed.focus(label);
      },
    }),
    [label],
  );
  return null;
}

vi.mock('../../../components/update-progress', () => ({
  UpdateProgress: ({ progress }: { readonly progress: number }): null => {
    observed.progress(progress);
    return null;
  },
}));
vi.mock('../../../components/update-notice', () => ({
  UpdateNotice: ({
    action,
    secondaryAction,
    body,
    children,
  }: {
    readonly action?: NoticeAction;
    readonly secondaryAction?: NoticeAction;
    readonly body?: string;
    readonly children?: ReactNode;
  }): ReactNode => {
    observed.notice(action, secondaryAction);
    observed.body(body);
    return createElement(
      Fragment,
      null,
      action === undefined ? null : createElement(FocusTarget, action),
      secondaryAction === undefined ? null : createElement(FocusTarget, secondaryAction),
      children,
    );
  },
}));
vi.mock('../../../components/update-details', () => ({
  UpdateDetails: ({ footer }: { readonly footer: UpdateDetailsFooter }): null => {
    observed.details(footer);
    return null;
  },
}));
vi.mock('../data/busy', () => ({
  busyNow: (): boolean => false,
  watchBusy: (): (() => void) => () => undefined,
}));

const status: DesktopInstaller['status'] = {
  state: 'available',
  version: '1.2.3',
  offerId: 'a'.repeat(64),
  installable: true,
  progress: null,
  detail: 'Available',
  notes: 'Desktop release notes.',
};

const installUpdate = vi.fn((): Promise<DesktopInstaller['status']> => Promise.resolve(status));
const checkForUpdate = vi.fn((): Promise<DesktopInstaller['status']> => Promise.resolve(status));

function show(shown: DesktopInstaller['status']): void {
  act(() => {
    root.render(
      createElement(DesktopInstallerBanner, {
        installer: { bridge: { installUpdate, checkForUpdate }, status: shown },
        buttonRef: { current: null },
        suspended: false,
        hidden: false,
      }),
    );
  });
}

let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  show(status);
});

afterEach(() => {
  act(() => {
    root.unmount();
    settleRestart(pendingRestart.get(), false);
  });
  vi.unstubAllGlobals();
});

function chooseInstaller(entry: 'direct' | 'details'): void {
  const [primary, details] = observed.notice.mock.lastCall ?? [];
  const opener = entry === 'direct' ? primary?.onPress : details?.onPress;
  if (opener === undefined) throw new Error('Expected an installer entry point.');
  act(opener);
  if (entry === 'direct') return;
  const footer = observed.details.mock.lastCall?.[0];
  if (footer?.kind !== 'action') throw new Error('Expected the Details installer action.');
  act(footer.onPress);
}

it.each([
  ['direct', 'Update'],
  ['details', 'Details'],
] as const)(
  'returns from a cancelled %s installer confirmation to its launcher',
  (entry, label) => {
    chooseInstaller(entry);
    const confirmation = pendingRestart.get();
    if (confirmation?.restoreFocus === undefined)
      throw new Error('Expected an installer confirmation with a focus target.');
    expect(confirmation.source).toBe('desktop');
    act(() => {
      settleRestart(confirmation, false);
    });
    confirmation.restoreFocus();
    expect(observed.focus).toHaveBeenCalledExactlyOnceWith(label);
    expect(installUpdate).not.toHaveBeenCalled();
  },
);

it('submits the reviewed desktop installer ID once after approval from Details', async () => {
  chooseInstaller('details');
  const confirmation = pendingRestart.get();
  if (confirmation === null) throw new Error('Expected an installer confirmation.');
  expect(installUpdate).not.toHaveBeenCalled();
  await act(() => {
    settleRestart(confirmation, true);
    return Promise.resolve();
  });
  expect(installUpdate).toHaveBeenCalledExactlyOnceWith(status.offerId);
});

it('shows the installer failure with its reason and checks again from Try again', () => {
  show({ ...status, state: 'failed', offerId: undefined, installable: false, detail: 'Disk full' });
  const [primary] = observed.notice.mock.lastCall ?? [];
  expect(observed.body.mock.lastCall).toEqual(['Disk full']);
  expect(primary?.label).toBe('Try again');
  act(() => primary?.onPress?.());
  expect(checkForUpdate).toHaveBeenCalledOnce();
  expect(installUpdate).not.toHaveBeenCalled();
});

it('shows the download percentage from the installer progress', () => {
  show({ ...status, state: 'downloading', progress: { received: 25, total: 100 } });
  expect(observed.progress.mock.lastCall).toEqual([0.25]);
});
