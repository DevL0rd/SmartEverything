import { act, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SheetNavigationProvider, useSheetNavigation } from '../../../components/sheet-navigation';
import { WorkOperationSheet } from './work-operation-sheet';

const { standaloneSheet } = vi.hoisted(() => ({ standaloneSheet: vi.fn() }));

vi.mock('react-native', () => ({ Keyboard: { dismiss: vi.fn() } }));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('../../../components/focus-request', () => ({ focusView: vi.fn() }));
vi.mock('../../../components/sheet', () => ({
  Sheet: (props: unknown): null => {
    standaloneSheet(props);
    return null;
  },
}));

const TITLE = 'Rename session';
const BODY = 'Operation form';
const inspect = vi.fn<(navigation: ReturnType<typeof useSheetNavigation>) => void>();
const closeWork = vi.fn();
const closeOperation = vi.fn();

function OperationProbe(): ReactNode {
  const [open, setOpen] = useState(true);
  return open ? (
    <WorkOperationSheet
      title={TITLE}
      opener={undefined}
      onClose={() => {
        closeOperation();
        setOpen(false);
      }}
    >
      {BODY}
    </WorkOperationSheet>
  ) : null;
}

function TouchWork({ children }: { readonly children: ReactNode }): ReactNode {
  const state = useSheetNavigation(closeWork);
  useLayoutEffect(() => {
    inspect(state);
  }, [state]);
  return (
    <SheetNavigationProvider navigation={state.navigation}>{children}</SheetNavigationProvider>
  );
}

let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (): number => 1);
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
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
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

it('returns to Work without dismissing its touch sheet when backing out of an operation', () => {
  act(() => {
    root.render(
      <TouchWork>
        <OperationProbe />
      </TouchWork>,
    );
  });
  const navigation = inspect.mock.lastCall?.[0];
  if (navigation === undefined) throw new Error('Expected the mounted Work sheet.');
  expect(navigation.pages).toHaveLength(1);
  expect(navigation.pages[0]?.page).toMatchObject({
    title: TITLE,
    children: BODY,
    detents: ['fit'],
  });
  expect(standaloneSheet).not.toHaveBeenCalled();

  act(navigation.back);
  expect(closeOperation).toHaveBeenCalledTimes(1);
  expect(closeWork).not.toHaveBeenCalled();
  expect(inspect.mock.lastCall?.[0].pages).toHaveLength(0);
});

it('opens the same operation form in its own dialog without a touch sheet host', () => {
  act(() => {
    root.render(
      <WorkOperationSheet title={TITLE} opener={undefined} onClose={closeOperation}>
        {BODY}
      </WorkOperationSheet>,
    );
  });
  expect(standaloneSheet).toHaveBeenCalledWith(
    expect.objectContaining({
      open: true,
      title: TITLE,
      onClose: closeOperation,
      children: BODY,
      detents: ['fit'],
    }),
  );
});
