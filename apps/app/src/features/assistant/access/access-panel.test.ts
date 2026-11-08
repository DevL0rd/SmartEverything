import { act, createElement, createRef, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { View } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ENGINE } from '@smarteverything/domain';
import type { AdaptivePanelProps } from '../../../components/adaptive-panel';
import type { ListRowProps } from '../../../components/list-row';
import { AccessControl } from './access-control';
import { AccessPanel } from './access-panel';
import type { AccessModel } from './access-model';
import { accessPill } from './ai-access';
import type { AccessToolsPage } from './access-tools-page';

type Params = { readonly operation?: string | undefined };
const route = vi.hoisted(
  (): { params: Params; readonly setParams: ReturnType<typeof vi.fn<(params: Params) => void>> } => ({
    params: {},
    setParams: vi.fn<(params: Params) => void>(),
  }),
);

vi.mock('expo-router', () => ({
  router: { setParams: route.setParams },
  useLocalSearchParams: (): Params => route.params,
}));
vi.mock('../../../app-shell/shortcuts', () => ({ useKeyboard: (): void => undefined }));
vi.mock('../components/compact-picker-control', () => ({ CompactPickerControl: (): null => null }));
vi.mock('../chats/model-menu-anchor', () => ({ focusModelTrigger: (): void => undefined }));

const captures = vi.hoisted(() => ({
  host: vi.fn<(props: AdaptivePanelProps) => void>(),
  mount: vi.fn(),
  unmount: vi.fn(),
  row: vi.fn<(props: ListRowProps) => void>(),
  tools: vi.fn<(props: Parameters<typeof AccessToolsPage>[0]) => void>(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/adaptive-panel', () => ({
  AdaptivePanel: (props: AdaptivePanelProps): ReactNode => {
    useEffect(() => {
      captures.mount();
      return (): void => {
        captures.unmount();
      };
    }, []);
    captures.host(props);
    return props.children;
  },
  usePanelFrame: (): { readonly presentation: 'popover' } => ({ presentation: 'popover' }),
}));
vi.mock('../../../components/list-row', () => ({
  ListRow: (props: ListRowProps): null => {
    captures.row(props);
    return null;
  },
}));
vi.mock('../../../components/focus-request', () => ({ useFocusRequest: createRef }));
vi.mock('../../../components/sheet-body', () => ({
  SheetBody: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/reason-line', () => ({ ReasonLine: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../picker/panel/panel-chrome', () => ({
  PanelHead: (): null => null,
  PanelSection: (): null => null,
}));
vi.mock('./access-rows', () => ({ AccessRowView: (): null => null }));
vi.mock('./use-tool-permissions', () => ({
  useToolPermissions: (): { readonly allowed: readonly string[] } => ({ allowed: [] }),
}));
vi.mock('./access-tools-page', () => ({
  ACCESS_TOOLS_TITLE: 'Tools for this chat',
  AccessToolsPage: (props: Parameters<typeof AccessToolsPage>[0]): null => {
    captures.tools(props);
    return null;
  },
}));

const model: AccessModel = {
  title: 'Access on Home Hub',
  pill: accessPill({
    kind: 'harness',
    title: null,
    permission: { sandbox: 'read-only', approval: 'on-request' },
  }),
  nextTurn: false,
  sections: [],
  applying: null,
  blocked: false,
  banner: null,
  footnote: 'Applies to future actions.',
  tools: {
    id: 'chat',
    engine: ENGINE.parse({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model: 'fixture',
      model_route_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    }),
    tools: null,
  },
  select: vi.fn(),
};

let root: Root;
const anchorRef = createRef<View>();
const close = vi.fn();

function render(startWithTools = false): void {
  act(() => {
    root.render(
      createElement(AccessPanel, { anchorRef, open: true, onClose: close, model, startWithTools }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  route.params = {};
  route.setParams.mockImplementation((params) => {
    route.params = { ...route.params, ...params };
  });
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
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

it('opens Tools and goes Back without closing or remounting the Access host', () => {
  render();
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  expect(captures.tools).not.toHaveBeenCalled();
  act(() => captures.row.mock.lastCall?.[0].onPress?.());
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  expect(captures.tools).toHaveBeenCalledTimes(1);
  act(() => captures.tools.mock.lastCall?.[0].onBack());
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  expect(captures.mount).toHaveBeenCalledTimes(1);
  expect(captures.unmount).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it('opens the existing Access host at Tools for a direct search result', () => {
  render(true);
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  expect(captures.tools).toHaveBeenCalledTimes(1);
  act(() => captures.host.mock.lastCall?.[0].onBack?.());
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  expect(captures.mount).toHaveBeenCalledTimes(1);
});

it('opens a routed Tools result in an already open Access panel', () => {
  render();
  render(true);
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  act(() => captures.host.mock.lastCall?.[0].onBack?.());
  render(true);
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  expect(captures.mount).toHaveBeenCalledTimes(1);
  expect(captures.unmount).not.toHaveBeenCalled();
});

function renderControl(operation: string | undefined): void {
  route.params = { operation };
  act(() => {
    root.render(createElement(AccessControl, { model }));
  });
}

it('reopens routed Tools after Back through the same open Access host', () => {
  renderControl('access-tools');
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  act(() => captures.host.mock.lastCall?.[0].onBack?.());
  expect(route.setParams).toHaveBeenCalledExactlyOnceWith({ operation: 'access' });
  renderControl(route.params.operation);
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  renderControl('access-tools');
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  expect(captures.mount).toHaveBeenCalledTimes(1);
  expect(captures.unmount).not.toHaveBeenCalled();
});

it('goes Back from the local Tools row without writing route parameters', () => {
  renderControl('access');
  act(() => captures.row.mock.lastCall?.[0].onPress?.());
  expect(captures.host.mock.lastCall?.[0].label).toBe('Tools for this chat');
  act(() => captures.tools.mock.lastCall?.[0].onBack());
  expect(captures.host.mock.lastCall?.[0].label).toBe(model.title);
  expect(route.setParams).not.toHaveBeenCalled();
  expect(captures.mount).toHaveBeenCalledTimes(1);
});
