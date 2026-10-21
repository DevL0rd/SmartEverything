import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantFiles } from '../../src/assistant/files';
import { ProjectFilesService } from '../../src/projects/service';
import { harnessRig, type Rig } from './harness/support/rig';

let rig: Rig;
let files: AssistantFiles;
let projects: ProjectFilesService;
let chatId: string;

beforeEach(async () => {
  rig = await harnessRig();
  projects = new ProjectFilesService(rig.opened.directory);
  files = new AssistantFiles({
    dataDirectory: rig.opened.directory,
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

  it('removes an attachment that an earlier version stored inside the chat folder', async () => {
    const legacy = join(projects.root(chatId), 'temporary', 'files', 'abc');
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, 'old.png'), PNG);
    const stored = rig.opened.store.assistantChat.addAttachment({
      id: randomUUID(),
      profile_id: rig.owner.profileId,
      name: 'old.png',
      mime: 'image/png',
      bytes: PNG.length,
      width: 1,
      height: 1,
      storage_path: join('projects', chatId, 'temporary', 'files', 'abc', 'old.png'),
      sha256: 'a'.repeat(64),
    });

    await files.remove([stored]);

    await expect(stat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses output that is empty', async () => {
    await expect(keep('empty.png', Buffer.alloc(0))).rejects.toThrow('attachment bound');
  });
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

  it('attaches a file the chat wrote to the system temp folder', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'chat-shot-'));
    const absolute = join(folder, 'phone-01.jpg');
    await writeFile(absolute, PNG);
    try {
      const kept = await attach(absolute);
      expect(kept.name).toBe('phone-01.jpg');
      expect(await readFile(files.pathOf(kept))).toStrictEqual(PNG);
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

  it('refuses another chat’s folder even though it sits under the temp folder', async () => {
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
