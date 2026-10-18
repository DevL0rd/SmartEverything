import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type NodeHello } from '@smarteverything/domain';
import { AssistantFiles } from '../../../src/assistant/files';
import { ComputerNodeAccess } from '../../../src/computers/node-access';
import { attachmentBytes } from '../../../src/harness/transport';
import { useRig, type Rig } from './support/rig';

const CONTENT = Buffer.from('attachment bytes that travel by GET');
const NAME = 'notes.txt';

function helloOf(machine: string): NodeHello {
  return {
    machineId: machine.repeat(32),
    hostname: `desk-${machine}`,
    os: { name: 'Linux', kernel: '6.0' },
    hardware: { vendor: null, product: null, portable: false },
    cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
    memoryBytes: 8e9,
    interfaces: [],
    bootedAt: '2026-10-08T09:00:00.000Z',
    features: [],
    role: 'pc',
    power: [],
    actions: [],
    permissions: [],
  };
}

let rig: Rig;
useRig((made) => {
  rig = made;
});

let server: Server;
let base: string;
let sessionId: string;
let attachmentId: string;
let nodes: ComputerNodeAccess;

function pairing(machine: string): string {
  const { code } = nodes.pair('https://hub.example.com', rig.clientId);
  return nodes.claim(code, helloOf(machine), 'test').paired.token;
}

async function storedAttachment(chatId: string): Promise<string> {
  const { store } = rig.opened;
  const message = store.assistantChat.addMessage({
    profile_id: rig.owner.profileId,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: 'see the file',
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chatId,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  });
  const id = randomUUID();
  const path = join('files', id, NAME);
  await mkdir(join(rig.opened.directory, 'assistant', 'files', id), { recursive: true });
  await writeFile(join(rig.opened.directory, 'assistant', path), CONTENT);
  store.assistantChat.addAttachment({
    id,
    profile_id: rig.owner.profileId,
    name: NAME,
    mime: 'text/plain',
    bytes: CONTENT.byteLength,
    width: null,
    height: null,
    storage_path: path,
    sha256: createHash('sha256').update(CONTENT).digest('hex'),
  });
  store.assistantChat.attachTo(message.id, [id]);
  return id;
}

beforeEach(async () => {
  const { store } = rig.opened;
  nodes = new ComputerNodeAccess(store, () => new Date());
  const chat = rig.newChat(rig.desk.target);
  sessionId = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId).claim.session_id;
  attachmentId = await storedAttachment(chat.id);
  const files = new AssistantFiles({
    dataDirectory: rig.opened.directory,
    chat: store.assistantChat,
    now: (): Date => new Date(),
  });
  const ports = { context: { computerNodes: nodes, assistant: { files } }, service: rig.service };
  server = createServer((request, response) => {
    attachmentBytes(ports, request, response, { sessionId, attachmentId }).catch(
      (cause: unknown) => {
        const code = cause instanceof ApiError ? cause.code : 'internal';
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ code }));
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The server has no port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

describe('GET of a stored attachment by the granted computer', () => {
  it('serves the stored bytes to the computer that hosts the conversation', async () => {
    const token = pairing('a');

    const response = await fetch(base, { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(CONTENT)).toBe(true);
  });

  it('refuses another paired computer', async () => {
    pairing('a');
    const other = pairing('b');

    const response = await fetch(base, { headers: { authorization: `Bearer ${other}` } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'forbidden' });
  });

  it('refuses a request without a computer token', async () => {
    const response = await fetch(base);

    expect(await response.json()).toEqual({ code: 'unauthorized' });
  });
});
