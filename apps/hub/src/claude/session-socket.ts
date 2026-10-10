import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ClaudeControlFailedError } from './errors';

const DELIVERY_TIMEOUT_MS = 10_000;

const SOCKET_PATH = z
  .string()
  .refine((path) => isAbsolute(path) && path.endsWith('.sock'), 'not an absolute .sock path');

const USER_FRAME = z.strictObject({
  type: z.literal('user'),
  message: z.strictObject({ role: z.literal('user'), content: z.string().min(1) }),
});

export function deliverToSocket(socket: string, text: string): Promise<void> {
  const path = SOCKET_PATH.safeParse(socket);
  if (!path.success) {
    return Promise.reject(
      new ClaudeControlFailedError('send', 'session socket', 'the session names no usable socket'),
    );
  }
  const frame = USER_FRAME.parse({ type: 'user', message: { role: 'user', content: text } });
  return new Promise((done, fail) => {
    const connection = createConnection(path.data, () => {
      connection.end(`${JSON.stringify(frame)}\n`, () => {
        done();
      });
    });
    connection.setTimeout(DELIVERY_TIMEOUT_MS, () => {
      connection.destroy(
        new ClaudeControlFailedError(
          'send',
          'session socket',
          'the session did not accept it in time',
        ),
      );
    });
    connection.on('error', (cause) => {
      fail(
        cause instanceof ClaudeControlFailedError
          ? cause
          : new ClaudeControlFailedError('send', 'session socket', cause.message),
      );
    });
  });
}
