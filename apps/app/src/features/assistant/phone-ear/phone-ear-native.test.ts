import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    configureListening: vi.fn(() => Promise.resolve()),
    addListener: vi.fn((name: string, handler: (payload: unknown) => void) => {
      handlers.set(name, handler);
      return { remove: vi.fn() };
    }),
  };
});

vi.mock('expo', () => ({
  NativeModule: Object,
  requireOptionalNativeModule: (): typeof fake => fake,
}));

vi.mock('../../../../modules/health-connect/src/hub-network', () => ({
  withNativeEnrollment: (
    _url: string,
    _token: string,
    run: (ticket: string) => Promise<void>,
  ): Promise<void> => run('ticket'),
}));

vi.mock('../../../../modules/health-connect/src/health-connect', () => ({
  AppUpdateNeededError: class extends Error {},
}));

const { addListeningListeners, configureListening } =
  await import('../../../../modules/health-connect/src/listening');

beforeEach(() => {
  vi.clearAllMocks();
  fake.handlers.clear();
});

describe('the listening bridge', () => {
  it('passes the server, an enrollment ticket and the config as JSON', async () => {
    await configureListening('https://hub', 'secret', {
      wake: true,
      transcribe: false,
      keywords: '▁HE Y @hey',
      threshold: 0.15,
      pause_ms: 640,
      power_mode: 'always',
    });
    expect(fake.configureListening).toHaveBeenCalledWith(
      'https://hub',
      'secret',
      'ticket',
      '{"wake":true,"transcribe":false,"keywords":"▁HE Y @hey","threshold":0.15,"pause_ms":640,"power_mode":"always"}',
    );
  });

  it('hands over state and wake events after reading them', () => {
    const state = vi.fn();
    const wake = vi.fn();
    addListeningListeners({ state, wake });
    fake.handlers.get('onListeningState')?.({
      status: 'resting',
      detail: 'in a call',
      transcribe: true,
    });
    fake.handlers.get('onListeningWake')?.({
      phrase: 'hey jarvis',
      snippetDbfs: -20,
      preroll: 'AAAA',
      atMs: 5,
    });
    expect(state).toHaveBeenCalledWith({
      status: 'resting',
      detail: 'in a call',
      transcribe: true,
    });
    expect(wake).toHaveBeenCalledWith({
      phrase: 'hey jarvis',
      snippetDbfs: -20,
      preroll: 'AAAA',
      atMs: 5,
    });
  });

  it('refuses an event the native side should never send', () => {
    addListeningListeners({ state: vi.fn(), wake: vi.fn() });
    expect(() => fake.handlers.get('onListeningState')?.({ status: 'asleep' })).toThrow();
  });
});
