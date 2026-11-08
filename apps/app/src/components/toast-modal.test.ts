import {
  act,
  createContext,
  createElement,
  Fragment,
  use,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  type ReactNode,
  type RefObject,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const Surface = createContext('page');

interface Action {
  readonly surface: string;
  readonly expanded: boolean | undefined;
  readonly press: () => void;
}

const actions = new Map<string, Action>();
const texts = new Map<string, Set<string>>();

function Pass({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

function TestModal({
  visible,
  accessibilityLabel,
  children,
  onShow,
}: {
  readonly visible: boolean;
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly onShow: () => void;
}): ReactNode {
  const show = useEffectEvent(onShow);
  useEffect(() => {
    if (visible) show();
  }, [visible]);
  return visible ? createElement(Surface, { value: accessibilityLabel }, children) : null;
}

function TestAction({
  label,
  expanded,
  onPress,
}: {
  readonly label: string;
  readonly expanded?: boolean;
  readonly onPress: () => void;
}): null {
  const surface = use(Surface);
  useEffect(() => {
    actions.set(label, { surface, expanded, press: onPress });
    return (): void => {
      actions.delete(label);
    };
  }, [label, surface, expanded, onPress]);
  return null;
}

function TestText({ children }: { readonly children: ReactNode }): null {
  const surface = use(Surface);
  useEffect(() => {
    if (typeof children !== 'string') return undefined;
    const visible = texts.get(surface) ?? new Set<string>();
    texts.set(surface, visible);
    visible.add(children);
    return (): void => {
      visible.delete(children);
    };
  }, [children, surface]);
  return null;
}

function TestButton({
  label,
  onPress,
  ref,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly ref?: RefObject<{ readonly label: string } | null>;
}): ReactNode {
  useImperativeHandle(ref, () => ({ label }), [label]);
  return createElement(TestAction, { label, onPress });
}

vi.mock('react-native', () => ({ Modal: TestModal, View: Pass, Pressable: (): null => null }));
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: Pass,
  GestureDetector: Pass,
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: Pass },
  FadeIn: { duration: (): unknown => null },
  SlideInRight: { duration: (): unknown => null },
}));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void): void => {
    callback();
  },
}));
vi.mock('../design/motion', () => ({
  DURATION: { short: 150 },
  useMotion: (): unknown => ({ reduced: true }),
  entering: (): unknown => ({}),
}));
vi.mock('../design/platform', () => ({
  isNative: (): boolean => false,
  useIdiom: (): string => 'pointer',
}));
vi.mock('../design/size-class', () => ({ useSizeClass: (): unknown => ({ nav: 'sidebar' }) }));
vi.mock('../platform/haptics', () => ({ warningBuzz: (): void => undefined }));
vi.mock('./button', () => ({ Button: TestButton }));
vi.mock('./focus-request', () => ({ focusView: vi.fn() }));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./icon-button', () => ({ IconButton: TestAction }));
vi.mock('./interactive', () => ({ Interactive: TestAction }));
vi.mock('./keyboard-viewport', () => ({ KeyboardRoot: Pass, KeyboardViewport: Pass }));
vi.mock('./sheet-body', () => ({ SheetBody: Pass }));
vi.mock('./sheet-header', () => ({ SheetHeader: (): null => null }));
vi.mock('./text', () => ({ Text: TestText }));
vi.mock('./text-field', () => ({ TextField: (): null => null }));
vi.mock('./toast-obstacles', () => ({
  useKeyboardObstacle: (): void => undefined,
  useMeasuredFrame: (): unknown => ({}),
  useToastRoom: (): unknown => ({ bottom: null, start: null }),
}));
vi.mock('./toast-gesture', () => ({
  useFocusHold: (): null => null,
  useToastMotion: (): unknown => ({}),
}));

const { ToastModal } = await import('./toast-modal');
const { Toasts } = await import('./toasts');
const { dismissToast, notify } = await import('./toast-store');
const { ConfirmHost } = await import('./confirm-host');
const { confirm } = await import('./confirm-store');
const { focusView } = await import('./focus-request');

let root: Root;
let id: number | null = null;

function render(parent: boolean, child: boolean): void {
  act(() => {
    root.render(
      createElement(
        Fragment,
        null,
        createElement(Toasts),
        createElement(
          ToastModal,
          { visible: parent, accessibilityLabel: 'Edit automations' },
          createElement(ToastModal, { visible: child, accessibilityLabel: 'Confirmation' }),
        ),
      ),
    );
  });
}

function details(): Action {
  const action = actions.get('Details');
  if (action === undefined) throw new Error('Expected a visible Details action.');
  return action;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(focusView).mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 1;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('document', {
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
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
    if (id !== null) dismissToast(id);
    vi.runAllTimers();
  });
  id = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('interactive toast layers', () => {
  it('keeps Details in the top modal, preserving its expanded error across nested dialogs', () => {
    render(true, false);
    act(() => {
      id = notify({
        message: 'Tools weren’t changed',
        error: new Error('Synthetic hub unavailable'),
        tone: 'critical',
      });
    });
    expect(details()).toMatchObject({ surface: 'Edit automations', expanded: false });
    expect(texts.get('page')?.has('Tools weren’t changed')).not.toBe(true);
    act(() => {
      details().press();
    });
    expect(details()).toMatchObject({ surface: 'Edit automations', expanded: true });
    expect(texts.get('Edit automations')?.has('Synthetic hub unavailable')).toBe(true);
    render(true, true);
    expect(details()).toMatchObject({ surface: 'Confirmation', expanded: true });
    expect(texts.get('Edit automations')?.has('Tools weren’t changed')).toBe(false);
    render(true, false);
    expect(details()).toMatchObject({ surface: 'Edit automations', expanded: true });
    render(false, false);
    expect(details()).toMatchObject({ surface: 'page', expanded: true });
  });

  it('focuses the visible Cancel action when a named confirmation is shown', async () => {
    act(() => {
      root.render(createElement(ConfirmHost));
    });
    let accepted: Promise<boolean> | undefined;
    act(() => {
      accepted = confirm({
        title: 'Release remote snapshot?',
        body: 'The Home Hub restarts after the release.',
        confirmLabel: 'Release snapshot',
      });
    });
    const cancel = actions.get('Cancel');
    expect(cancel?.surface).toBe('Release remote snapshot?');
    expect(focusView).toHaveBeenCalledWith({ label: 'Cancel' });
    act(() => {
      cancel?.press();
    });
    expect(await accepted).toBe(false);
    expect(actions.has('Cancel')).toBe(false);
  });
});
