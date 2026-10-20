import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { FakeIppPrinter } from './fake-ipp-printer';
import { OWNER, ANNA, newServiceRig, type ServiceRig } from './service-rig';

let printer: FakeIppPrinter;
let setup: ServiceRig;

beforeEach(async () => {
  printer = new FakeIppPrinter({ secure: true });
  await printer.start();
  setup = newServiceRig();
});

afterEach(async () => {
  for (const session of setup.registry.list()) session.stop();
  await printer.stop();
});

function firstSession(): PrinterSession {
  const [session] = setup.registry.list();
  if (session === undefined) throw new Error('The printer was not added.');
  return session;
}

async function trusted(): Promise<string> {
  const first = await setup.service.act({ action: 'add', uri: printer.url }, OWNER);
  expect(first['status']).toBe('confirm_certificate');
  const fingerprint = String(first['fingerprint']);
  const second = await setup.service.act({ action: 'add', uri: printer.url, fingerprint }, OWNER);
  expect(second['status']).toBe('added');
  return fingerprint;
}

describe('a printer that talks ipps with its own certificate', () => {
  it('shows the certificate first and only stores the printer after the owner confirms it', async () => {
    const first = await setup.service.act({ action: 'add', uri: printer.url }, OWNER);
    expect(first).toMatchObject({ status: 'confirm_certificate', subject: 'fake-printer' });
    expect(String(first['fingerprint'])).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u);
    expect(setup.registry.list()).toHaveLength(0);
    await expect(
      setup.service.act({ action: 'add', uri: printer.url, fingerprint: 'AA:BB' }, OWNER),
    ).resolves.toMatchObject({ status: 'confirm_certificate' });
    expect(setup.registry.list()).toHaveLength(0);
  });

  it('pins the certificate and keeps reading with it', async () => {
    const fingerprint = await trusted();
    const session = firstSession();
    expect(session.record.pin).toBe(fingerprint);
    expect(session.record.uri.startsWith('ipps://')).toBe(true);
    await session.poll();
    expect(setup.rig.devices.at(-1)?.details['security']).toBe('ipps');
    expect(setup.rig.devices.at(-1)?.details['pinned']).toBe(true);
  });

  it('drops the connection and goes offline when the certificate changes, until the owner approves the new one', async () => {
    await trusted();
    const session = firstSession();
    await session.poll();
    await printer.stop();
    printer = new FakeIppPrinter({ secure: true, port: printer.port });
    await printer.start();
    await session.poll();
    expect(setup.rig.devices.at(-1)?.online).toBe(false);
    expect(setup.rig.events.find((event) => event.kind === 'pairing_problem')).toMatchObject({
      data: { reason: 'certificate_changed' },
    });
    const change = session.record.certificateChange;
    if (change === null) throw new Error('The certificate change was not recorded.');
    expect(change.presented).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u);
    expect(change.previous).not.toBe(change.presented);
    const sent = printer.seen.length;
    expect(sent).toBe(0);
    await expect(
      setup.service.act({ action: 'trust_certificate', fingerprint: change.presented }, ANNA),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
    await expect(
      setup.service.act({ action: 'trust_certificate', fingerprint: 'AA:BB' }, OWNER),
    ).rejects.toMatchObject({ reason: 'certificate_changed' });
    setup.rig.time.now = new Date(setup.rig.time.now.getTime() + 31_000);
    await setup.service.act({ action: 'trust_certificate', fingerprint: change.presented }, OWNER);
    expect(session.record.pin).toBe(change.presented);
    expect(session.record.certificateChange).toBeNull();
    await vi.waitFor(() => {
      expect(setup.rig.devices.at(-1)?.online).toBe(true);
    });
  });

  it('refuses to trust a certificate when the device behind it is another printer', async () => {
    await trusted();
    const session = firstSession();
    await printer.stop();
    printer = new FakeIppPrinter({ secure: true, port: printer.port });
    printer.state.uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await printer.start();
    await session.poll();
    const presented = session.record.certificateChange?.presented ?? '';
    await expect(
      setup.service.act({ action: 'trust_certificate', fingerprint: presented }, OWNER),
    ).rejects.toMatchObject({ reason: 'certificate_changed' });
    expect(session.record.certificateChange?.presented).toBe(presented);
  });
});
