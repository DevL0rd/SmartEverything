import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmbeddedBrowserAuthority } from '../../../src/browser/embedded-browser-authority';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});

afterEach(async () => {
  await rig.close();
});

function browserScope(chatId: string): {
  readonly viewerId: string;
  readonly generation: string;
  readonly clientId: string;
  readonly profileId: string;
  readonly chatId: string;
} {
  return {
    viewerId: randomUUID(),
    generation: randomUUID(),
    clientId: rig.clientId,
    profileId: rig.owner.profileId,
    chatId,
  };
}

function switchPhoneToAnotherPerson(): void {
  const { store } = rig.opened;
  store.clients.useProfile(rig.clientId, store.profiles.create({ name: 'Guest' }).id);
}

describe('the embedded browser follows the chat, not the phone profile', () => {
  it('keeps controlling the chat after the phone switched to another person', () => {
    const chat = rig.newChat({ kind: 'server' });
    const authority = new EmbeddedBrowserAuthority(rig.opened.store);
    switchPhoneToAnotherPerson();
    expect(() => {
      authority.validate(browserScope(chat.id));
    }).not.toThrow();
  });

  it('refuses a viewer scope that names a chat that no longer exists', () => {
    const authority = new EmbeddedBrowserAuthority(rig.opened.store);
    expect(() => {
      authority.validate(browserScope('0d000000-0000-4000-8000-0000000000aa'));
    }).toThrow();
  });

  it.each(['https://example.com/', 'http://example.com/news', 'http://192.168.1.20:5173/'])(
    'opens the address %s the device can reach',
    (url) => {
      const chat = rig.newChat({ kind: 'server' });
      const authority = new EmbeddedBrowserAuthority(rig.opened.store);
      expect(() => {
        authority.action(browserScope(chat.id), {
          kind: 'open',
          source: { kind: 'public', url },
        });
      }).not.toThrow();
    },
  );

  it.each(['https://user:pass@example.com/', 'ftp://example.com/', 'javascript:alert(1)'])(
    'refuses the credentialed or non-web address %s',
    (url) => {
      const chat = rig.newChat({ kind: 'server' });
      const authority = new EmbeddedBrowserAuthority(rig.opened.store);
      expect(() => {
        authority.action(browserScope(chat.id), {
          kind: 'open',
          source: { kind: 'public', url },
        });
      }).toThrow('http or https addresses');
    },
  );
});
