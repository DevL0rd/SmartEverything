import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});
afterEach(async () => {
  await rig.close();
});

it('gives a server chat the folder of its profile in the layout and creates its areas when it opens', async () => {
  const chat = rig.newChat({ kind: 'server' });

  const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.readyFolder(open);
  const folder = rig.service.chatFolder(chat);

  expect(folder).toBe(rig.opened.layout.chat(chat.profile_id, chat.id).project);
  expect(open.cwd).toBe(folder);
  expect((await stat(join(folder, 'workspace'))).isDirectory()).toBe(true);
  expect((await stat(join(folder, 'temporary'))).isDirectory()).toBe(true);
});
