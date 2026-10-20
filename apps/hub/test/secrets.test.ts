import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEY_FILE_NAME, SecretKeyError, loadSecretKey } from '../src/secrets/key';
import { SecretStore, SecretStoreError } from '../src/secrets/store';
import { SECRETS_FILE_NAME, openSecretStore } from '../src/secrets/open';
import { captureLogs, testLogger } from './support/logs';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-secrets-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('secret key', () => {
  it('creates a 32 byte key file readable only by its owner and reuses it', async () => {
    const data = join(directory, 'data');
    const first = await loadSecretKey(data, testLogger());
    const second = await loadSecretKey(data, testLogger());
    expect(first.length).toBe(32);
    expect(second.equals(first)).toBe(true);
    expect((await stat(join(data, KEY_FILE_NAME))).mode & 0o777).toBe(0o600);
  });

  it('restricts a key file others can read to its owner and says so once, as after restoring a backup', async () => {
    const created = await loadSecretKey(directory, testLogger());
    const path = join(directory, KEY_FILE_NAME);
    await chmod(path, 0o644);
    const logs = captureLogs();
    const reopened = await loadSecretKey(directory, testLogger());
    expect(reopened.equals(created)).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(logs.events()).toStrictEqual(['secret_key.mode_fixed']);
    await loadSecretKey(directory, testLogger());
    expect(logs.events()).toStrictEqual(['secret_key.mode_fixed']);
  });

  it('refuses a key file of the wrong length', async () => {
    await writeFile(join(directory, KEY_FILE_NAME), Buffer.alloc(16), { mode: 0o600 });
    await expect(loadSecretKey(directory, testLogger())).rejects.toThrow(
      new SecretKeyError(join(directory, KEY_FILE_NAME), 'expected 32 bytes, received 16'),
    );
  });

  it('opens the store in the data directory and keeps it private', async () => {
    const store = await openSecretStore(directory, testLogger());
    expect(store.read().accounts).toStrictEqual({});
    await store.update((secrets) => ({ ...secrets, geminiKey: 'gemini' }));
    const reopened = await openSecretStore(directory, testLogger());
    expect(reopened.read().geminiKey).toBe('gemini');
    expect((await stat(join(directory, SECRETS_FILE_NAME))).mode & 0o777).toBe(0o600);
  });
});

describe('secret store', () => {
  const key = Buffer.alloc(32, 1);
  const pushServiceAccount = {
    type: 'service_account',
    project_id: 'home-push',
    client_email: 'push@home-push.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    token_uri: 'https://oauth2.googleapis.com/token',
  } as const;

  it('starts empty, persists encrypted and reopens with the same key', async () => {
    const path = join(directory, 'secrets.json.enc');
    const store = await SecretStore.open(path, key);
    expect(store.read()).toStrictEqual({
      accounts: {},
      pushServiceAccount: null,
      smartthingsApp: null,
      deviceKeys: {},
      geminiKey: null,
      openrouterKey: null,
      plugins: {},
    });
    await store.update((secrets) => ({ ...secrets, pushServiceAccount }));
    await store.saveAccount('tuya', { label: 'Tuya', secrets: { refreshToken: 'very-secret' } });
    const text = await readFile(path, 'utf8');
    expect(text).not.toContain('very-secret');
    expect(text).not.toContain('home-push');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const reopened = await SecretStore.open(path, key);
    expect(reopened.read().pushServiceAccount).toStrictEqual(pushServiceAccount);
    expect(reopened.read().accounts.tuya).toStrictEqual({
      label: 'Tuya',
      secrets: { refreshToken: 'very-secret' },
    });
  });

  it('removes one account and keeps the others', async () => {
    const store = await SecretStore.open(join(directory, 's'), key);
    await store.saveAccount('tuya', { label: 'T', secrets: {} });
    await store.saveAccount('xiaomi', { label: 'X', secrets: {} });
    await store.removeAccount('tuya');
    expect(Object.keys(store.read().accounts)).toStrictEqual(['xiaomi']);
  });

  it('refuses to open with another key, and refuses a file that is not a sealed store', async () => {
    const path = join(directory, 'secrets.json.enc');
    const store = await SecretStore.open(path, key);
    await store.update((secrets) => ({ ...secrets, pushServiceAccount }));
    await expect(SecretStore.open(path, Buffer.alloc(32, 2))).rejects.toThrow(
      new SecretStoreError(path, 'the key does not open it or its contents are invalid').message,
    );
    await writeFile(path, '{"version":2}');
    await expect(SecretStore.open(path, key)).rejects.toThrow(
      'the file is not a sealed secret store',
    );
    await writeFile(path, 'not json');
    await expect(SecretStore.open(path, key)).rejects.toThrow('the file is not JSON');
  });

  it('refuses to store something that is not a valid secret store', async () => {
    const store = await SecretStore.open(join(directory, 's'), key);
    await expect(
      store.update((secrets) => ({
        ...secrets,
        pushServiceAccount: { ...pushServiceAccount, client_email: 'nope' },
      })),
    ).rejects.toThrow();
    expect(store.read().pushServiceAccount).toBeNull();
  });

  it('keeps writing after one write fails', async () => {
    const path = join(directory, 'secrets');
    const broken = await SecretStore.open(path, key);
    await chmod(directory, 0o500);
    await expect(broken.saveAccount('tuya', { label: 'T', secrets: {} })).rejects.toThrow(/EACCES/);
    await chmod(directory, 0o700);
    await broken.saveAccount('xiaomi', { label: 'X', secrets: {} });
    const reopened = await SecretStore.open(path, key);
    expect(Object.keys(reopened.read().accounts).sort()).toStrictEqual(['tuya', 'xiaomi']);
  });
});
