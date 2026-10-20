import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_DEVICE_SETUP } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSetup } from '../../src/local/setup';
import { SecretStore } from '../../src/secrets/store';
import { testDatabase, type TestDatabase } from '../support/database';

let directory = '';
let database: TestDatabase | null = null;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-scale-setup-'));
});

afterEach(async () => {
  await database?.close();
  database = null;
  await rm(directory, { recursive: true, force: true });
});

describe('manual scale setup', () => {
  it('takes the Bluetooth key as plain text over the owner endpoint and keeps it lower-case', async () => {
    database = await testDatabase();
    const setup = LOCAL_DEVICE_SETUP.parse({
      driver: 'xiaomi_scale',
      source: 'manual',
      name: 'Bathroom scale',
      address: 'd0:7b:6f:a6:ab:45',
      bindKey: ' 00112233445566778899AABBCCDDEEFF ',
    });
    const resolved = await resolveSetup(setup, {
      store: database.store,
      secrets: await SecretStore.open(join(directory, 'secrets'), Buffer.alloc(32, 3)),
      identities: () => Promise.reject(new Error('no account is involved')),
      wearables: () => Promise.reject(new Error('no account is involved')),
      now: () => new Date('2026-10-18T10:00:00.000Z'),
    });
    expect(resolved.key).toBe('00112233445566778899aabbccddeeff');
    expect(resolved.entry).toMatchObject({
      externalId: 'xiaomi_scale:D0:7B:6F:A6:AB:45',
      driver: 'xiaomi_scale',
      name: 'Bathroom scale',
    });
    expect(resolved.replaces).toBeNull();
  });

  it('refuses a key that is not 32 hexadecimal characters, and a sealed envelope', () => {
    const base = {
      driver: 'xiaomi_scale',
      source: 'manual',
      name: 'Scale',
      address: 'D0:7B:6F:A6:AB:45',
    };
    expect(LOCAL_DEVICE_SETUP.safeParse({ ...base, bindKey: 'abc' }).success).toBe(false);
    expect(
      LOCAL_DEVICE_SETUP.safeParse({
        ...base,
        bindKey: { version: 1, ephemeral: 'a', nonce: 'b', ciphertext: 'c' },
      }).success,
    ).toBe(false);
  });
});
