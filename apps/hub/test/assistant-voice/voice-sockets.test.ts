import {
  ASSISTANT_VOICE_PATH,
  ASSISTANT_VOICE_PROTOCOL,
  sightFrameOf,
  type AssistantVoiceClientMessage,
  type ClientRow,
  type SightFrame,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VoiceEndpoint } from '../../src/assistant-voice/call-link';
import { VoiceSockets } from '../../src/assistant-voice/voice-sockets';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import {
  addClient,
  serveSockets,
  type SocketBench,
  type TestClient,
} from '../support/socket-client';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

interface Seen {
  readonly connected: VoiceEndpoint[];
  readonly messages: {
    endpoint: VoiceEndpoint;
    client: ClientRow;
    message: AssistantVoiceClientMessage;
  }[];
  readonly audio: Uint8Array[];
  readonly sights: SightFrame[];
  readonly disconnected: VoiceEndpoint[];
}

const CALL = '7d2f1a3e-5b8c-4e91-9c7a-2f6d3b1a8e40';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

let test: TestStore;
let logs: CapturedLogs;
let sockets: VoiceSockets;
let bench: SocketBench;
let seen: Seen;
let owner: TestClient;

beforeEach(async () => {
  logs = captureLogs();
  test = await testStore();
  owner = addClient(test, 'Pixel', 'owner');
  seen = { connected: [], messages: [], audio: [], sights: [], disconnected: [] };
  sockets = new VoiceSockets(
    test.store,
    {
      connected: (endpoint): void => {
        seen.connected.push(endpoint);
      },
      message: (endpoint, client, message): void => {
        seen.messages.push({ endpoint, client, message });
      },
      audio: (_endpoint, packet): void => {
        seen.audio.push(packet);
      },
      sight: (_endpoint, frame): void => {
        seen.sights.push(frame);
      },
      disconnected: (endpoint): void => {
        seen.disconnected.push(endpoint);
      },
    },
    testLogger('voice'),
  );
  bench = await serveSockets(ASSISTANT_VOICE_PROTOCOL, (request, socket, head) => {
    sockets.upgrade(request, socket, head);
  });
});

afterEach(async () => {
  bench.stop();
  sockets.stop();
  await test.close();
});

describe('assistant voice sockets', () => {
  it('names the path and refuses a connection without a device token', async () => {
    expect(ASSISTANT_VOICE_PATH).toBe('/assistant');
    expect(await bench.refused()).toBeInstanceOf(Error);
    expect(seen.connected).toHaveLength(0);
  });

  it('opens an endpoint for the client, lists it, and reports it gone on close', async () => {
    const link = await bench.connect(owner.token);
    await until(() => seen.connected.length === 1, 'the connection');
    const endpoint = seen.connected[0];
    expect(endpoint?.clientId).toBe(owner.id);
    expect(sockets.endpoints()).toEqual([endpoint]);
    link.socket.close();
    await until(() => seen.disconnected.length === 1, 'the disconnect');
    expect(seen.disconnected[0]).toBe(endpoint);
    expect(sockets.endpoints()).toEqual([]);
  });

  it('passes a valid message with its endpoint and client, and drops one the schema refuses', async () => {
    const link = await bench.connect(owner.token);
    link.socket.send(JSON.stringify({ type: 'call_end', callId: 'not-a-uuid' }));
    link.socket.send(JSON.stringify({ type: 'mute', callId: CALL, muted: true }));
    await until(() => seen.messages.length === 1, 'the valid message');
    expect(seen.messages[0]?.message).toEqual({ type: 'mute', callId: CALL, muted: true });
    expect(seen.messages[0]?.client.id).toBe(owner.id);
    expect(seen.messages[0]?.endpoint).toBe(seen.connected[0]);
    expect(logs.events().filter((event) => event === 'voice.ignored')).toHaveLength(1);
  });

  it('routes audio frames to the audio handler and picture frames to the sight handler', async () => {
    const link = await bench.connect(owner.token);
    link.socket.send(Buffer.from([1, 0xf8, 0xff, 0xfe]));
    link.socket.send(sightFrameOf({ source: 'phone_camera', still: true, jpeg: JPEG }));
    await until(() => seen.audio.length === 1 && seen.sights.length === 1, 'both frames');
    expect([...(seen.audio[0] ?? [])]).toEqual([0xf8, 0xff, 0xfe]);
    expect(seen.sights[0]).toMatchObject({ source: 'phone_camera', still: true });
    expect([...(seen.sights[0]?.jpeg ?? [])]).toEqual([...JPEG]);
  });

  it('ignores a frame with an unknown kind and keeps the call connected', async () => {
    const link = await bench.connect(owner.token);
    link.socket.send(Buffer.from([9, 1, 2]));
    link.socket.send(Buffer.from([1, 0xf8]));
    await until(() => seen.audio.length === 1, 'the next good frame');
    expect(link.socket.readyState).toBe(link.socket.OPEN);
    expect(logs.events()).toContain('voice.ignored');
  });

  it('delivers what the endpoint sends as text and audio frames to the client', async () => {
    const link = await bench.connect(owner.token);
    await until(() => seen.connected.length === 1, 'the connection');
    seen.connected[0]?.send({ type: 'interrupted', callId: CALL });
    seen.connected[0]?.audio(Uint8Array.from([1, 7]));
    await until(() => link.messages.length === 1 && link.frames.length === 1, 'the delivery');
    expect(link.messages[0]).toEqual({ type: 'interrupted', callId: CALL });
    expect([...(link.frames[0] ?? [])]).toEqual([1, 7]);
  });
});
