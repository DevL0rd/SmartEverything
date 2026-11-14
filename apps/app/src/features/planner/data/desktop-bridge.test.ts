import { describe, expect, it, vi } from 'vitest';
import type { DesktopGoogleLink } from '@smarteverything/domain';

vi.mock('../../../design/platform', () => ({ desktopBridge: (): null => null }));

const { authorizeGoogleOnDesktop, desktopGoogleLink } = await import('./desktop-bridge');

const CONSENT = { authUrl: 'https://accounts.example.test/auth', state: 's1' };

interface FakeLink {
  readonly bridge: DesktopGoogleLink;
  readonly authorize: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
}

function link(answer: unknown = { kind: 'cancelled' }): FakeLink {
  const authorize = vi.fn().mockResolvedValue(answer);
  const cancel = vi.fn().mockResolvedValue(undefined);
  const bridge: DesktopGoogleLink = {
    open: () => Promise.resolve({ redirectUri: 'http://127.0.0.1:5000/google/callback' }),
    authorize,
    cancel,
  };
  return { bridge, authorize, cancel };
}

describe('desktop google bridge', () => {
  it('has no link outside the desktop app', () => {
    expect(desktopGoogleLink()).toBeNull();
  });

  it('opens the loopback, asks for consent with its redirect and waits for the answer', async () => {
    const fake = link({
      kind: 'code',
      code: 'c',
      state: 's1',
      redirectUri: 'http://127.0.0.1:5000/google/callback',
    });
    const consent = vi.fn().mockResolvedValue(CONSENT);
    const answer = await authorizeGoogleOnDesktop(fake.bridge, consent);
    expect(consent).toHaveBeenCalledWith('http://127.0.0.1:5000/google/callback');
    expect(fake.authorize).toHaveBeenCalledWith(CONSENT);
    expect(answer.kind).toBe('code');
    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('closes the loopback when the hub refuses to start the link', async () => {
    const fake = link();
    await expect(
      authorizeGoogleOnDesktop(fake.bridge, () => Promise.reject(new Error('refused'))),
    ).rejects.toThrow('refused');
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(fake.authorize).not.toHaveBeenCalled();
  });
});
