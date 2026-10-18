import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreviewDiagnosticAuthority } from '../../../src/preview/diagnostic-authority';
import { EmbeddedBrowserAuthority } from '../../../src/preview/embedded-browser-authority';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});

afterEach(async () => {
  await rig.close();
});

function unavailable(): never {
  throw new Error('This test publishes nothing.');
}

const SOURCES = { require: unavailable };

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
    const authority = new EmbeddedBrowserAuthority(rig.opened.store, SOURCES);
    switchPhoneToAnotherPerson();
    expect(() => {
      authority.validate(browserScope(chat.id));
    }).not.toThrow();
  });

  it('refuses a viewer scope that names a chat that no longer exists', () => {
    const authority = new EmbeddedBrowserAuthority(rig.opened.store, SOURCES);
    expect(() => {
      authority.validate(browserScope('0d000000-0000-4000-8000-0000000000aa'));
    }).toThrow();
  });

  it.each(['https://example.com/', 'http://example.com/news'])(
    'opens the public website %s',
    (url) => {
      const chat = rig.newChat({ kind: 'server' });
      const authority = new EmbeddedBrowserAuthority(rig.opened.store, SOURCES);
      expect(() => {
        authority.action(browserScope(chat.id), {
          kind: 'open',
          source: { kind: 'public', url },
        });
      }).not.toThrow();
    },
  );

  it.each(['http://192.168.1.1/', 'http://localhost:8080/', 'https://user:pass@example.com/'])(
    'refuses the local or credentialed address %s',
    (url) => {
      const chat = rig.newChat({ kind: 'server' });
      const authority = new EmbeddedBrowserAuthority(rig.opened.store, SOURCES);
      expect(() => {
        authority.action(browserScope(chat.id), {
          kind: 'open',
          source: { kind: 'public', url },
        });
      }).toThrow('public websites');
    },
  );
});

describe('preview diagnostics follow the chat, not the phone profile', () => {
  it('keeps reading the chat after the phone switched to another person', () => {
    const chat = rig.newChat({ kind: 'server' });
    const authority = new PreviewDiagnosticAuthority(rig.opened.store, SOURCES);
    switchPhoneToAnotherPerson();
    const browserId = `public:${randomUUID()}`;
    expect(() => {
      authority.validate({
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat.id,
        viewerId: randomUUID(),
        browserId,
        documentId: browserId,
        revision: null,
        epoch: 'epoch',
      });
    }).not.toThrow();
  });
});
