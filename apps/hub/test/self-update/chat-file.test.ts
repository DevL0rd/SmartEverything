import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import type { AiChatRow } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantFiles } from '../../src/assistant/files';
import type { HubLayout } from '../../src/data-layout';
import { chatFolder } from '../../src/projects/paths';
import {
  chatFileDeliveryRoutes,
  sendChatFile,
  sendChatFileLinkToChat,
  sendChatFileToChat,
} from '../../src/self-update/chat-file';
import { TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-05T08:00:00.000Z');
const BODY = 'abcdef';
const PUBLIC_URL = 'https://home.example';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const fixtures: TestStore[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

interface Setup {
  readonly layout: HubLayout;
  readonly chat: AiChatRow;
  readonly path: string;
}

function chatOf(fixture: TestStore, title: string): AiChatRow {
  const { store } = fixture;
  return store.aiChats.create({
    profileId: store.profiles.first().id,
    kind: 'chat',
    title,
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
}

async function setup(): Promise<Setup> {
  const fixture = await testStore(() => NOW);
  fixtures.push(fixture);
  const { layout } = fixture;
  const artifacts = join(layout.system.updates.selfUpdate, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const path = join(artifacts, 'build.apk');
  await writeFile(path, BODY);
  await writeFile(layout.system.database.file, BODY);
  return { layout, chat: chatOf(fixture, 'Delivery'), path };
}

async function ticketFor(
  { layout, chat }: Pick<Setup, 'layout' | 'chat'>,
  path: string,
): ReturnType<typeof sendChatFile> {
  return sendChatFile({ layout, chat, path, what: 'A verified build', publicUrl: PUBLIC_URL }, NOW);
}

async function readTicket(
  layout: HubLayout,
  url: string,
  now: Date,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  const [route] = chatFileDeliveryRoutes(layout, () => now);
  if (route === undefined) throw new Error('The download route is absent');
  const server = createServer((request, response) => {
    const params = { ticket: new URL(url).pathname.split('/').at(-1) ?? '' };
    route.handle(request, response, params).catch((cause: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(400);
      response.end(cause instanceof Error ? cause.message : String(cause));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No test HTTP port');
    const response = await fetch(`http://127.0.0.1:${String(address.port)}/`, { headers });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: response.headers,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause === undefined) resolve();
        else reject(cause);
      }),
    );
  }
}

describe('claimable chat files', () => {
  it('posts the claim link in the requesting chat before returning its receipt', async () => {
    const fixture = await testStore(() => NOW);
    try {
      const { store, layout } = fixture;
      const chat = chatOf(fixture, 'Report');
      const workspace = join(chatFolder(layout, chat), 'workspace');
      await mkdir(workspace, { recursive: true });
      const path = join(workspace, 'report.txt');
      await writeFile(path, BODY);
      await writeFile(layout.system.database.file, BODY);

      const receipt = await sendChatFileLinkToChat(
        store,
        {
          layout,
          chat,
          path,
          publicUrl: PUBLIC_URL,
          what: 'Your report',
        },
        NOW,
      );

      expect(store.assistantChat.message(receipt.runId)).toMatchObject({
        chat_id: chat.id,
        profile_id: chat.profile_id,
        role: 'responder',
        kind: 'update',
        text: `Your report\n\n[Download file](${receipt.downloadUrl}) · Available for four hours.`,
      });
      expect(await (await readTicket(layout, receipt.downloadUrl, NOW)).text()).toBe(BODY);
    } finally {
      await fixture.close();
    }
  });

  it.each([
    { name: 'report.txt', mime: 'text/plain', content: Buffer.from(BODY), size: null },
    { name: 'photo.png', mime: 'image/png', content: PNG, size: 1 },
    { name: 'recording.mp3', mime: 'audio/mpeg', content: Buffer.from(BODY), size: null },
  ])('posts $name as a private attachment with its original bytes', async (sample) => {
    const fixture = await testStore(() => NOW);
    try {
      const { store, layout } = fixture;
      const chat = chatOf(fixture, 'Attachment');
      const workspace = join(chatFolder(layout, chat), 'workspace');
      await mkdir(workspace, { recursive: true });
      const path = join(workspace, sample.name);
      await writeFile(path, sample.content);
      const files = new AssistantFiles({
        layout,
        chat: store.assistantChat,
        now: (): Date => NOW,
      });

      const receipt = await sendChatFileToChat(store, files, {
        layout,
        chat,
        path,
        what: 'Requested file',
      });

      expect(receipt).not.toHaveProperty('downloadUrl');
      expect(store.assistantChat.message(receipt.messageId)).toMatchObject({
        chat_id: chat.id,
        profile_id: chat.profile_id,
        role: 'responder',
        kind: 'update',
        text: 'Requested file',
        attachments: [
          {
            id: receipt.attachmentId,
            name: sample.name,
            mime: sample.mime,
            bytes: sample.content.length,
            width: sample.size,
            height: sample.size,
          },
        ],
      });
      const stored = store.assistantChat.attachment(receipt.attachmentId);
      expect(stored.message_id).toBe(receipt.messageId);
      expect(await readFile(files.pathOf(stored))).toEqual(sample.content);
    } finally {
      await fixture.close();
    }
  });

  it('streams a range from the snapshot even after the source file was replaced', async () => {
    const made = await setup();
    const { downloadUrl } = await ticketFor(made, made.path);
    await writeFile(made.path, 'bad replacement');
    const answer = await readTicket(made.layout, downloadUrl, NOW, { Range: 'bytes=1-3' });
    expect(answer.status).toBe(206);
    expect(answer.headers.get('content-disposition')).toBe('attachment; filename="build.apk"');
    expect(answer.headers.get('content-range')).toBe('bytes 1-3/6');
    expect(await answer.text()).toBe('bcd');
  });

  it('will not return bytes for a forged or expired ticket', async () => {
    const made = await setup();
    const { downloadUrl, expiresAt } = await ticketFor(made, made.path);
    const forged = downloadUrl.replace(/[^/]+$/u, '0'.repeat(64));
    expect((await readTicket(made.layout, forged, NOW)).status).toBe(400);
    const expired = await readTicket(made.layout, downloadUrl, new Date(expiresAt));
    expect(expired.status).toBe(400);
    expect(await expired.text()).toMatch(/expired/u);
  });

  it('cannot send a hub data file or escape the artifact directory through a symlink', async () => {
    const made = await setup();
    const database = made.layout.system.database.file;
    const shortcut = join(made.layout.system.updates.selfUpdate, 'artifacts', 'shortcut');
    await symlink(database, shortcut);
    await expect(ticketFor(made, database)).rejects.toThrow(/workspace/u);
    await expect(ticketFor(made, shortcut)).rejects.toThrow(/workspace/u);
  });

  it('refuses directories as download sources', async () => {
    const made = await setup();
    const path = join(made.layout.system.updates.selfUpdate, 'artifacts', 'directory');
    await mkdir(path);
    await expect(ticketFor(made, path)).rejects.toThrow(/regular file/u);
  });
});
