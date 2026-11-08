import { act, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetNavigationProvider, useSheetNavigation, useSheetSubpage } from './sheet-navigation';

vi.mock('react-native', () => ({ Keyboard: { dismiss: vi.fn() } }));
vi.mock('../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('./focus-request', () => ({ focusView: vi.fn() }));

type Navigation = ReturnType<typeof useSheetNavigation>;

const reported = vi.fn<(value: Navigation) => void>();
const hosted = vi.fn<(value: boolean) => void>();
const rootClose = vi.fn();
let root: Root;

function Host({ children }: { readonly children: ReactNode }): ReactNode {
  const navigation = useSheetNavigation(rootClose);
  useLayoutEffect(() => {
    reported(navigation);
  }, [navigation]);
  return (
    <SheetNavigationProvider navigation={navigation.navigation}>{children}</SheetNavigationProvider>
  );
}

function Pages({ title }: { readonly title: string }): null {
  const [first, setFirst] = useState(true);
  const [second, setSecond] = useState(true);
  hosted(
    useSheetSubpage(first, {
      title,
      children: null,
      onClose: () => {
        setFirst(false);
      },
    }),
  );
  useSheetSubpage(first && second, {
    title: 'Details',
    children: null,
    onClose: () => {
      setSecond(false);
    },
  });
  return null;
}

function render(title: string): void {
  act(() => {
    root.render(
      <Host>
        <Pages title={title} />
      </Host>,
    );
  });
}

function current(): Navigation {
  const state = reported.mock.lastCall?.[0];
  if (state === undefined) throw new Error('Expected the sheet navigation host to render.');
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (): number => 1);
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
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
  vi.unstubAllGlobals();
});

describe('sheet page navigation', () => {
  it('keeps one live page per opener and preserves its selected detent when its content changes', () => {
    render('Connections');
    const first = current().pages[0];
    if (first === undefined) throw new Error('Expected the first subpage to register.');
    act(() => {
      current().setExpanded(first.id, true);
    });
    render('Updated connections');
    expect(current().pages.map((entry) => [entry.id, entry.page.title, entry.expanded])).toEqual([
      [first.id, 'Updated connections', true],
      [expect.any(String), 'Details', false],
    ]);
    expect(hosted).toHaveBeenLastCalledWith(true);
  });

  it('backs through nested pages and leaves their opener available instead of refocusing Back', () => {
    render('Connections');
    expect(current().pages.map((entry) => entry.focusBack)).toEqual([false, true]);
    act(current().back);
    expect(current().pages.map((entry) => [entry.page.title, entry.focusBack])).toEqual([
      ['Connections', false],
    ]);
    expect(rootClose).not.toHaveBeenCalled();
    act(current().back);
    expect(current().pages).toHaveLength(0);
    expect(rootClose).not.toHaveBeenCalled();
    act(current().back);
    expect(rootClose).toHaveBeenCalledOnce();
  });

  it('leaves standalone controls unhosted', () => {
    act(() => {
      root.render(<Pages title="Standalone" />);
    });
    expect(hosted).toHaveBeenLastCalledWith(false);
  });
});
