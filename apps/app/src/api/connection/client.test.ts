import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import {
  ApiClient,
  InvalidRequestError,
  ServerUnreachableError,
  UnreadableAnswerError,
} from './client';

const TOKEN = `set_${'a'.repeat(64)}`;
const AT = '2026-10-09T10:00:00.000Z';
const ROOM = { id: '00000000-0000-4000-8000-000000000001', name: 'Hall', position: 0 };

interface Sent {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

function serving(
  status: number,
  body: string,
): { client: ApiClient; sent: Sent[]; refused: number[] } {
  const sent: Sent[] = [];
  const refused: number[] = [];
  const client = new ApiClient({
    baseUrl: 'https://home.example.com',
    token: TOKEN,
    fetch: (input, init): Promise<Response> => {
      sent.push({
        url: typeof input === 'string' ? input : 'not a string',
        method: init?.method,
        headers: z.record(z.string(), z.string()).parse(init?.headers),
        body: typeof init?.body === 'string' ? init.body : null,
      });
      return Promise.resolve(new Response(body, { status }));
    },
    onUnauthorized: (): void => {
      refused.push(status);
    },
  });
  return { client, sent, refused };
}

describe('the API client', () => {
  it('builds the path and query, sends the bearer token and parses the answer', async () => {
    const { client, sent } = serving(200, '[]');
    await expect(
      client.call(E.readHistory, {
        query: {
          capabilities: ['power', 'brightness'],
          from: '2026-10-08T00:00:00.000Z',
          limit: 10,
        },
      }),
    ).resolves.toEqual([]);
    expect(sent).toEqual([
      {
        url: 'https://home.example.com/api/history?capabilities=power%2Cbrightness&from=2026-10-08T00%3A00%3A00.000Z&limit=10',
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}` },
        body: null,
      },
    ]);
  });

  it('fills path parameters and sends the body with its defaults applied', async () => {
    const { client, sent } = serving(200, JSON.stringify(ROOM));
    await expect(client.call(E.createRoom, { body: { name: 'Hall' } })).resolves.toEqual(ROOM);
    expect(sent[0]?.body).toBe('{"name":"Hall","position":0}');
    await client.call(E.updateRoom, { params: { roomId: ROOM.id }, body: { name: 'Hall' } });
    expect(sent[1]?.url).toBe(`https://home.example.com/api/rooms/${ROOM.id}`);
    expect(sent[1]?.method).toBe('PATCH');
  });

  it('turns an error envelope into a named error with its code', async () => {
    const { client, refused } = serving(
      409,
      JSON.stringify({ error: { code: 'conflict', message: 'That room exists.' } }),
    );
    const failure = client.call(E.listRooms, {});
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ code: 'conflict', message: 'That room exists.' });
    expect(refused).toEqual([]);
  });

  it('tells the connection when the server no longer accepts the token', async () => {
    const { client, refused } = serving(
      401,
      JSON.stringify({
        error: { code: 'unauthorized', message: 'No paired device has this token.' },
      }),
    );
    await expect(client.call(E.listRooms, {})).rejects.toMatchObject({ code: 'unauthorized' });
    expect(refused).toEqual([401]);
  });

  it('refuses an answer that does not match the contract', async () => {
    const { client } = serving(200, '[{"id":"nope"}]');
    await expect(client.call(E.listRooms, {})).rejects.toBeInstanceOf(UnreadableAnswerError);
  });

  it('refuses to send a request the contract would refuse', async () => {
    const { client, sent } = serving(200, '[]');
    await expect(client.call(E.createRoom, { body: { name: ' ' } })).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
    expect(sent).toEqual([]);
  });

  it('names the server it could not reach', async () => {
    const client = new ApiClient({
      baseUrl: 'https://home.example.com',
      token: null,
      fetch: (): Promise<Response> => Promise.reject(new Error('offline')),
      onUnauthorized: (): void => undefined,
    });
    const failure = client.call(E.status, {});
    await expect(failure).rejects.toBeInstanceOf(ServerUnreachableError);
    await expect(failure).rejects.toThrow(
      'The SmartEverything server at https://home.example.com could not be reached: offline.',
    );
  });

  it('asks for an approval code at its OAuth path through the contract', async () => {
    const answer = { code: '012345', expiresAt: '2026-10-09T10:00:00.000Z' };
    const { client, sent } = serving(200, JSON.stringify(answer));
    await expect(client.call(E.createApprovalCode, {})).resolves.toEqual(answer);
    expect(sent[0]).toMatchObject({
      url: 'https://home.example.com/oauth/approval-code',
      method: 'POST',
      body: null,
    });
  });

  it('starts a SmartThings sign-in and reads the push status', async () => {
    const { client, sent } = serving(
      200,
      JSON.stringify({ url: 'https://api.smartthings.com/oauth/authorize', expiresAt: AT }),
    );
    await client.call(E.authorizeSmartThings, {});
    expect(sent[0]).toMatchObject({
      url: 'https://home.example.com/api/providers/smartthings/authorize',
      method: 'POST',
    });
    const status = serving(
      200,
      JSON.stringify({
        lastAttemptAt: AT,
        lastSentAt: AT,
        lastError: null,
        sent: 1,
        failed: 0,
        removed: 0,
      }),
    );
    await expect(status.client.call(E.readPushStatus, {})).resolves.toMatchObject({ sent: 1 });
    expect(status.sent[0]?.url).toBe('https://home.example.com/api/settings/push/status');
  });

  it('asks for a signed snapshot link of a camera', async () => {
    const link = {
      url: `/media/cameras/${ROOM.id}/snapshot?expires=1&signature=ab`,
      expiresAt: AT,
    };
    const { client, sent } = serving(200, JSON.stringify(link));
    await expect(client.call(E.cameraSnapshot, { params: { deviceId: ROOM.id } })).resolves.toEqual(
      link,
    );
    expect(sent[0]).toMatchObject({
      url: `https://home.example.com/api/cameras/${ROOM.id}/snapshot`,
      method: 'GET',
    });
  });
});
