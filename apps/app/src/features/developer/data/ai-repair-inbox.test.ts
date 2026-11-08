import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiRepairAdmission,
  type AiRepairGroup,
} from '@smarteverything/domain';
import { CHAT, ADMITTED, FINGERPRINT, settled, pending } from './ai-repair-inbox.fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';
import type { ButtonProps } from '../../../components/button';
import { AiRepairErrorGroup } from '../components/ai-repair-group';
import { EntityStore } from '../../../store/entity-store';
import { upsert } from '../../../store/table-ops';
import { RULES } from '../../../store/table-rules';
import {
  AI_REPAIR_GROUPS_KEY,
  useDiagnosisRequests,
  type RepairDiagnosisAction,
} from './ai-repair-inbox';

interface TestApi {
  readonly call: (endpoint: unknown, request: unknown) => Promise<unknown>;
}

const mocks = vi.hoisted(() => ({
  call: vi.fn<TestApi['call']>(),
  navigate: vi.fn(),
  uuid: vi.fn(),
  authorityCurrent: true,
  buttons: new Map<string, ButtonProps>(),
  listeners: new Set<{ readonly focus: () => void; readonly blur: () => void }>(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('../../../components/button', () => ({
  Button: (props: ButtonProps): null => {
    useEffect(() => {
      mocks.buttons.set(props.label, props);
      return (): void => {
        mocks.buttons.delete(props.label);
      };
    }, [props]);
    return null;
  },
}));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('expo-crypto', () => ({ randomUUID: mocks.uuid }));
vi.mock('expo-router', () => ({
  router: { navigate: mocks.navigate },
  useFocusEffect: (effect: () => undefined | (() => void)): void => {
    useEffect(() => {
      let cleanup: undefined | (() => void);
      const listener = {
        focus: (): void => {
          cleanup = effect();
        },
        blur: (): void => {
          cleanup?.();
          cleanup = undefined;
        },
      };
      mocks.listeners.add(listener);
      listener.focus();
      return (): void => {
        listener.blur();
        mocks.listeners.delete(listener);
      };
    }, [effect]);
  },
}));
vi.mock('../../../api/transport', () => ({ api: (): TestApi => ({ call: mocks.call }) }));
vi.mock('../../../store/store-context', () => ({ useEntityStore: (): EntityStore => store }));
vi.mock('../../../store/assistant-response-style', () => ({
  captureAssistantWrite: (): { readonly client: TestApi; readonly current: () => boolean } => ({
    client: { call: mocks.call },
    current: (): boolean => mocks.authorityCurrent,
  }),
}));

let store: EntityStore;
let root: Root;
let client: QueryClient;
let action: RepairDiagnosisAction;
let mounted: boolean;
let group: AiRepairGroup | null;

function Harness(): React.ReactNode {
  const diagnosis = useDiagnosisRequests()(FINGERPRINT);
  useEffect(() => {
    action = diagnosis;
  }, [diagnosis]);
  return group === null
    ? null
    : createElement(AiRepairErrorGroup, {
        group,
        diagnosis,
        dismissing: false,
        onDismiss: () => undefined,
      });
}

function render(pause: ScreenPause): void {
  root.render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ScreenPausedContext, { value: pause }, createElement(Harness)),
    ),
  );
}

function mount(pause = new ScreenPause(null)): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  mounted = true;
  act(() => {
    render(pause);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
  mounted = false;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  mocks.call.mockReset();
  mocks.navigate.mockReset();
  mocks.uuid.mockReset();
  mocks.uuid.mockReturnValue('request-1');
  mocks.authorityCurrent = true;
  mocks.listeners.clear();
  mocks.buttons.clear();
  store = new EntityStore();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mounted = false;
  group = null;
});

afterEach(() => {
  if (mounted) unmount();
  client.clear();
  vi.unstubAllGlobals();
});

it('opens a repair chat created by admission only after publishing its returned row', async () => {
  const admission = pending<AiRepairAdmission>();
  const chats = pending<(typeof CHAT)[]>();
  mocks.call.mockReturnValueOnce(admission.promise).mockReturnValueOnce(chats.promise);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  mocks.navigate.mockImplementation(() => {
    expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(CHAT);
  });
  mount();
  await settled(() => {
    action.diagnose();
    action.diagnose();
  });
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith(E.diagnoseAiRepairGroup, {
    params: { fingerprint: FINGERPRINT },
    body: { requestId: 'request-1' },
  });
  expect(action.pending).toBe(true);
  expect(mocks.navigate).not.toHaveBeenCalled();
  await settled(() => {
    admission.resolve(ADMITTED);
  });
  expect(mocks.call).toHaveBeenLastCalledWith(E.listAiChats, { query: {} });
  expect(mocks.navigate).not.toHaveBeenCalled();
  await settled(() => {
    chats.resolve([CHAT]);
  });
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ params: { chatId: CHAT.id } }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: AI_REPAIR_GROUPS_KEY });
  expect(action.pending).toBe(false);
});

it('opens the canonical chat from an existing admission without loading it twice', async () => {
  mocks.call
    .mockResolvedValueOnce({ ...ADMITTED, kind: 'existing' })
    .mockResolvedValueOnce([CHAT])
    .mockResolvedValueOnce({ ...ADMITTED, kind: 'existing' });
  mount();
  await settled(() => {
    action.diagnose();
  });
  await settled(() => {
    action.diagnose();
  });
  expect(mocks.call.mock.calls.map(([endpoint]) => endpoint)).toEqual([
    E.diagnoseAiRepairGroup,
    E.listAiChats,
    E.diagnoseAiRepairGroup,
  ]);
  expect(mocks.navigate).toHaveBeenCalledTimes(2);
});

it('retains the request ID after a mutation error and opens the recovered existing admission', async () => {
  mocks.call
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ ...ADMITTED, kind: 'existing' })
    .mockResolvedValueOnce([CHAT]);
  mount();
  await settled(() => {
    action.diagnose();
  });
  expect(action.failed).toBe(true);
  expect(mocks.navigate).not.toHaveBeenCalled();
  await settled(() => {
    action.diagnose();
  });
  expect(
    mocks.call.mock.calls
      .filter(([endpoint]) => endpoint === E.diagnoseAiRepairGroup)
      .map(([, request]) => request),
  ).toEqual([
    { params: { fingerprint: FINGERPRINT }, body: { requestId: 'request-1' } },
    { params: { fingerprint: FINGERPRINT }, body: { requestId: 'request-1' } },
  ]);
  expect(mocks.uuid).toHaveBeenCalledOnce();
  expect(action.failed).toBe(false);
  expect(mocks.navigate).toHaveBeenCalledOnce();
});

it('refreshes held admissions without loading or opening a chat', async () => {
  mocks.call.mockResolvedValueOnce({ kind: 'held', reason: 'budget' });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  mount();
  await settled(() => {
    action.diagnose();
  });
  expect(mocks.call).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: AI_REPAIR_GROUPS_KEY });
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(action.pending).toBe(false);
});

it.each(['blur', 'unmount', 'pause', 'authority'] as const)(
  'does not publish or navigate a late newly created chat after %s',
  async (leave) => {
    const chats = pending<(typeof CHAT)[]>();
    mocks.call.mockResolvedValueOnce(ADMITTED).mockReturnValueOnce(chats.promise);
    const pause = new ScreenPause(null);
    mount(pause);
    await settled(() => {
      action.diagnose();
    });
    act(() => {
      if (leave === 'blur') for (const listener of mocks.listeners) listener.blur();
      if (leave === 'pause') pause.setOwn(true);
      if (leave === 'authority') mocks.authorityCurrent = false;
    });
    if (leave === 'unmount') unmount();
    await settled(() => {
      chats.resolve([CHAT]);
    });
    expect(store.get().tables.ai_chats.rows).toEqual([]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  },
);

it('does not resurrect an old request after blur and refocus', async () => {
  const admission = pending<AiRepairAdmission>();
  mocks.call.mockReturnValueOnce(admission.promise);
  mount();
  await settled(() => {
    action.diagnose();
  });
  act(() => {
    for (const listener of mocks.listeners) {
      listener.blur();
      listener.focus();
    }
  });
  await settled(() => {
    admission.resolve(ADMITTED);
  });
  expect(mocks.call).toHaveBeenCalledOnce();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it('keeps a missing returned chat retryable instead of opening a missing-chat route', async () => {
  mocks.call.mockResolvedValueOnce(ADMITTED).mockResolvedValueOnce([]);
  mount();
  await settled(() => {
    action.diagnose();
  });
  expect(action.failed).toBe(true);
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it('does not navigate when the screen blurs while the inbox refresh is finishing', async () => {
  const refreshed = pending<undefined>();
  vi.spyOn(client, 'invalidateQueries').mockReturnValue(refreshed.promise);
  mocks.call.mockResolvedValueOnce(ADMITTED).mockResolvedValueOnce([CHAT]);
  mount();
  await settled(() => {
    action.diagnose();
  });
  expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(CHAT);
  expect(mocks.navigate).not.toHaveBeenCalled();
  act(() => {
    for (const listener of mocks.listeners) listener.blur();
  });
  await settled(() => {
    refreshed.resolve(undefined);
  });
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it('preserves a newer chat delivered to the store while the hydration request is pending', async () => {
  const chats = pending<(typeof CHAT)[]>();
  const fresh = { ...CHAT, title: 'Live repair progress' };
  mocks.call.mockResolvedValueOnce(ADMITTED).mockReturnValueOnce(chats.promise);
  mount();
  await settled(() => {
    action.diagnose();
  });
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      ai_chats: upsert(state.tables.ai_chats, fresh, RULES.ai_chats),
    },
  }));
  await settled(() => {
    chats.resolve([CHAT]);
  });
  expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(fresh);
  expect(mocks.navigate).toHaveBeenCalledOnce();
});

it.each(['queued', 'running'] as const)(
  'recovers hydration after the inbox refresh reports %s',
  async (progress) => {
    mocks.call
      .mockResolvedValueOnce(ADMITTED)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ ...ADMITTED, kind: 'existing' })
      .mockResolvedValueOnce([CHAT]);
    const pause = new ScreenPause(null);
    mount(pause);
    await settled(() => {
      action.diagnose();
    });
    group = {
      fingerprint: FINGERPRINT,
      component: 'hub.fixture',
      event: 'request.failed',
      firstAt: '2026-11-08T00:00:00Z',
      lastAt: '2026-11-08T00:00:00Z',
      observations: 1,
      latestLogId: 1,
      admission: ADMITTED,
      progress,
    };
    await settled(() => {
      render(pause);
    });
    expect(mocks.buttons.has('Open investigation')).toBe(false);
    expect(mocks.buttons.has('Retry investigation')).toBe(true);
    await settled(() => {
      mocks.buttons.get('Retry investigation')?.onPress?.();
    });
    expect(mocks.call.mock.calls[2]).toEqual([
      E.diagnoseAiRepairGroup,
      { params: { fingerprint: FINGERPRINT }, body: { requestId: 'request-1' } },
    ]);
    expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(CHAT);
    expect(mocks.navigate).toHaveBeenCalledOnce();
  },
);
