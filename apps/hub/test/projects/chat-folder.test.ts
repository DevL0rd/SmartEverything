import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { layoutFromNames, V1_NAMES, type HubLayout } from '../../src/data-layout';
import { chatFolder } from '../../src/projects/paths';
import { ProjectFilesService } from '../../src/projects/service';
import { TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let layout: HubLayout;
let projects: ProjectFilesService;

beforeEach(async () => {
  opened = await testStore();
  layout = layoutFromNames(opened.directory, V1_NAMES, {});
  projects = new ProjectFilesService(layout, opened.store.aiChats);
});
afterEach(async () => {
  await opened.close();
});

function chatOf(profileId: string): ReturnType<TestStore['store']['aiChats']['create']> {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Folder',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
}

describe('a chat folder lives under its owner in the layout', () => {
  it('takes the profile of the chat row', () => {
    const first = chatOf(opened.store.profiles.first().id);
    const second = chatOf(opened.store.profiles.create({ name: 'Sam' }).id);

    expect(chatFolder(layout, first)).toBe(layout.chat(first.profile_id, first.id).project);
    expect(chatFolder(layout, second)).toBe(
      join(layout.person(second.profile_id).root, 'chats', second.id, 'project'),
    );
    expect(chatFolder(layout, first)).not.toBe(chatFolder(layout, second));
  });

  it('is the root of the project service and is created with its areas', async () => {
    const chat = chatOf(opened.store.profiles.create({ name: 'Sam' }).id);

    const root = projects.ensure(chat.id);

    expect(root).toBe(layout.chat(chat.profile_id, chat.id).project);
    expect((await stat(join(root, 'workspace'))).isDirectory()).toBe(true);
    expect((await stat(join(root, 'temporary'))).isDirectory()).toBe(true);
  });

  it('removes the folder of the chat and nothing of its owner’s other chats', async () => {
    const profileId = opened.store.profiles.first().id;
    const gone = chatOf(profileId);
    const kept = chatOf(profileId);
    for (const chat of [gone, kept]) {
      await mkdir(join(projects.ensure(chat.id), 'workspace'), { recursive: true });
      await writeFile(join(projects.root(chat.id), 'workspace', 'note.txt'), 'x');
    }

    await projects.removeRoots([gone.id]);

    await expect(stat(projects.root(gone.id))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await stat(join(projects.root(kept.id), 'workspace', 'note.txt'))).isFile()).toBe(true);
  });
});
