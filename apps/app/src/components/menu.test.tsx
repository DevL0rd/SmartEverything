import { act, createRef, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu, type MenuOptions } from './menu';
import { SheetNavigationProvider, useSheetNavigation } from './sheet-navigation';

const { size, sheet, popover } = vi.hoisted(() => ({
  size: { idiom: 'touch', split: false },
  sheet: vi.fn<() => null>(() => null),
  popover: vi.fn<() => null>(() => null),
}));

vi.mock('react-native', () => ({ Keyboard: { dismiss: vi.fn() } }));
vi.mock('../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('../design/size-class', () => ({ useSizeClass: (): typeof size => size }));
vi.mock('../platform/haptics', () => ({}));
vi.mock('./anchor', () => ({}));
vi.mock('./bottom-sheet', () => ({ BottomSheet: sheet }));
vi.mock('./focus-request', () => ({ focusView: vi.fn() }));
vi.mock('./icon-button', () => ({}));
vi.mock('./menu-lift', () => ({}));
vi.mock('./menu-rows', () => ({
  arrangeEntries: (): readonly never[] => [],
  MenuRows: (): null => null,
}));
vi.mock('./popover', () => ({ Popover: popover }));

type Navigation = ReturnType<typeof useSheetNavigation>;

const reported = vi.fn<(navigation: Navigation) => void>();
const close = vi.fn();
const closeRoot = vi.fn();
const opener = createRef<View>();
let root: Root;

function Host({ children }: { readonly children: ReactNode }): ReactNode {
  const navigation = useSheetNavigation(closeRoot);
  useLayoutEffect(() => {
    reported(navigation);
  }, [navigation]);
  return (
    <SheetNavigationProvider navigation={navigation.navigation}>{children}</SheetNavigationProvider>
  );
}

function render(options: MenuOptions, hosted = true): void {
  const menu = (
    <Menu
      items={[]}
      options={options}
      anchor={{ x: 0, y: 0, width: 1, height: 1 }}
      label="Actions"
      onClose={close}
    />
  );
  act(() => {
    root.render(hosted ? <Host>{menu}</Host> : menu);
  });
}

function navigation(): Navigation {
  const state = reported.mock.lastCall?.[0];
  if (state === undefined) throw new Error('Expected a mounted sheet navigation host.');
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
  size.idiom = 'touch';
  size.split = false;
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

describe('anchored menu inside a sheet', () => {
  it('opens a fitted page with the explicit opener and closes only the menu on Back', () => {
    render({ withinSheet: { opener } });
    expect(navigation().pages.map((entry) => entry.page)).toEqual([
      expect.objectContaining({ title: 'Actions', opener, detents: ['fit'], compact: true }),
    ]);
    expect(sheet).not.toHaveBeenCalled();
    expect(popover).not.toHaveBeenCalled();
    act(navigation().back);
    expect(close).toHaveBeenCalledOnce();
    expect(closeRoot).not.toHaveBeenCalled();
  });

  it('uses the same standalone sheet when the menu does not opt in or has no host', () => {
    render({});
    expect(navigation().pages).toHaveLength(0);
    expect(sheet).toHaveBeenCalledOnce();
    render({ withinSheet: { opener } }, false);
    expect(sheet).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['pointer', false],
    ['touch', true],
  ] as const)('keeps the anchored popover for %s with split=%s', (idiom, split) => {
    size.idiom = idiom;
    size.split = split;
    render({ withinSheet: { opener } });
    expect(navigation().pages).toHaveLength(0);
    expect(sheet).not.toHaveBeenCalled();
    expect(popover).toHaveBeenCalledOnce();
  });
});
