import { describe, expect, it, vi } from 'vitest';
import type { HubSocket } from '../../../../../api/connection/hub-socket';

const sockets: FakeSocket[] = [];

class FakeSocket implements HubSocket {
  readyState = 1;
  open = true;
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sendable(): boolean {
    return this.open;
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (!this.open) throw new Error('not sendable');
    this.sent.push(data);
  }
  close(): void {
    this.open = false;
  }
}

vi.mock('../../../../../api/connection/hub-socket', () => ({
  openHubSocket: (): HubSocket => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

const { openCallSocket } = await import('./call-socket');

const HANDLERS = {
  onMessage: vi.fn(),
  onAudio: vi.fn(),
  onUnreadable: vi.fn(),
  onClose: vi.fn(),
};
const ID = '00000000-0000-4000-8000-000000000001';
const CONNECTION = { url: 'https://hub.local:7880', token: `set_${'a'.repeat(64)}` };

describe('the call socket', () => {
  it('sends audio and pictures only while the route lets it, without throwing', () => {
    const call = openCallSocket(CONNECTION, HANDLERS);
    const socket = sockets.at(-1);
    call.sendAudio(new Uint8Array([1, 2, 3]));
    call.sendPicture(new Uint8Array([4]));
    expect(socket?.sent).toHaveLength(2);
    if (socket !== undefined) socket.open = false;
    expect(call.isOpen()).toBe(false);
    expect(() => {
      call.sendAudio(new Uint8Array([1]));
      call.sendPicture(new Uint8Array([2]));
      call.send({ type: 'call_resume', callId: ID });
    }).not.toThrow();
    expect(socket?.sent).toHaveLength(2);
  });

  it('passes a close to the call engine so a dropped route never leaves the call hanging', () => {
    openCallSocket(CONNECTION, HANDLERS);
    sockets.at(-1)?.onclose?.({ code: 1001, reason: 'Hub route changed' });
    expect(HANDLERS.onClose).toHaveBeenCalledWith(1001, 'Hub route changed');
  });
});
