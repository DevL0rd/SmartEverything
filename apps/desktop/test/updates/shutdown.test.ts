import { describe, expect, it } from 'vitest';
import { runShutdown } from '../../src/shutdown.js';

describe('stopping the app', () => {
  it('runs every step and settles even when steps fail', async () => {
    const ran: string[] = [];
    await runShutdown([
      {
        name: 'overlay',
        run: (): Promise<never> => {
          ran.push('overlay');
          return Promise.reject(new Error('overlay would not stop'));
        },
      },
      {
        name: 'tray',
        run: (): never => {
          ran.push('tray');
          throw new Error('tray already gone');
        },
      },
      {
        name: 'logs',
        run: (): Promise<void> => {
          ran.push('logs');
          return Promise.resolve();
        },
      },
    ]);
    expect(ran).toStrictEqual(['overlay', 'tray', 'logs']);
  });
});
