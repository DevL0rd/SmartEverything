import { describe, expect, it, vi } from 'vitest';
import { publishProviderEvent } from '../src/assistant/engines/computer/provider-wire';
import type { ComputerEvent } from '../src/assistant/engines/computer/provider-state';

const IDS = {
  job_id: '8a3c1f4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  chat_id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d',
  seq: 3,
};
const CHAT = { id: IDS.chat_id, profile_id: 'profile' };
const DEVICE = '2c3d4e5f-6071-4b8c-9dae-1f2a3b4c5d6e';

function published(event: ComputerEvent): unknown {
  const providerNotice = vi.fn();
  publishProviderEvent({ runtime: 'claude', providerNotice }, CHAT, DEVICE, event);
  return providerNotice.mock.calls[0]?.[0];
}

describe('publishProviderEvent', () => {
  it('sends tool results to clients without their output text', () => {
    const notice = published({
      ...IDS,
      kind: 'tool_result',
      call_id: 'call',
      text: 'x'.repeat(5000),
      failed: false,
    });
    expect(notice).toMatchObject({
      event: { kind: 'tool_result', call_id: 'call', text: '', failed: false },
    });
  });

  it('keeps other events as they are', () => {
    const notice = published({ ...IDS, kind: 'text', delta: 'hello' });
    expect(notice).toMatchObject({ event: { kind: 'text', delta: 'hello' } });
  });
});
