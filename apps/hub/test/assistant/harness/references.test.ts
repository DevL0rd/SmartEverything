import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiChatRow, AiMessageReference, AiReference } from '@smarteverything/domain';
import { ProjectFilesService } from '../../../src/projects/service';
import type { Caller } from '../../../src/server/auth';
import { ReferenceService } from '../../../src/references/service';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig;
let projects: ProjectFilesService;
let references: ReferenceService;
let chat: AiChatRow;
let caller: Caller;

beforeEach(async () => {
  rig = await harnessRig();
  projects = new ProjectFilesService(rig.opened.directory);
  references = new ReferenceService(rig.opened.store, projects);
  chat = titled('Planning the garden');
  caller = { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId), chatId: chat.id };
});
afterEach(async () => {
  await rig.close();
});

function titled(title: string): AiChatRow {
  const base = rig.newChat({ kind: 'server' });
  return rig.opened.store.aiChats.create({
    profileId: base.profile_id,
    kind: 'chat',
    title,
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: base.engine,
  });
}

async function file(path: string, text = 'x'): Promise<void> {
  const absolute = join(projects.root(chat.id), path);
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, text);
}

async function find(query: string, extra: object = {}): ReturnType<ReferenceService['search']> {
  return references.search(caller, chat.id, {
    query,
    limit: 20,
    kinds: ['managed_path'],
    ...extra,
  });
}

function token(reference: AiReference, label: string): AiMessageReference {
  const text = `@${label}`;
  return { reference, label, token: text, start: 0, end: text.length };
}

describe('one reference search over the chat folder and chats', () => {
  it('finds files in nested folders by a loose name and ranks the closer name first', async () => {
    await file('workspace/site/styles/main.css');
    await file('workspace/site/readme.md');
    await file('workspace/notes/domain.txt');

    const result = await find('main');

    expect(result.items.map((item) => item.subtitle)).toStrictEqual([
      'workspace/site/styles/main.css',
      'workspace/notes/domain.txt',
    ]);
    expect(result.items[0]?.reference).toMatchObject({
      kind: 'managed_path',
      chat_id: chat.id,
      entry_kind: 'file',
    });
    expect(result.next_cursor).toBeNull();
  });

  it('lists only one level when it is given a directory to look in', async () => {
    await file('workspace/site/index.html');
    await file('workspace/site/deep/page.html');

    const result = await find('', { directory: 'workspace/site' });

    expect(result.items.map((item) => item.subtitle).sort()).toStrictEqual([
      'workspace/site/deep',
      'workspace/site/index.html',
    ]);
  });

  it('reports a result that was cut at the limit as incomplete', async () => {
    for (const name of ['a', 'b', 'c']) await file(`workspace/${name}.txt`);

    const result = await find('', { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.incomplete).toBe(true);
  });

  it('finds earlier chats by title next to files and says which sources are unavailable', async () => {
    titled('Garden budget');
    await file('workspace/garden.txt');

    const result = await references.search(caller, chat.id, { query: 'garden', limit: 20 });

    const kinds = result.items.map((item) => item.reference.kind);
    expect(kinds).toContain('managed_path');
    expect(kinds).toContain('chat');
    expect(result.sources.find((source) => source.kind === 'skill')).toMatchObject({
      state: 'unavailable',
    });
  });

  it('never offers a chat folder file of another chat', async () => {
    const other = titled('Other chat');
    const absolute = join(projects.root(other.id), 'workspace', 'private.txt');
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, 'x');

    expect((await find('private')).items).toStrictEqual([]);
  });
});

describe('references are resolved once when the message is sent', () => {
  it('accepts a file that exists in the chat folder even after it was edited', async () => {
    await file('workspace/a.txt', 'one');
    const [item] = (await find('a.txt')).items;
    if (item === undefined) throw new Error('The file was not found.');
    await file('workspace/a.txt', 'two, edited');

    const resolved = await references.resolve(caller, chat.id, '@a.txt', [
      token(item.reference, 'a.txt'),
    ]);

    expect(resolved).toHaveLength(1);
  });

  it('refuses a file that is gone', async () => {
    await file('workspace/a.txt');
    const [item] = (await find('a.txt')).items;
    if (item === undefined) throw new Error('The file was not found.');
    const gone = { ...item.reference, path: 'workspace/missing.txt' };

    await expect(
      references.resolve(caller, chat.id, '@a.txt', [token(gone, 'a.txt')]),
    ).rejects.toThrow('no longer available');
  });

  it('accepts a chat reference and refuses edited reference text', async () => {
    const reference: AiReference = { kind: 'chat', chat_id: chat.id };

    await expect(
      references.resolve(caller, chat.id, '@Planning', [token(reference, 'Planning')]),
    ).resolves.toHaveLength(1);
    await expect(
      references.resolve(caller, chat.id, '@Plannin', [token(reference, 'Planning')]),
    ).rejects.toThrow('edited');
  });

  it('says a skill reference cannot be used until a runtime supports it', async () => {
    const reference: AiReference = {
      kind: 'skill',
      name: 'x',
      provider: 'p',
      source: 's',
      identity: 'i',
      revision: 'r',
      resource_base: 'b',
    };

    await expect(
      references.resolve(caller, chat.id, '@x', [token(reference, 'x')]),
    ).rejects.toThrow('cannot consume structured references');
  });
});
