import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { phoneFileOf } from '../../src/phones/phone-file';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let dana: TestPerson;
let owner: TestPerson;
let file: string;

const LINKS = {
  assistantAttachment: (id: string): { readonly url: string; readonly expiresAt: string } => ({
    url: `/media/assistant/${id}?signed`,
    expiresAt: '2026-10-18T10:10:00.000Z',
  }),
};

function caller(person: TestPerson): Caller {
  return { kind: 'client', client: person.client, profileId: person.profileId };
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  file = randomUUID();
  test.store.assistantChat.addAttachment({
    id: file,
    profile_id: dana.profileId,
    name: 'ticket.pdf',
    mime: 'application/pdf',
    bytes: 10,
    width: null,
    height: null,
    storage_path: 'ticket.pdf',
    sha256: 'a'.repeat(64),
  });
});

afterEach(async () => {
  await test.close();
});

describe('a file sent to a phone', () => {
  it('carries its name, type and a signed link for the person who owns it', () => {
    expect(phoneFileOf({ store: test.store, links: LINKS }, caller(dana), file)).toEqual({
      type: 'receive_file',
      fileId: file,
      name: 'ticket.pdf',
      mime: 'application/pdf',
      url: `/media/assistant/${file}?signed`,
    });
  });

  it('is open to an owner and refused to another member', () => {
    const source = { store: test.store, links: LINKS };
    expect(phoneFileOf(source, caller(owner), file).name).toBe('ticket.pdf');
    const sam = addPerson(test, 'Sam', 'member');
    expect(() => phoneFileOf(source, caller(sam), file)).toThrow(/someone else/);
  });

  it('names the file that does not exist', () => {
    expect(() =>
      phoneFileOf({ store: test.store, links: LINKS }, caller(owner), randomUUID()),
    ).toThrow(/assistant attachment/);
  });
});
