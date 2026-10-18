import { describe, expect, it } from 'vitest';
import { useBootedServer } from '../support/booted';
import { openLive } from '../support/server';

const suite = useBootedServer({ linked: false });

describe('/live subscribe', () => {
  it('refuses a subscribe without streams with a readable error and closes the socket', async () => {
    const live = await openLive(suite.current.base, suite.current.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['layouts'] }));
    const refused = await live.next((message) => message.type === 'refused');
    expect(refused.type === 'refused' ? refused.error : null).toStrictEqual({
      code: 'invalid_request',
      message:
        'The live message is not valid: streams: Invalid input: expected array, received undefined.',
    });
    expect(await live.closed).toBe(1008);
  });
});
