import { describe, expect, it } from 'vitest';
import { ApiClient } from '../../../../api/connection/client';
import { applyLinkChange, linkFailureText, type LinkPorts } from './room-link-calls';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const KITCHEN = '00000000-0000-4000-8000-0000000000a1';
const CREATED = '00000000-0000-4000-8000-0000000000a2';
const ANSWER = { mapIndex: 7, rooms: [], stale: [], homeRooms: [], unlinked: 0 };

interface Sent {
  readonly url: string;
  readonly method: string | undefined;
  readonly body: string | null;
}

function hub(): { readonly ports: LinkPorts; readonly sent: Sent[]; readonly created: string[] } {
  const sent: Sent[] = [];
  const created: string[] = [];
  const client = new ApiClient({
    baseUrl: 'https://home.example.com',
    token: `set_${'a'.repeat(64)}`,
    fetch: (input, init): Promise<Response> => {
      sent.push({
        url: typeof input === 'string' ? input : 'not a string',
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : null,
      });
      return Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200 }));
    },
    onUnauthorized: (): void => undefined,
  });
  const createRoom = (name: string): Promise<{ readonly id: string }> => {
    created.push(name);
    return Promise.resolve({ id: CREATED });
  };
  return { ports: { client, createRoom }, sent, created };
}

const ROOM_LINKS = `https://home.example.com/api/vacuums/${DEVICE}/room-links/3`;

describe('linking a map room to a home room', () => {
  it('sends the map room id in the path and the home room in the body', async () => {
    const { ports, sent } = hub();
    const change = {
      kind: 'link',
      mapRoomId: 3,
      mapRoomName: 'Room 3',
      roomId: KITCHEN,
      move: false,
    } as const;
    await expect(applyLinkChange(ports, DEVICE, change)).resolves.toStrictEqual(ANSWER);
    expect(sent).toStrictEqual([
      { url: ROOM_LINKS, method: 'PUT', body: `{"roomId":"${KITCHEN}","move":false}` },
    ]);
  });

  it('creates a home room with the robot name and links the new room', async () => {
    const { ports, sent, created } = hub();
    await applyLinkChange(ports, DEVICE, { kind: 'create', mapRoomId: 3, mapRoomName: 'Room 3' });
    expect(created).toStrictEqual(['Room 3']);
    expect(sent.map(({ url, body }) => [url, body])).toStrictEqual([
      [ROOM_LINKS, `{"roomId":"${CREATED}","move":false}`],
    ]);
  });

  it('unlinks with a DELETE on the map room', async () => {
    const { ports, sent } = hub();
    await applyLinkChange(ports, DEVICE, { kind: 'unlink', mapRoomId: 3, mapRoomName: 'Room 3' });
    expect(sent.map(({ url, method }) => [url, method])).toStrictEqual([[ROOM_LINKS, 'DELETE']]);
  });

  it('names the map room in the failure message', () => {
    expect(linkFailureText({ kind: 'unlink', mapRoomId: 3, mapRoomName: 'Room 3' })).toBe(
      'Room 3 was not unlinked',
    );
    expect(linkFailureText({ kind: 'create', mapRoomId: 3, mapRoomName: 'Room 3' })).toBe(
      'Room 3 was not linked',
    );
  });
});
