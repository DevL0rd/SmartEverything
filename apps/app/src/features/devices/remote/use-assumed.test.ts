import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Sent {
  calls: { remoteId: string; change: unknown }[];
  fail: boolean;
  notified: string[];
}

const sent: Sent = vi.hoisted(() => ({ calls: [], fail: false, notified: [] }));

vi.mock('../../../api/ir', () => ({
  updateIrRemote: (remoteId: string, change: unknown): Promise<unknown> => {
    sent.calls.push({ remoteId, change });
    return sent.fail ? Promise.reject(new Error('refused')) : Promise.resolve({});
  },
}));

vi.mock('../../../components/toast-store', () => ({
  notifyFailure: (message: string) => (): void => {
    sent.notified.push(message);
  },
}));

const { markRemote, setCheck } = await import('./use-assumed');

beforeEach(() => {
  sent.calls = [];
  sent.fail = false;
  sent.notified = [];
});

describe('correcting what a remote is assumed to be doing', () => {
  it('sends the correction to the home, not to this phone', () => {
    markRemote('tv', false);
    expect(sent.calls).toEqual([{ remoteId: 'tv', change: { on: false } }]);
  });

  it('links and unlinks the device that confirms power', () => {
    setCheck('tv', 'plug-1');
    setCheck('tv', null);
    expect(sent.calls).toEqual([
      { remoteId: 'tv', change: { checkDeviceId: 'plug-1' } },
      { remoteId: 'tv', change: { checkDeviceId: null } },
    ]);
  });

  it('tells the person when the home refused', async () => {
    sent.fail = true;
    markRemote('tv', true);
    await vi.waitFor(() => {
      expect(sent.notified).toEqual(['The remote was not marked']);
    });
  });
});
