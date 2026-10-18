import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type { AiProjectRequest, AiProjectResult } from '@smarteverything/domain';
import { ProjectFilesService } from '../../../src/projects/service';
import type { ProjectAuthority } from '../../../src/projects/authority';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig;
let files: ProjectFilesService;
let authority: ProjectAuthority;
let writes: boolean[];
let refuseWrites: boolean;

beforeEach(async () => {
  rig = await harnessRig();
  files = new ProjectFilesService(rig.opened.directory);
  const chat = rig.newChat({ kind: 'server' });
  writes = [];
  refuseWrites = false;
  authority = {
    chatId: chat.id,
    profileId: rig.owner.profileId,
    validate: (write): void => {
      writes.push(write);
      if (write && refuseWrites)
        throw new ApiError(
          'forbidden',
          'Managed project is read-only under this session permission.',
        );
    },
  };
});
afterEach(async () => {
  await rig.close();
});

async function run(request: AiProjectRequest): Promise<AiProjectResult> {
  return files.execute(authority, request);
}

function write(
  path: string,
  content: string,
  version: string | null = null,
): Promise<AiProjectResult> {
  return run({
    operation: 'write',
    path,
    version,
    content,
    encoding: 'utf8',
  });
}

async function text(path: string): Promise<string> {
  const read = await run({ operation: 'read', path, offset: 0, length: 1000, encoding: 'utf8' });
  return read.content ?? '';
}

describe('chat-owned files', () => {
  it('writes a file and reads the same text back', async () => {
    await write('workspace/notes/todo.txt', 'milk\neggs\n');

    expect(await text('workspace/notes/todo.txt')).toBe('milk\neggs\n');
  });

  it('describes a file by its size and a version that changes with its content', async () => {
    const first = await write('workspace/a.txt', 'one');
    const second = await write('workspace/a.txt', 'three', first.file?.version ?? null);

    expect(first.file).toMatchObject({ path: 'workspace/a.txt', type: 'file', bytes: 3 });
    expect(second.file?.bytes).toBe(5);
    expect(second.file?.version).not.toBe(first.file?.version);
  });

  it('lists what a folder holds', async () => {
    await write('workspace/a.txt', 'a');
    await write('workspace/sub/b.txt', 'b');

    const listing = await run({ operation: 'list', path: 'workspace', limit: 50 });

    expect(listing.entries?.map((entry) => `${entry.path}:${entry.type}`).sort()).toStrictEqual([
      'workspace/a.txt:file',
      'workspace/sub:directory',
    ]);
  });

  it('finds text inside files', async () => {
    await write('workspace/a.txt', 'alpha\nneedle here\n');
    await write('workspace/b.txt', 'nothing');

    const found = await run({ operation: 'search', path: 'workspace', text: 'needle', limit: 10 });

    expect(found.hits).toStrictEqual([{ path: 'workspace/a.txt', line: 2, text: 'needle here' }]);
  });

  it('edits a file in place and reports what changed', async () => {
    const created = await write('workspace/a.txt', 'hello world');

    const edited = await run({
      operation: 'edit',
      path: 'workspace/a.txt',
      version: created.file?.version ?? '',
      old_string: 'world',
      new_string: 'there',
      replace_all: false,
    });

    expect(await text('workspace/a.txt')).toBe('hello there');
    expect(edited.diff).toMatchObject({ before: 'hello world', after: 'hello there' });
  });

  it('refuses to overwrite a file that changed since it was read', async () => {
    const created = await write('workspace/a.txt', 'v1');
    await write('workspace/a.txt', 'v2', created.file?.version ?? null);

    await expect(write('workspace/a.txt', 'v3', created.file?.version ?? null)).rejects.toThrow(
      /changed since/u,
    );
    expect(await text('workspace/a.txt')).toBe('v2');
  });

  it('refuses to create a file over one that already exists', async () => {
    await write('workspace/a.txt', 'v1');

    await expect(write('workspace/a.txt', 'v2')).rejects.toThrow(/already exists/u);
  });

  it('creates folders, moves files and removes them', async () => {
    const created = await write('workspace/a.txt', 'a');
    await run({ operation: 'mkdir', path: 'workspace/archive' });

    const moved = await run({
      operation: 'move',
      path: 'workspace/a.txt',
      version: created.file?.version ?? null,
      destination: 'workspace/archive/a.txt',
    });
    await run({
      operation: 'remove',
      path: 'workspace/archive',
      version: (await run({ operation: 'stat', path: 'workspace/archive' })).file?.version ?? null,
      recursive: true,
    });

    expect(moved.file?.path).toBe('workspace/archive/a.txt');
    expect((await run({ operation: 'stat', path: 'workspace/archive' })).file).toBeNull();
  });

  it('keeps a chat folder as a plain directory under the data folder', async () => {
    await write('workspace/notes.txt', 'plain');

    const path = join(files.root(authority.chatId), 'workspace', 'notes.txt');
    expect(await readFile(path, 'utf8')).toBe('plain');
    expect((await stat(files.root(authority.chatId))).isDirectory()).toBe(true);
  });

  it('stores binary content sent as base64 and reads it back in ranges', async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252]);

    await run({
      operation: 'write',
      path: 'workspace/blob.bin',
      version: null,
      content: bytes.toString('base64'),
      encoding: 'base64',
    });

    const read = await run({
      operation: 'read',
      path: 'workspace/blob.bin',
      offset: 2,
      length: 3,
      encoding: 'base64',
    });
    expect(read.content).toBe(bytes.subarray(2, 5).toString('base64'));
    expect(read.next_offset).toBe(5);
  });

  it('removes the whole chat folder with the chat', async () => {
    await write('workspace/a.txt', 'a');

    await files.removeRoots([authority.chatId]);

    await expect(stat(files.root(authority.chatId))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps each chat to its own folder', async () => {
    await write('workspace/mine.txt', 'mine');
    const other = rig.newChat({ kind: 'server' });
    const theirs: ProjectAuthority = { ...authority, chatId: other.id };

    const stat = await files.execute(theirs, { operation: 'stat', path: 'workspace/mine.txt' });

    expect(stat.file).toBeNull();
  });

  it('refuses paths that climb out of the chat folder', async () => {
    await expect(run({ operation: 'stat', path: 'workspace/../x' })).rejects.toThrow();
    await expect(run({ operation: 'stat', path: 'elsewhere/x' })).rejects.toThrow();
  });

  it('refuses to replace or remove a top-level area', async () => {
    await expect(
      run({
        operation: 'remove',
        path: 'workspace',
        version: null,
        recursive: true,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('asks the session authority before every change and before every read', async () => {
    await write('workspace/a.txt', 'a');
    await text('workspace/a.txt');

    expect(writes).toContain(true);
    expect(writes).toContain(false);
  });

  it('writes nothing when the session is read-only', async () => {
    refuseWrites = true;

    await expect(write('workspace/a.txt', 'a')).rejects.toMatchObject({ code: 'forbidden' });

    refuseWrites = false;
    expect((await run({ operation: 'stat', path: 'workspace/a.txt' })).file).toBeNull();
  });
});
