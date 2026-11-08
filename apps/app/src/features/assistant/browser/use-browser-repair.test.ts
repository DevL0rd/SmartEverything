import {
  AI_CHAT_ROW,
  type AssistantMessageRow,
  type BrowserConsoleMessage,
} from '@smarteverything/domain';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browserConsole } from './browser-console-store';
import { BrowserRepair } from './browser-repair';
import { useBrowserRepair } from './use-browser-repair';

type RepairRow = Pick<AssistantMessageRow, 'client_message_id' | 'state'>;

const { send, state } = vi.hoisted(() => ({
  send: vi.fn<
    (
      chat: string,
      text: string,
      files: readonly string[],
      options: { readonly clientMessageId: string },
    ) => Promise<Pick<AssistantMessageRow, 'client_message_id' | 'state'>>
  >(),
  state: { rows: Array<RepairRow>() },
}));

vi.mock('../../../api/ai', () => ({ sendAiChatMessage: send }));
vi.mock('../../../api/connection/client', () => ({ InvalidRequestError: Error }));
vi.mock('../../../design/animation-gate', () => ({ useForeground: (): boolean => true }));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useSyncStatus: (): { readonly status: 'live' } => ({ status: 'live' }),
}));
vi.mock('../data/chat-store', () => ({
  useChatMessages: (): readonly RepairRow[] => state.rows,
}));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('expo-crypto', async () => {
  const { randomUUID } = await import('node:crypto');
  return { randomUUID };
});

const AT = '2026-10-17T10:00:00.000Z';
const CHAT = AI_CHAT_ROW.parse({
  id: '00000000-0000-4000-8000-000000000001',
  profile_id: '00000000-0000-4000-8000-000000000002',
  kind: 'chat',
  title: 'Browser repair',
  icon: null,
  parent_id: null,
  source_key: null,
  engine: { kind: 'codex', device_id: '00000000-0000-4000-8000-000000000003', model: 'model' },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: AT,
  updated_at: AT,
});
const TARGET = 'preview';
let root: Root;
let repair: BrowserRepair;

function Fixture({ visible }: { readonly visible: boolean }): null {
  useBrowserRepair(CHAT, TARGET, visible, repair);
  return null;
}

function show(visible: boolean): void {
  act(() => {
    root.render(createElement(Fixture, { visible }));
  });
}

function record(level: BrowserConsoleMessage['level'], message: string, id = TARGET): void {
  browserConsole.record({ kind: 'message', id, level, message, source: 'fixture.js', line: 4 });
}

beforeEach(() => {
  state.rows = [];
  repair = new BrowserRepair();
  send.mockReset();
  send.mockImplementation((_chat, _text, _files, options) =>
    Promise.resolve({ client_message_id: options.clientMessageId, state: 'queued' }),
  );
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
  browserConsole.reset();
  vi.unstubAllGlobals();
});

it('wakes the current chat with raw history only on unique errors and never during its repair', () => {
  show(true);
  record('error', 'Unselected tab', 'other');
  record('warning', 'preceding warning');
  expect(send).not.toHaveBeenCalled();
  record('error', 'actual error\n  raw stack');
  const call = send.mock.lastCall;
  expect(call?.[0]).toBe(CHAT.id);
  expect(call?.[1]).toContain('preceding warning');
  expect(call?.[1]).toContain('actual error\n  raw stack');
  record('error', 'new but busy');
  expect(send).toHaveBeenCalledTimes(1);
  state.rows = [{ client_message_id: call?.[3].clientMessageId ?? null, state: 'answered' }];
  show(true);
  record('error', 'actual error\n  raw stack');
  expect(send).toHaveBeenCalledTimes(1);
  browserConsole.record({ kind: 'navigation', id: TARGET });
  record('error', 'actual error\n  raw stack');
  expect(send).toHaveBeenCalledTimes(2);
});

it('keeps hidden console events local and does not replay them on return', () => {
  show(false);
  record('error', 'offscreen error');
  show(true);
  expect(send).not.toHaveBeenCalled();
  expect(browserConsole.read(TARGET).rows.map((row) => row.message)).toEqual(['offscreen error']);
});
