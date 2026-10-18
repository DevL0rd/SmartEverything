import type { LiveSession } from './gemini';

const CONNECT_TIMEOUT_MS = 15_000;

export class LiveConnectTimeoutError extends Error {
  override readonly name = 'LiveConnectTimeoutError';

  constructor() {
    super('Gemini did not answer in time; try the call again.');
  }
}

export function connectWithin(
  connecting: Promise<LiveSession>,
  milliseconds: number = CONNECT_TIMEOUT_MS,
): Promise<LiveSession> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new LiveConnectTimeoutError());
    }, milliseconds);
    timer.unref();
    connecting.then(
      (session) => {
        clearTimeout(timer);
        if (expired) {
          session.close();
        } else {
          resolve(session);
        }
      },
      (cause: unknown) => {
        clearTimeout(timer);
        if (!expired) {
          reject(cause instanceof Error ? cause : new Error('Gemini did not connect'));
        }
      },
    );
  });
}
