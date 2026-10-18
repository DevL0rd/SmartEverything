import { beforeEach, describe, expect, it, vi } from 'vitest';

const CALL_ID = '6c1c4f32-0b8e-4c55-9d7a-2b1f8f6a1e01';

interface Running {
  readonly callId: string;
  readonly startedAt: number;
  readonly muted: boolean;
  readonly replay: readonly string[];
}

interface Listeners {
  readonly message: (json: string) => void;
}

interface Fake {
  running: Running | null;
  listeners: Listeners | null;
}

const fake = vi.hoisted(() => {
  const state: Fake = { running: null, listeners: null };
  return {
    state,
    openAssistantCall: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../../../../../../modules/health-connect', () => ({
  assistantCallCan: (): boolean => true,
  assistantCallLinked: (): boolean => true,
  attachAssistantCall: (): Running | null => fake.state.running,
  addAssistantCallListeners: (listeners: Listeners): { readonly remove: () => void } => {
    fake.state.listeners = listeners;
    return { remove: vi.fn() };
  },
  openAssistantCall: fake.openAssistantCall,
  applyAssistantCallAudio: vi.fn(() => Promise.resolve()),
  sendAssistantCallMessage: vi.fn(() => Promise.resolve(true)),
  endAssistantCall: vi.fn(() => Promise.resolve()),
  muteAssistantCall: vi.fn(() => Promise.resolve()),
  beginAssistantCall: vi.fn(() => Promise.resolve()),
  answerAssistantCall: vi.fn(() => Promise.resolve()),
}));

vi.mock('./native-devices', () => ({ watchNativeDevices: vi.fn() }));

const { NativeCallEngine } = await import('./native-call-engine');
const { callState, changeCall, IDLE_CALL } = await import('../../call-state');

const REQUEST = {
  connection: { url: 'https://home.test', token: 'token' },
  source: 'assist',
  chatId: null,
  answering: null,
  device: 'the phone',
} as const;

describe('the native call engine', () => {
  beforeEach(() => {
    fake.state.running = null;
    fake.openAssistantCall.mockClear();
    changeCall(() => IDLE_CALL);
  });

  it('adopts a call the assist gesture started natively instead of opening a second one', () => {
    fake.state.running = {
      callId: CALL_ID,
      startedAt: 1234,
      muted: true,
      replay: [`{"type":"call_state","callId":"${CALL_ID}","state":"listening"}`],
    };
    new NativeCallEngine().start(REQUEST);
    expect(fake.openAssistantCall).not.toHaveBeenCalled();
    expect(callState.get()).toMatchObject({
      callId: CALL_ID,
      startedAt: 1234,
      muted: true,
      phase: 'listening',
    });
  });

  it('keeps following the adopted call through its later messages', () => {
    fake.state.running = { callId: CALL_ID, startedAt: 1, muted: false, replay: [] };
    new NativeCallEngine().start(REQUEST);
    fake.state.listeners?.message(`{"type":"call_state","callId":"${CALL_ID}","state":"speaking"}`);
    expect(callState.get().phase).toBe('speaking');
  });

  it('opens a new call when nothing is running natively', () => {
    new NativeCallEngine().start(REQUEST);
    expect(fake.openAssistantCall).toHaveBeenCalledWith('https://home.test', 'token');
    expect(callState.get().phase).toBe('connecting');
  });
});
