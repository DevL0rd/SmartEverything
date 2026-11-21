import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectCallerAuthority } from '../../../src/projects/authority';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});

afterEach(async () => {
  await rig.close();
});

describe('managed project access follows the chat, not the phone profile', () => {
  it('keeps reading a project after the phone switched to another person', async () => {
    const { store } = rig.opened;
    const chat = rig.newChat({ kind: 'server' });
    const authority = await projectCallerAuthority(
      store,
      { kind: 'client', client: store.clients.byId(rig.clientId), chatId: chat.id },
      chat.id,
    );
    store.clients.useProfile(rig.clientId, store.profiles.create({ name: 'Guest' }).id);
    await expect(authority.validate(false)).resolves.toBeUndefined();
  });

  it('refuses a project of a chat that belongs to another profile', async () => {
    const { store } = rig.opened;
    const chat = rig.newChat({ kind: 'server' });
    const guest = store.profiles.create({ name: 'Guest' });
    await expect(
      projectCallerAuthority(
        store,
        {
          kind: 'client',
          client: store.clients.byId(rig.clientId),
          profileId: guest.id,
          chatId: chat.id,
        },
        chat.id,
      ),
    ).rejects.toThrow('different profile');
  });
});
