import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_CHAT_ROW } from '@smarteverything/domain';
import type { KeyboardListProps } from '../../../../components/keyboard-list';
import type { SwitchRow } from '../../../../components/rows';
import type { ComponentProps } from 'react';
import type { useEngineAccessory } from '../../chats/engine-accessories';
import type { useMemorySession } from '../../memory/memory-data';

const MEMORY_SESSION: ReturnType<typeof useMemorySession> = {
  key: 'test-memory-session',
  ready: true,
  assertCurrent: (): void => undefined,
};

const { accessory, memoryList, changeChat, keyboard, switchRow } = vi.hoisted(() => ({
  accessory: vi.fn<typeof useEngineAccessory>(),
  memoryList:
    vi.fn<() => { readonly data?: { readonly settings: { readonly enabled: boolean } } }>(),
  changeChat: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  keyboard: vi.fn<(props: KeyboardListProps) => void>(),
  switchRow: vi.fn<(props: ComponentProps<typeof SwitchRow>) => void>(),
}));

vi.mock('../../chats/engine-accessories', () => ({ useEngineAccessory: accessory }));
vi.mock('../../chats/engine-efforts', () => ({ useEngineEfforts: (): readonly [] => [] }));
vi.mock('../../chats/chat-actions', () => ({ changeChat }));
vi.mock('../../memory/memory-data', () => ({
  useMemorySession: (): typeof MEMORY_SESSION => MEMORY_SESSION,
  useMemoryList: memoryList,
}));
vi.mock('../image/use-image-models', () => ({ useSelectedImageModel: (): null => null }));
vi.mock('./image-settings-panel', () => ({
  IMAGE_SETTINGS_ROW: 'image-settings',
  ImageSettingsRow: (): null => null,
}));
vi.mock('./machine-panel', () => ({ MachineRow: (): null => null }));
vi.mock('./model-pills', () => ({
  AI_MODEL_ROW: 'ai',
  IMAGE_MODEL_ROW: 'image',
  ModelPills: (): null => null,
}));
vi.mock('./thinking-panel', () => ({ ThinkingRow: (): null => null }));
vi.mock('./panel-chrome', () => ({
  PanelHead: (): null => null,
  PanelNote: (): null => null,
  KeyedRow: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../../components/keyboard-list', () => ({
  KeyboardList: (props: KeyboardListProps): ReactNode => {
    keyboard(props);
    return props.children;
  },
}));
vi.mock('../../../../components/rows', () => ({
  SwitchRow: (props: ComponentProps<typeof SwitchRow>): null => {
    switchRow(props);
    return null;
  },
}));

const { MainPage } = await import('./panel-main');

const CHAT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PROFILE_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const MOMENT = '2026-01-01T00:00:00.000Z';

const chat = AI_CHAT_ROW.parse({
  id: CHAT_ID,
  profile_id: PROFILE_ID,
  kind: 'chat',
  title: 'Memory controls',
  icon: null,
  parent_id: null,
  helper_name: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
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

const SAVED_CHAT_ACCESSORY: NonNullable<ReturnType<typeof useEngineAccessory>> = {
  chat,
  pending: null,
  request: vi.fn(),
  cancel: vi.fn(),
  change: vi.fn(),
  host: {
    key: 'server',
    draft: false,
    valid: (): boolean => true,
    options: [],
    select: vi.fn(),
  },
};

function renderPanel(machineInHeader = false): void {
  renderToStaticMarkup(
    createElement(MainPage, {
      engine: chat.engine,
      plan: null,
      state: {
        page: 'main',
        machineParent: 'main',
        returnFocus: null,
        setPage: vi.fn(),
        note: null,
        setNote: vi.fn(),
      },
      pick: {
        picker: { picked: null, onPick: null },
        change: vi.fn(),
        editable: true,
        reason: null,
        stop: null,
      },
      onClose: vi.fn(),
      onLibrary: vi.fn(),
      onImageLibrary: vi.fn(),
      machineInHeader,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accessory.mockReturnValue(SAVED_CHAT_ACCESSORY);
  memoryList.mockReturnValue({ data: { settings: { enabled: true } } });
});

describe('chat memory in the model picker', () => {
  it('keeps the machine action out of the model picker when the chat header owns it', () => {
    renderPanel(true);
    expect(keyboard.mock.calls[0]?.[0].items.some((item) => item.id === 'machine')).toBe(false);
  });

  it('updates the same chat whether activated by keyboard or by its switch', () => {
    renderPanel();
    const keys = keyboard.mock.calls[0]?.[0];
    const row = switchRow.mock.calls[0]?.[0];
    expect(memoryList).toHaveBeenCalledWith(MEMORY_SESSION);
    expect(keys?.items).toContainEqual({ id: 'memory', disabled: false });
    expect(row).toMatchObject({ compact: true, title: 'Memory', value: true, disabled: false });
    keys?.onActivate('memory');
    row?.onChange(false);
    expect(changeChat.mock.calls).toEqual([
      [CHAT_ID, { memory: false }],
      [CHAT_ID, { memory: false }],
    ]);
  });

  it('blocks both input paths when personal memory is off', () => {
    memoryList.mockReturnValue({ data: { settings: { enabled: false } } });
    renderPanel();
    const keys = keyboard.mock.calls[0]?.[0];
    const row = switchRow.mock.calls[0]?.[0];
    expect(keys?.items).toContainEqual({ id: 'memory', disabled: true });
    expect(row).toMatchObject({ value: false, disabled: true });
    keys?.onActivate('memory');
    row?.onChange(true);
    expect(changeChat).not.toHaveBeenCalled();
  });

  it('does not fetch personal memories in the picker for a new unsaved chat', () => {
    accessory.mockReturnValue(null);
    renderPanel();
    expect(keyboard.mock.calls[0]?.[0].items.some((item) => item.id === 'memory')).toBe(false);
    expect(memoryList).not.toHaveBeenCalled();
    expect(switchRow).not.toHaveBeenCalled();
  });
});
