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
  it('keeps reading a project after the phone switched to another person', () => {
    const { store } = rig.opened;
    const chat = rig.newChat({ kind: 'server' });
    const authority = projectCallerAuthority(
      store,
      { kind: 'client', client: store.clients.byId(rig.clientId), chatId: chat.id },
      chat.id,
    );
    store.clients.useProfile(rig.clientId, store.profiles.create({ name: 'Guest' }).id);
    expect(() => {
      authority.validate(false);
    }).not.toThrow();
  });

  it('refuses a project of a chat that belongs to another profile', () => {
    const { store } = rig.opened;
    const chat = rig.newChat({ kind: 'server' });
    const guest = store.profiles.create({ name: 'Guest' });
    expect(() =>
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
    ).toThrow('different profile');
  });
});
