import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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
});
