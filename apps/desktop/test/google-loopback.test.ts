import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleLoopbackBusyError,
  GoogleLoopbackCancelledError,
  GoogleLoopbackDeniedError,
  listenGoogleLoopback,
  type GoogleLoopbackSession,
} from '../src/google/loopback.js';

const AUTH_URL = 'https://accounts.example.test/auth?state=s1';
const sessions: GoogleLoopbackSession[] = [];

async function open(
  openExternal: (url: string) => Promise<void> = () => Promise.resolve(),
): Promise<GoogleLoopbackSession> {
  const session = await listenGoogleLoopback({ openExternal });
  sessions.push(session);
  return session;
}

function reachable(uri: string): Promise<boolean> {
  return fetch(uri).then(
    () => true,
    () => false,
  );
}

afterEach(() => {
  for (const session of sessions.splice(0)) session.cancel();
});

describe('google loopback catcher', () => {
  it('binds 127.0.0.1 on a random port and opens the auth url externally', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const session = await open(openExternal);
    expect(session.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/google\/callback$/);
    const pending = session.authorize(AUTH_URL, 's1');
    expect(openExternal).toHaveBeenCalledWith(AUTH_URL);
    await fetch(`${session.redirectUri}?state=s1&code=c1`);
    await expect(pending).resolves.toEqual({
      code: 'c1',
      state: 's1',
      redirectUri: session.redirectUri,
    });
  });

  it('ignores an answer with a different state and keeps waiting', async () => {
    const session = await open();
    const pending = session.authorize(AUTH_URL, 's1');
    const wrong = await fetch(`${session.redirectUri}?state=other&code=evil`);
    expect(wrong.status).toBe(400);
    const missing = await fetch(`${session.redirectUri}?code=evil`);
    expect(missing.status).toBe(400);
    await fetch(`${session.redirectUri}?state=s1&code=good`);
    await expect(pending).resolves.toMatchObject({ code: 'good', state: 's1' });
  });

  it('closes the port after one code', async () => {
    const session = await open();
    const pending = session.authorize(AUTH_URL, 's1');
    await fetch(`${session.redirectUri}?state=s1&code=c1`);
    await pending;
    expect(await reachable(`${session.redirectUri}?state=s1&code=c2`)).toBe(false);
  });

  it('answers other paths with 404 and does not settle', async () => {
    const session = await open();
    const pending = session.authorize(AUTH_URL, 's1');
    const other = await fetch(new URL('/favicon.ico', session.redirectUri));
    expect(other.status).toBe(404);
    await fetch(`${session.redirectUri}?state=s1&code=c1`);
    await expect(pending).resolves.toMatchObject({ code: 'c1' });
  });

  it('rejects as denied when Google answers with an error, then closes', async () => {
    const session = await open();
    const outcome = session.authorize(AUTH_URL, 's1').catch((cause: unknown) => cause);
    await fetch(`${session.redirectUri}?state=s1&error=access_denied`);
    const error = await outcome;
    expect(error).toBeInstanceOf(GoogleLoopbackDeniedError);
    expect(error).toMatchObject({ reason: 'access_denied' });
    expect(await reachable(session.redirectUri)).toBe(false);
  });

  it('cancel rejects the waiting authorize and closes the port', async () => {
    const session = await open();
    const pending = session.authorize(AUTH_URL, 's1');
    session.cancel();
    await expect(pending).rejects.toBeInstanceOf(GoogleLoopbackCancelledError);
    expect(await reachable(session.redirectUri)).toBe(false);
  });

  it('cancel before authorize closes the port and authorize then refuses', async () => {
    const session = await open();
    session.cancel();
    expect(await reachable(session.redirectUri)).toBe(false);
    await expect(session.authorize(AUTH_URL, 's1')).rejects.toBeInstanceOf(
      GoogleLoopbackCancelledError,
    );
  });

  it('refuses a second concurrent authorize', async () => {
    const session = await open();
    const first = session.authorize(AUTH_URL, 's1');
    await expect(session.authorize(AUTH_URL, 's2')).rejects.toBeInstanceOf(GoogleLoopbackBusyError);
    session.cancel();
    await expect(first).rejects.toBeInstanceOf(GoogleLoopbackCancelledError);
  });

  it('refuses a non-https auth url without opening it', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const session = await open(openExternal);
    await expect(session.authorize('http://accounts.example.test/auth', 's1')).rejects.toThrow();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('closes and rejects when the browser cannot be opened', async () => {
    const session = await open(() => Promise.reject(new Error('no browser')));
    await expect(session.authorize(AUTH_URL, 's1')).rejects.toThrow('no browser');
    expect(await reachable(session.redirectUri)).toBe(false);
  });

  it('uses a different port for each session', async () => {
    const a = await open();
    const b = await open();
    expect(a.redirectUri).not.toBe(b.redirectUri);
  });
});
