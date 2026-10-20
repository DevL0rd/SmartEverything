import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessService } from '../../src/server/access';
import { accessServiceFor } from '../support/access-service';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T10:00:00.000Z');

let opened: TestStore;
let access: AccessService;
let ownerClient: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore((): Date => NOW);
  ownerClient = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  ).id;
  access = accessServiceFor(opened, (): Date => NOW);
});

afterEach(async () => {
  await opened.close();
});

function claimed(
  platform: 'android' | 'web',
  kind?: 'phone' | 'tablet',
): ReturnType<AccessService['claim']> {
  const { code } = access.startPairing('owner', ownerClient, undefined);
  return access.claim({ code, name: 'Device', platform, kind, remote: '192.168.1.20' });
}

describe('client kind', () => {
  it('keeps the kind an Android client reports', () => {
    expect(claimed('android', 'tablet').client.kind).toBe('tablet');
    expect(claimed('android', 'phone').client.kind).toBe('phone');
  });

  it('treats an Android client that reports no kind as a phone and a web client as a browser', () => {
    expect(claimed('android').client.kind).toBe('phone');
    expect(claimed('web').client.kind).toBe('browser');
  });

  it('refuses a web client that claims to be a tablet and leaves the code unused', () => {
    const { code } = access.startPairing('owner', ownerClient, undefined);
    const claim = { code, name: 'Device', platform: 'web', kind: 'tablet', remote: 'x' } as const;
    expect(() => access.claim(claim)).toThrow(/Android/);
    expect(access.claim({ ...claim, platform: 'android' }).client.kind).toBe('tablet');
  });

  it('gives the desktop owner the computer kind', () => {
    expect(opened.store.clients.byId(ownerClient).kind).toBe('computer');
  });
});
