import { DESKTOP_GOOGLE_AUTHORIZE, type DesktopGoogleAnswer } from '@smarteverything/domain';
import { shell } from 'electron';
import type { ArgumentHandle } from '../ipc.js';
import {
  GoogleLoopbackCancelledError,
  GoogleLoopbackDeniedError,
  listenGoogleLoopback,
  type GoogleLoopbackSession,
} from './loopback.js';

class GoogleLinkNotOpenError extends Error {
  constructor() {
    super('open the Google loopback before authorizing');
    this.name = 'GoogleLinkNotOpenError';
  }
}

async function answerOf(
  session: GoogleLoopbackSession,
  authUrl: string,
  state: string,
): Promise<DesktopGoogleAnswer> {
  try {
    const result = await session.authorize(authUrl, state);
    return { kind: 'code', ...result };
  } catch (cause) {
    if (cause instanceof GoogleLoopbackDeniedError) {
      return { kind: 'denied', reason: cause.reason };
    }
    if (cause instanceof GoogleLoopbackCancelledError) return { kind: 'cancelled' };
    throw cause;
  }
}

export function registerGoogleIpc(handle: ArgumentHandle): void {
  let current: GoogleLoopbackSession | null = null;
  handle('desktop:google-link-open', async () => {
    current?.cancel();
    const session = await listenGoogleLoopback({
      openExternal: (url) => shell.openExternal(url),
    });
    current = session;
    return { redirectUri: session.redirectUri };
  });
  handle('desktop:google-link-authorize', async (argument) => {
    const input = DESKTOP_GOOGLE_AUTHORIZE.parse(argument);
    const session = current;
    if (session === null) throw new GoogleLinkNotOpenError();
    try {
      return await answerOf(session, input.authUrl, input.state);
    } finally {
      if (current === session) current = null;
    }
  });
  handle('desktop:google-link-cancel', () => {
    current?.cancel();
    current = null;
    return undefined;
  });
}
