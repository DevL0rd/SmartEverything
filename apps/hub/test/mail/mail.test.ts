import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../../src/mail/service';
import { MailSettingsStore } from '../../src/mail/settings';
import { SecretStore } from '../../src/secrets/store';
import { startFakeSmtp, type FakeSmtp } from '../fakes/smtp/server';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let secrets: SecretStore;
let smtp: FakeSmtp;
let settings: MailSettingsStore;
let mail: MailService;

type Write = Parameters<MailSettingsStore['write']>[0];

const write = (overrides: Partial<Write> = {}): ReturnType<MailSettingsStore['write']> =>
  settings.write({
    host: '127.0.0.1',
    port: smtp.port,
    security: 'none',
    user: null,
    from_name: 'Home',
    from_address: 'home@example.com',
    password: { action: 'keep' },
    ...overrides,
  });

beforeEach(async () => {
  test = await testStore();
  secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 3));
  smtp = await startFakeSmtp();
  settings = new MailSettingsStore({ settingsKv: test.store.settingsKv, secrets });
  mail = new MailService({ settings, store: test.store, log: testLogger('mail') });
});

afterEach(async () => {
  await smtp.close();
  await test.close();
});

const message = (to = 'sam@example.com'): Parameters<MailService['send']>[0] => ({
  kind: 'invite',
  to,
  subject: 'Invitation: Dinner',
  text: 'plain body',
  html: '<p>html body</p>',
  calendar: null,
});

describe('mail settings', () => {
  it('is empty until the owner sets it up', () => {
    expect(settings.view()).toBeNull();
    expect(mail.configured).toBe(false);
  });

  it('keeps the password in the secret store and never reads it back', async () => {
    const view = await write({ user: 'home', password: { action: 'set', value: 'hunter2' } });
    expect(view).toMatchObject({ host: '127.0.0.1', user: 'home', password_set: true });
    expect(JSON.stringify(test.store.settingsKv.read('mail'))).not.toContain('hunter2');
    expect(settings.config()?.password).toBe('hunter2');
    expect(await write({ user: 'home' })).toMatchObject({ password_set: true });
    expect(await write({ user: 'home', password: { action: 'clear' } })).toMatchObject({
      password_set: false,
    });
    expect(settings.config()?.password).toBeNull();
  });

  it('drops the password when the user name is removed', async () => {
    await write({ user: 'home', password: { action: 'set', value: 'hunter2' } });
    expect(await write({ user: null })).toMatchObject({ user: null, password_set: false });
  });
});

describe('sending', () => {
  it('delivers through the server with plain, html and calendar parts', async () => {
    await write();
    const result = await mail.send({
      ...message(),
      calendar: {
        method: 'REQUEST',
        filename: 'invite.ics',
        content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nEND:VCALENDAR',
      },
    });
    expect(result).toEqual({ outcome: 'sent' });
    const [sent] = smtp.mails;
    expect(sent?.from).toBe('home@example.com');
    expect(sent?.to).toEqual(['sam@example.com']);
    expect(sent?.data).toContain('plain body');
    expect(sent?.data).toContain('<p>html body</p>');
    expect(sent?.data).toContain('method=REQUEST');
  });

  it('logs the delivery with a hashed address and no address in clear', async () => {
    await write();
    await mail.send(message('Sam@Example.com'));
    const [row] = mail.recent(5);
    expect(row).toMatchObject({ kind: 'invite', outcome: 'sent', detail: null });
    expect(row?.to_hash).toBe(createHash('sha256').update('sam@example.com').digest('hex'));
    expect(JSON.stringify(row)).not.toMatch(/sam@/i);
  });

  it('logs a refusal with its reason and without the address', async () => {
    await smtp.close();
    smtp = await startFakeSmtp({ refuseRecipient: () => true });
    await write();
    const result = await mail.send(message('nobody@example.com'));
    expect(result.outcome).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('nobody@');
    const [row] = mail.recent(5);
    expect(row?.outcome).toBe('failed');
    expect(row?.detail).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('nobody@');
  });

  it('reports an unreachable server as a failed send', async () => {
    await write({ port: 9 });
    const result = await mail.send(message());
    expect(result.outcome).toBe('failed');
    expect(mail.recent(5)[0]?.outcome).toBe('failed');
  });

  it('signs in with the stored user name and password', async () => {
    await smtp.close();
    smtp = await startFakeSmtp({ auth: { user: 'home', password: 'hunter2' } });
    await write({ user: 'home', password: { action: 'set', value: 'hunter2' } });
    expect(await mail.send(message())).toEqual({ outcome: 'sent' });
    expect(smtp.mails[0]?.user).toBe('home');
    await write({ user: 'home', password: { action: 'set', value: 'wrong' } });
    expect((await mail.send(message())).outcome).toBe('failed');
  });

  it('sends a test message and refuses one before the server is set up', async () => {
    await expect(mail.test('sam@example.com')).rejects.toMatchObject({ code: 'conflict' });
    await write();
    expect(await mail.test('sam@example.com')).toEqual({ outcome: 'sent' });
    expect(mail.recent(1)[0]?.kind).toBe('test');
  });

  it('answers a send with no server set up as failed without logging', async () => {
    expect((await mail.send(message())).outcome).toBe('failed');
    expect(mail.recent(5)).toEqual([]);
  });
});
