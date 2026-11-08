import { act, createElement, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HostedSheetPages } from './hosted-sheet-pages';
import type { SheetBackAction } from './sheet-header';
import { useSheetNavigation, useSheetSubpage } from './sheet-navigation';

const observed = vi.hoisted(() => ({
  header: vi.fn<(action: SheetBackAction) => void>(),
  visibility: vi.fn<(visible: boolean) => void>(),
}));

vi.mock('react-native', () => ({
  View: ({
    children,
    accessibilityElementsHidden,
  }: {
    readonly children: ReactNode;
    readonly accessibilityElementsHidden?: boolean;
  }): ReactNode => {
    if (accessibilityElementsHidden !== undefined) {
      observed.visibility(!accessibilityElementsHidden);
    }
    return children;
  },
}));
vi.mock('../design/platform', () => ({ isNative: (): boolean => false }));
vi.mock('./focus-request', () => ({ focusView: vi.fn() }));
vi.mock('./sheet-body', () => ({
  SheetBody: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('./sheet-header', () => ({
  SheetHeader: ({ back }: { readonly back: SheetBackAction }): null => {
    observed.header(back);
    return null;
  },
}));

const changeDraft = vi.fn<(value: string) => void>();
const openPicker = vi.fn<() => void>();
const renderedDraft = vi.fn<(value: string) => void>();
const closeRoot = vi.fn();

function Draft(): null {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    changeDraft.mockImplementation(setDraft);
    openPicker.mockImplementation(() => {
      setOpen(true);
    });
    renderedDraft(draft);
  }, [draft]);
  useSheetSubpage(open, {
    title: 'Output',
    children: null,
    onClose: () => {
      setOpen(false);
    },
  });
  return null;
}

function Panel(): ReactNode {
  const navigation = useSheetNavigation(closeRoot);
  const draft = useMemo(() => createElement(Draft), []);
  return createElement(HostedSheetPages, { label: 'Settings', navigation }, draft);
}

class FixtureOpener {
  readonly isConnected = true;
  readonly focus = vi.fn();
}

it('covers the retained root while a picker is open and restores its draft and opener on Back', () => {
  const opener = new FixtureOpener();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('document', { activeElement: opener, body: null });
  vi.stubGlobal('HTMLElement', FixtureOpener);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number =>
    frames.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  try {
    act(() => {
      root.render(createElement(Panel));
    });
    act(() => {
      changeDraft('Unsaved settings');
      openPicker();
    });
    expect(observed.visibility.mock.calls.slice(-2)).toEqual([[false], [true]]);
    const back = observed.header.mock.lastCall?.[0];
    expect(back?.label).toBe('Back to Settings');
    if (back === undefined) throw new Error('Expected a hosted Back action.');
    act(back.onPress);
    for (const frame of frames) frame(0);
    expect(observed.visibility).toHaveBeenLastCalledWith(true);
    expect(renderedDraft).toHaveBeenLastCalledWith('Unsaved settings');
    expect(opener.focus).toHaveBeenCalledOnce();
    expect(closeRoot).not.toHaveBeenCalled();
  } finally {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});
