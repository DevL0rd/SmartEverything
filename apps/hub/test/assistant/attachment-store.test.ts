import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { ProjectFilesService } from '../../src/projects/service';
import { harnessRig, type Rig } from './harness/support/rig';
import { hubLayout, layoutFromNames, V1_NAMES } from '../../src/data-layout';

let rig: Rig;
let files: AssistantFiles;
let projects: ProjectFilesService;
let chatId: string;

beforeEach(async () => {
  rig = await harnessRig();
  projects = new ProjectFilesService(rig.opened.layout, rig.opened.store.aiChats);
  files = new AssistantFiles({
    layout: hubLayout(rig.opened.directory, {}),
    chat: rig.opened.store.assistantChat,
    now: (): Date => new Date(),
    projects,
  });
  chatId = rig.newChat({ kind: 'server' }).id;
});
afterEach(async () => {
  await rig.close();
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function keep(name: string, content: Buffer): ReturnType<AssistantFiles['keepBytes']> {
  return files.keepBytes({
    profileId: rig.owner.profileId,
    authorize: () => undefined,
    name,
    mime: 'image/png',
    content,
    signal: new AbortController().signal,
  });
}

describe('one place for every attachment', () => {
  it('keeps generated output next to uploads and removes it again', async () => {
    const kept = await keep('picture.png', PNG);

    expect(kept.storage_path).toBe(join('files', kept.id, 'picture.png'));
    expect(await readFile(files.pathOf(kept))).toStrictEqual(PNG);

    await files.remove([kept]);
    await expect(stat(dirname(files.pathOf(kept)))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps each attachment in its owner’s folder of the layout', async () => {
    const kept = await keep('picture.png', PNG);

    expect(files.pathOf(kept)).toBe(
      rig.opened.layout.person(kept.profile_id).attachment(kept.id, 'picture.png'),
    );
  });

  it('keeps attachments under people/<profile> once the layout is the v1 tree', async () => {
    const layout = layoutFromNames(rig.opened.directory, V1_NAMES, {});
    const v1 = new AssistantFiles({
      layout,
      chat: rig.opened.store.assistantChat,
      now: (): Date => new Date(),
    });

    const kept = await v1.keepBytes({
      profileId: rig.owner.profileId,
      authorize: () => undefined,
      name: 'picture.png',
      mime: 'image/png',
      content: PNG,
      signal: new AbortController().signal,
    });

    const expected = join(
      rig.opened.directory,
      'people',
      rig.owner.profileId,
      'attachments',
      kept.id,
      'picture.png',
    );
    expect(v1.pathOf(kept)).toBe(expected);
    expect(await readFile(expected)).toStrictEqual(PNG);
  });

  it('stages upload chunks in the hub temp folder and removes them when finished', async () => {
    const started = await files.start({
      profileId: rig.owner.profileId,
      name: 'chunk.png',
      mime: 'image/png',
      bytes: PNG.length,
    });
    const part = join(rig.opened.layout.tmp, `upload-${started.uploadId}.part`);

    await files.chunk(rig.owner.profileId, started.uploadId, 0, PNG.toString('base64'));
    expect(await readFile(part)).toStrictEqual(PNG);

    const kept = await files.finish(rig.owner.profileId, started.uploadId);
    await expect(stat(part)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(files.pathOf(kept))).toStrictEqual(PNG);
  });

  it('refuses output that is empty', async () => {
    await expect(keep('empty.png', Buffer.alloc(0))).rejects.toThrow('attachment bound');
  });
});

function latch(): { readonly wait: Promise<void>; readonly release: () => void } {
  let release = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

it('cannot attach an expired upload while its bytes are being removed', async () => {
  const { store, directory } = rig.opened;
  const profileId = rig.owner.profileId;
  const expired = await keep('expired.png', PNG);
  const retained = await keep('retained.png', PNG);
  const origin = { source: 'app', plugin_id: null, device_id: null, name: null } as const;
  const log = new ConversationLog(store);
  const send = (file: typeof expired): ReturnType<ConversationLog['person']> =>
    log.person({
      chat: store.aiChats.chat(chatId),
      clientId: rig.clientId,
      author: 'Owner',
      text: '',
      files: [file],
      origin,
    });
  const sent = send(retained);
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const cleaner = new AssistantFiles({
    layout: hubLayout(directory, {}),
    chat: store.assistantChat,
    now: (): Date => new Date(Date.parse(expired.created_at) + twoDays),
  });
  const removing = latch();
  const finish = latch();
  const remove = cleaner.remove.bind(cleaner);
  vi.spyOn(cleaner, 'remove').mockImplementation(async (stale) => {
    removing.release();
    await finish.wait;
    return remove(stale);
  });
  const started = cleaner.start({ profileId, name: 'next.png', mime: 'image/png', bytes: 1 });
  try {
    await removing.wait;
    expect(() => send(expired)).toThrow('Attach the file again');
    expect(store.assistantChat.attachmentsOf(sent.id)).toEqual([
      { ...retained, message_id: sent.id },
    ]);
  } finally {
    finish.release();
    await started;
  }
  expect(() => send(expired)).toThrow('Attach the file again');
  expect(store.assistantChat.messageIdsOf(chatId)).toEqual([sent.id]);
  await expect(readFile(files.pathOf(expired))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(files.pathOf(retained))).resolves.toEqual(PNG);
});

it('keeps a partially removed upload unbindable and retries cleanup', async () => {
  const { store, directory } = rig.opened;
  const profileId = rig.owner.profileId;
  const expired = await keep('expired.png', PNG);
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const cleaner = new AssistantFiles({
    layout: hubLayout(directory, {}),
    chat: store.assistantChat,
    now: (): Date => new Date(Date.parse(expired.created_at) + twoDays),
  });
  const error = new Error('Attachment metadata removal failed.');
  const deletion = vi.spyOn(store.assistantChat, 'removeAttachments').mockImplementationOnce(() => {
    throw error;
  });
  const next = { profileId, name: 'next.png', mime: 'image/png', bytes: 1 };
  await expect(cleaner.start(next)).rejects.toBe(error);
  expect(store.assistantChat.attachment(expired.id)).toEqual(expired);
  await expect(readFile(files.pathOf(expired))).rejects.toMatchObject({ code: 'ENOENT' });

  const conversation = new ConversationLog(store);
  expect(() =>
    conversation.person({
      chat: store.aiChats.chat(chatId),
      clientId: rig.clientId,
      author: 'Owner',
      text: '',
      files: [expired],
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
    }),
  ).toThrow('Attach the file again');
  expect(store.assistantChat.messageIdsOf(chatId)).toEqual([]);

  await expect(cleaner.start(next)).resolves.toHaveProperty('uploadId');
  expect(deletion).toHaveBeenCalledTimes(2);
  expect(() => store.assistantChat.attachment(expired.id)).toThrow();
});

describe('sending a file from the chat folder', () => {
  async function attach(path: string): ReturnType<AssistantFiles['fromOutFile']> {
    return files.fromOutFile(
      rig.owner.profileId,
      { path },
      { local: true, chatId, authorize: () => undefined },
    );
  }

  it('attaches a file by its folder path and names its type from the extension', async () => {
    const absolute = join(projects.root(chatId), 'workspace', 'shot.png');
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, PNG);

    const kept = await attach('workspace/shot.png');

    expect(kept.mime).toBe('image/png');
    expect(await readFile(files.pathOf(kept))).toStrictEqual(PNG);
  });

  it('attaches the same file by its absolute path', async () => {
    const absolute = join(projects.root(chatId), 'workspace', 'shot.png');
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, PNG);

    expect((await attach(absolute)).name).toBe('shot.png');
  });

  it('says a missing file is absent', async () => {
    await expect(attach('workspace/none.png')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('attaches a file from the chat temporary folder', async () => {
    const absolute = join(projects.root(chatId), 'temporary', 'phone-01.jpg');
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, PNG);

    expect((await attach('temporary/phone-01.jpg')).name).toBe('phone-01.jpg');
  });

  it('attaches a file the chat wrote to the hub temp folder', async () => {
    await mkdir(rig.opened.layout.tmp, { recursive: true });
    const absolute = join(rig.opened.layout.tmp, 'phone-01.jpg');
    await writeFile(absolute, PNG);
    const kept = await attach(absolute);
    expect(kept.name).toBe('phone-01.jpg');
    expect(await readFile(files.pathOf(kept))).toStrictEqual(PNG);
  });

  it('refuses a file in the system temp folder and names the hub temp folder', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'chat-shot-'));
    const absolute = join(folder, 'phone-01.jpg');
    await writeFile(absolute, PNG);
    try {
      const refusal = attach(absolute);
      await expect(refusal).rejects.toMatchObject({ code: 'forbidden' });
      await expect(refusal).rejects.toThrow(rig.opened.layout.tmp);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('refuses a path that leaves the chat folder through ..', async () => {
    await mkdir(join(projects.root(chatId), 'workspace'), { recursive: true });
    await expect(attach('workspace/../../../../../../etc/hostname')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('refuses a symlink in the chat folder that points outside the allowed places', async () => {
    const workspace = join(projects.root(chatId), 'workspace');
    await mkdir(workspace, { recursive: true });
    await symlink('/etc/hostname', join(workspace, 'link.txt'));

    const refusal = attach('workspace/link.txt');
    await expect(refusal).rejects.toMatchObject({ code: 'forbidden' });
    await expect(refusal).rejects.toThrow('startAssistantUpload');
  });

  it('refuses another chat’s folder', async () => {
    const other = rig.newChat({ kind: 'server' }).id;
    const absolute = join(projects.root(other), 'workspace', 'secret.png');
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, PNG);

    await expect(attach(absolute)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a caller that is not on the machine and names the upload operations', async () => {
    const refusal = files.fromOutFile(
      rig.owner.profileId,
      { path: 'workspace/shot.png' },
      { local: false, chatId, authorize: () => undefined },
    );
    await expect(refusal).rejects.toMatchObject({ code: 'forbidden' });
    await expect(refusal).rejects.toThrow('finishAssistantUpload');
  });

  it('names the folder to write to when the file is missing', async () => {
    await expect(attach('workspace/none.png')).rejects.toThrow('workspace');
  });
});
