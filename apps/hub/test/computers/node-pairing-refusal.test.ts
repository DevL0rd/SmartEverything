import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let ownerId = '';
let access: ComputerNodeAccess;

beforeEach(async () => {
  opened = await testStore();
  ownerId = opened.store.clients.create(
    { name: 'Owner', platform: 'web', role: 'owner', tokenHash: 'c'.repeat(64) },
    true,
  ).id;
  access = new ComputerNodeAccess(opened.store, () => new Date('2026-11-07T09:00:00.000Z'));
});

afterEach(async () => {
  await opened.close();
});

describe('issuing a pairing code for a computer', () => {
  it.each([
    'http://127.0.0.1:7880',
    'https://127.0.0.1:7880',
    'http://localhost:7880',
    'https://[::1]:7880',
  ])('refuses the loopback address %s', (url) => {
    expect(() => access.pair(url, ownerId)).toThrow('over loopback');
  });

  it('refuses plain http to another machine', () => {
    expect(() => access.pair('http://192.168.1.4:7880', ownerId)).toThrow('requires HTTPS');
  });

  it('issues a code for an https address', () => {
    expect(access.pair('https://home.example.com', ownerId).url).toBe('https://home.example.com');
  });
});
