import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReplyNotices, type ReplyExtras } from '../../src/extensions/push/reply-notices';
import { ReachRefusedError } from '../../src/reach/reach-errors';
import type { Asker } from '../../src/reach/reach-guards';
import { noticeMessenger, type NoticeContext } from '../../src/server/reach-notice';
import { TEST_ENGINE } from '../support/engine';
import { furnishHome } from '../support/tool-home';
import { testStore, type TestStore } from '../support/store';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

let opened: TestStore;
let directory: string;
let notices: ReplyNotices;
let asker: Asker;
let personId: string;

function contextOver(store: TestStore['store']): NoticeContext {
  return {
    store,
    recordingPath: (storagePath) => join(directory, storagePath),
    replyNotices: notices,
    assistant: {
      chats: {
        defaultChat: (profileId) =>
          store.aiChats.latest(profileId) ??
          store.aiChats.create({
            profileId,
            kind: 'chat',
            title: 'Home',
            icon: null,
            parentId: null,
            sourceKey: null,
            engine: TEST_ENGINE,
          }),
      },
      files: {
        pathOf: (file) => join(directory, 'files', file.name),
        keepBytes: (input) =>
          Promise.resolve(
            store.assistantChat.addAttachment({
              id: randomUUID(),
              profile_id: input.profileId,
              name: input.name,
              mime: input.mime,
              bytes: input.content.length,
              width: null,
              height: null,
              storage_path: `files/${input.name}`,
              sha256: 'a'.repeat(64),
            }),
          ),
      },
    },
  };
}

async function snapshot(): Promise<string> {
  const camera = furnishHome(opened.store).camera;
  const row = opened.store.cameras.addRecording({
    deviceId: camera.id,
    eventId: null,
    kind: 'snapshot',
    storagePath: `${camera.id}/shot.jpg`,
    startedAt: '2026-10-25T10:00:00.000Z',
    durationMs: null,
    bytes: JPEG.length,
  });
  await mkdir(join(directory, camera.id), { recursive: true });
  await writeFile(join(directory, row.storage_path), JPEG);
  return row.id;
}

beforeEach(async () => {
  opened = await testStore();
  directory = await mkdtemp(join(tmpdir(), 'notice-'));
  notices = new ReplyNotices();
  personId = opened.store.profiles.first().id;
  asker = { profileId: personId, role: 'owner', clientId: null, chatId: null };
});

afterEach(async () => {
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

describe('the message that notifies a person', () => {
  it('attaches the picture and hands the tag, link and sound to the push while the message is added', async () => {
    const seen: (ReplyExtras | undefined)[] = [];
    let attachments = 0;
    opened.store.feed.subscribe((change) => {
      if (change.table === 'assistant_messages' && change.operation === 'INSERT') {
        seen.push(notices.take(change.record?.id ?? ''));
        attachments = change.record?.attachments.length ?? 0;
      }
    });
    const message = noticeMessenger(contextOver(opened.store));
    const chatId = await message(asker, personId, {
      text: 'Door open',
      image: await snapshot(),
      tag: 'door',
      link: '/cameras',
      sound: 'chime',
    });
    expect(opened.store.aiChats.chat(chatId).profile_id).toBe(personId);
    expect(seen).toStrictEqual([{ tag: 'door', link: '/cameras', sound: 'chime' }]);
    expect(attachments).toBe(1);
  });

  it('sends no extras for a plain text notice', async () => {
    const seen: (ReplyExtras | undefined)[] = [];
    opened.store.feed.subscribe((change) => {
      if (change.table === 'assistant_messages' && change.operation === 'INSERT') {
        seen.push(notices.take(change.record?.id ?? ''));
      }
    });
    await noticeMessenger(contextOver(opened.store))(asker, personId, { text: 'Hello' });
    expect(seen).toStrictEqual([{}]);
  });

  it('refuses a picture that does not exist', async () => {
    const message = noticeMessenger(contextOver(opened.store));
    await expect(
      message(asker, personId, { text: 'Hi', image: randomUUID() }),
    ).rejects.toBeInstanceOf(ReachRefusedError);
  });
});
