import type { HostedCall } from '../../src/assistant-voice/outreach';

export function idleHostedCall(): HostedCall {
  return {
    hear: (): void => undefined,
    see: (): void => undefined,
    note: (): void => undefined,
    say: (): void => undefined,
    mute: (): void => undefined,
    end: (): Promise<void> => Promise.resolve(),
  };
}
