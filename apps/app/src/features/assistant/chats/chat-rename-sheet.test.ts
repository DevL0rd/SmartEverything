import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AI_CHAT_ROW, AI_CHAT_TITLE_MAX } from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import { RoutedChatRename } from './chat-rename-sheet';

interface EditProps {
  readonly request: TextEditRequest;
  readonly onClose: () => void;
}

type RouteParams = Readonly<Record<string, string | undefined>>;

const route = vi.hoisted(
  (): {
    params: RouteParams;
    readonly setParams: ReturnType<typeof vi.fn<(params: RouteParams) => void>>;
  } => ({ params: {}, setParams: vi.fn<(params: RouteParams) => void>() }),
);
const { editor, changeChat } = vi.hoisted(() => ({
  editor: vi.fn<(props: EditProps) => void>(),
  changeChat: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { setParams: route.setParams },
  useLocalSearchParams: (): RouteParams => route.params,
}));
vi.mock('../../../settings/text-edit-sheet', () => ({
  TextEditSheet: (props: EditProps): null => {
    editor(props);
    return null;
  },
}));
vi.mock('./chat-actions', () => ({ changeChat }));

const CHAT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PROFILE_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const MOMENT = '2026-01-01T00:00:00.000Z';
const CHAT = AI_CHAT_ROW.parse({
  id: CHAT_ID,
  profile_id: PROFILE_ID,
  kind: 'chat',
  title: 'Garden plan',
  icon: null,
  parent_id: null,
  helper_name: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: PROFILE_ID,
    model_route_id: PROFILE_ID,
    model: 'deepseek/deepseek-v4',
  },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: MOMENT,
  updated_at: MOMENT,
});

let root: Root;

function render(): void {
  act(() => {
    root.render(createElement(RoutedChatRename, { chat: CHAT }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  route.params = {};
  route.setParams.mockImplementation((params) => {
    route.params = { ...route.params, ...params };
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

it.each(['access', 'access-tools', 'model'])(
  `leaves the %s operation to its own panel`,
  (operation) => {
    route.params = { operation };
    render();
    expect(editor).not.toHaveBeenCalled();
  },
);

it('opens the routed title editor and writes the selected chat title', async () => {
  route.params = { operation: 'rename' };
  render();
  const props = editor.mock.lastCall?.[0];
  if (props === undefined) throw new Error('Expected the chat title editor.');
  expect(props.request).toMatchObject({
    id: CHAT_ID,
    initial: CHAT.title,
    maxLength: AI_CHAT_TITLE_MAX,
  });
  changeChat.mockResolvedValue(CHAT);
  await props.request.save('Planters');
  expect(changeChat).toHaveBeenCalledWith(CHAT_ID, { title: 'Planters' });
  props.onClose();
  expect(route.params['operation']).toBeUndefined();
});

it('rejects a failed rename so the title editor can keep the unsaved value', async () => {
  route.params = { operation: 'rename' };
  render();
  const request = editor.mock.lastCall?.[0].request;
  if (request === undefined) throw new Error('Expected the chat title editor.');
  changeChat.mockResolvedValue(null);
  await expect(request.save('Planters')).rejects.toThrow('Couldn’t save the chat title.');
  expect(route.params['operation']).toBe('rename');
});
