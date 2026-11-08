import {
  act,
  createElement,
  Fragment,
  useImperativeHandle,
  type ReactElement,
  type Ref,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UpdateDetailsFooter } from '../../../components/update-details';
import type * as Platform from '../../../design/platform';
import { askToRestart, pendingRestart, settleRestart } from '../data/restart-confirmation';
import type { AppUpdateActions } from '../data/update-store';
import { ROLLBACK_CONFIRM } from '../model/update-copy';
import { AppUpdateBanner } from './update-banner';
import { UPDATE_FIXTURES } from './update-fixtures';

interface FocusAction {
  readonly label: string;
  readonly ref?: Ref<{ readonly focus: () => void }>;
  readonly onPress?: () => void;
}

const focus = vi.fn<(label: string) => void>();
let cancel: (() => void) | undefined;
let openDetails: (() => void) | undefined;
let detailsFooter: UpdateDetailsFooter | undefined;
let root: Root;
const frames: FrameRequestCallback[] = [];

function FocusTarget({ label, ref }: FocusAction): null {
  useImperativeHandle(
    ref,
    () => ({
      focus: (): void => {
        focus(label);
      },
    }),
    [label],
  );
  return null;
}

vi.mock('../../../api/transport', () => ({
  useConnection: (): { readonly status: 'unpaired' } => ({ status: 'unpaired' }),
}));
vi.mock('../../../components/focus-request', () => ({
  focusView: (node: { readonly focus: () => void } | null): boolean => {
    if (node === null) return false;
    node.focus();
    return true;
  },
}));
vi.mock('../../../components/update-details', () => ({
  UpdateDetails: ({ footer }: { readonly footer: UpdateDetailsFooter }): null => {
    detailsFooter = footer;
    return null;
  },
}));
vi.mock('../../../components/update-notice', () => ({
  UpdateNotice: ({
    action,
    secondaryAction,
  }: {
    readonly action?: FocusAction;
    readonly secondaryAction?: FocusAction;
  }): ReactElement => {
    if (secondaryAction?.label === 'Later') cancel = secondaryAction.onPress;
    if (secondaryAction?.label === 'Details') openDetails = secondaryAction.onPress;
    return createElement(
      Fragment,
      null,
      action === undefined ? null : createElement(FocusTarget, action),
      secondaryAction === undefined ? null : createElement(FocusTarget, secondaryAction),
    );
  },
}));
vi.mock('../../../design/platform', async (original) => ({
  ...(await original<typeof Platform>()),
  desktopBridge: (): Readonly<Record<string, never>> => ({}),
  isNative: (): boolean => false,
}));
vi.mock('../data/desktop-installer', () => ({
  useDesktopInstaller: (): { readonly state: 'available'; readonly version: string } => ({
    state: 'available',
    version: '0.1.3',
  }),
}));
vi.mock('./desktop-installer-banner', () => ({
  DesktopInstallerBanner: ({
    buttonRef,
    hidden,
  }: {
    readonly buttonRef: NonNullable<FocusAction['ref']>;
    readonly hidden: boolean;
  }): ReactElement | null =>
    hidden ? null : createElement(FocusTarget, { label: 'Update desktop', ref: buttonRef }),
}));
vi.mock('../data/android-apk', () => ({
  useAndroidApkOffer: (): { readonly data: null } => ({ data: null }),
  useAndroidApkInstall: (): object => ({ stage: { kind: 'idle' }, install: vi.fn() }),
}));
vi.mock('../data/update-store', () => ({
  useAppUpdate: (): {
    readonly state: ReturnType<typeof readyState>;
    readonly actions: AppUpdateActions;
  } => ({
    state: readyState(),
    actions: {
      check: vi.fn(),
      download: vi.fn(),
      retry: vi.fn(),
      restart: (_offerId, restoreFocus): void => {
        void askToRestart(ROLLBACK_CONFIRM, 'ui', restoreFocus);
      },
    },
  }),
}));

function readyState(): NonNullable<(typeof UPDATE_FIXTURES)['ready']>['state'] {
  const ready = UPDATE_FIXTURES['ready'];
  if (ready === undefined) throw new Error('The ready update fixture is required.');
  return ready.state;
}

beforeEach(() => {
  cancel = undefined;
  openDetails = undefined;
  detailsFooter = undefined;
  focus.mockClear();
  frames.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    frames.push(callback);
    return frames.length;
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  settleRestart(pendingRestart.get(), false);
  vi.unstubAllGlobals();
});

it.each([
  ['ui', 'Restart'],
  ['desktop', 'Restart'],
] as const)(
  'focuses Later for %s confirmation and restores %s on cancellation',
  async (source, opener) => {
    act(() => {
      root.render(createElement(AppUpdateBanner));
    });
    let confirmed: Promise<boolean> | undefined;
    act(() => {
      confirmed = askToRestart(ROLLBACK_CONFIRM, source);
    });
    expect(focus.mock.calls).toEqual([['Later']]);
    act(() => {
      if (cancel === undefined) throw new Error('The confirmation needs a cancel action.');
      cancel();
    });
    await expect(confirmed).resolves.toBe(false);
    frames.splice(0).forEach((callback) => {
      callback(0);
    });
    expect(focus.mock.calls).toEqual([['Later'], [opener]]);
  },
);

it('restores the Settings opener when the Desktop confirmation was requested there', async () => {
  act(() => {
    root.render(createElement(AppUpdateBanner));
  });
  const restoreFocus = vi.fn();
  let confirmed: Promise<boolean> | undefined;
  act(() => {
    confirmed = askToRestart(ROLLBACK_CONFIRM, 'desktop', restoreFocus);
  });
  act(() => {
    if (cancel === undefined) throw new Error('The confirmation needs a cancel action.');
    cancel();
  });
  await expect(confirmed).resolves.toBe(false);
  frames.splice(0).forEach((callback) => {
    callback(0);
  });
  expect(restoreFocus).toHaveBeenCalledOnce();
  expect(focus.mock.calls).toEqual([['Later']]);
});

it('restores the Details launcher after cancelling a ready update restart', () => {
  act(() => {
    root.render(createElement(AppUpdateBanner));
  });
  if (openDetails === undefined) throw new Error('Expected the ready update Details launcher.');
  act(openDetails);
  if (detailsFooter?.kind !== 'action') throw new Error('Expected the reviewed Restart action.');
  act(detailsFooter.onPress);
  expect(focus.mock.calls).toEqual([['Later']]);
  if (cancel === undefined) throw new Error('The confirmation needs a cancel action.');
  act(cancel);
  frames.splice(0).forEach((callback) => {
    callback(0);
  });
  expect(focus.mock.calls).toEqual([['Later'], ['Details']]);
});
