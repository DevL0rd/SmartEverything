import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PRINTER_OPTIONS_VIEW,
  PRINTER_OVERVIEW,
  PRINTER_QUEUE_VIEW,
  PRINTER_SETTINGS_VIEW,
  PRINTER_STATS_VIEW,
  PRINTER_SUPPLIES_VIEW,
  PRINTER_TRAYS_VIEW,
  PRINTER_JOB,
  PRINTER_JOBS_VIEW,
  PrinterError,
} from '@smarteverything/domain';
import { FakeIppPrinter } from './fake-ipp-printer';
import { ANNA, BEN, JPEG, OWNER, PDF, PNG, newServiceRig, type ServiceRig } from './service-rig';

let printer: FakeIppPrinter;
let setup: ServiceRig;

beforeEach(async () => {
  printer = new FakeIppPrinter();
  await printer.start();
  setup = newServiceRig();
});

afterEach(async () => {
  for (const session of setup.registry.list()) session.stop();
  await printer.stop();
});

async function added(): Promise<string> {
  const reply = await setup.service.act({ action: 'add', uri: printer.url, name: 'Hall' }, OWNER);
  expect(reply['status']).toBe('added');
  const [session] = setup.registry.list();
  await session?.poll();
  return printer.state.uuid;
}

describe('adding a printer', () => {
  it('stores nothing until the test read works, then starts the printer', async () => {
    await expect(
      setup.service.act({ action: 'add', uri: 'ipp://127.0.0.1:1/ipp/print' }, OWNER),
    ).rejects.toMatchObject({ reason: 'unreachable' });
    expect(setup.registry.list()).toHaveLength(0);
    expect(setup.rig.collections.get('printers')?.list() ?? []).toHaveLength(0);
    const uuid = await added();
    expect(setup.registry.get(uuid)?.name).toBe('Hall');
    expect(setup.rig.collections.get('printers')?.list()).toHaveLength(1);
    expect(setup.rig.devices.at(-1)?.name).toBe('Hall');
  });

  it('merges a printer that is added twice', async () => {
    await added();
    const again = await setup.service.act({ action: 'add', uri: printer.url }, OWNER);
    expect(again['status']).toBe('already_added');
    expect(setup.registry.list()).toHaveLength(1);
  });

  it('finds the print path when the given one is wrong', async () => {
    const reply = await setup.service.act(
      { action: 'add', uri: `ipp://127.0.0.1:${String(printer.port)}/wrong/path` },
      OWNER,
    );
    expect(reply['status']).toBe('added');
    expect(setup.registry.list()[0]?.record.uri).toContain('/ipp/print');
  });

  it('names a server that is not a printer', async () => {
    await printer.stop();
    const { createServer } = await import('node:http');
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await expect(
      setup.service.act({ action: 'add', uri: `ipp://127.0.0.1:${String(port)}/ipp/print` }, OWNER),
    ).rejects.toMatchObject({ reason: 'not_ipp' });
    server.close();
    printer = new FakeIppPrinter();
    await printer.start();
  });

  it('asks for a password and then signs in', async () => {
    await printer.stop();
    printer = new FakeIppPrinter({ auth: { user: 'admin', password: 'secret' } });
    await printer.start();
    await expect(
      setup.service.act({ action: 'add', uri: printer.url }, OWNER),
    ).rejects.toMatchObject({ reason: 'not_authenticated' });
    await expect(
      setup.service.act(
        { action: 'add', uri: printer.url, user: 'admin', password: 'wrong' },
        OWNER,
      ),
    ).rejects.toMatchObject({ reason: 'not_authenticated' });
    const reply = await setup.service.act(
      { action: 'add', uri: printer.url, user: 'admin', password: 'secret' },
      OWNER,
    );
    expect(reply['status']).toBe('added');
    expect(setup.rig.secretValues.get(`password.${printer.state.uuid}`)).toBe('secret');
    expect(setup.registry.list()[0]?.record.user).toBe('admin');
  });

  it('only the owner may add, rescan, forget or clear', async () => {
    for (const input of [{ action: 'add', uri: printer.url }, { action: 'rescan' }] as const) {
      await expect(setup.service.act(input, ANNA)).rejects.toMatchObject({
        reason: 'not_authorized',
      });
    }
    await added();
    for (const action of ['forget', 'clear_history', 'cancel_all'] as const) {
      await expect(setup.service.act({ action }, ANNA)).rejects.toMatchObject({
        reason: 'not_authorized',
      });
    }
  });

  it('forgetting a printer deletes its history and records', async () => {
    const uuid = await added();
    setup.registry.get(uuid)?.ledger.note('x', 'y', new Date());
    await setup.service.act({ action: 'forget' }, OWNER);
    expect(setup.registry.list()).toHaveLength(0);
    expect(setup.forgotten).toEqual([uuid]);
    for (const [name, records] of setup.rig.collections)
      expect(records.list(), name).toHaveLength(0);
    expect(setup.rig.secretValues.size).toBe(0);
  });
});

describe('reading a printer', () => {
  it('answers every view with data that matches its schema', async () => {
    await added();
    const read = (view: string, extra: object = {}): unknown =>
      setup.service.read({ view, ...extra }, OWNER);
    expect(PRINTER_OVERVIEW.parse(await read('overview'))).toMatchObject({
      state: 'idle',
      summary: 'Ready',
      queued: 0,
    });
    expect(
      PRINTER_SUPPLIES_VIEW.parse(await read('supplies', { period: 'week' })).supplies,
    ).toHaveLength(3);
    expect(PRINTER_TRAYS_VIEW.parse(await read('trays')).trays[0]).toMatchObject({
      name: 'main',
      level: 100,
    });
    expect(PRINTER_QUEUE_VIEW.parse(await read('queue')).active).toBeNull();
    expect(PRINTER_JOBS_VIEW.parse(await read('jobs')).jobs).toEqual([]);
    expect(
      PRINTER_STATS_VIEW.parse(await read('stats', { period: 'month' })).stats.heatmap,
    ).toHaveLength(365);
    expect(PRINTER_OPTIONS_VIEW.parse(await read('options')).sides).toContain(
      'two-sided-long-edge',
    );
    expect(PRINTER_SETTINGS_VIEW.parse(await read('settings')).weeklyBudget).toBe(100);
  });

  it('keeps connection settings from members and lists found printers for anyone', async () => {
    await added();
    expect(() => setup.service.read({ view: 'settings' }, ANNA)).toThrow(PrinterError);
    expect(setup.service.read({ view: 'candidates' }, ANNA)).toMatchObject({
      searching: false,
      candidates: [],
    });
  });

  it('asks which printer when several match', async () => {
    await added();
    expect(() => setup.service.read({ view: 'overview', printer: 'nothing' }, OWNER)).toThrow(
      /No printer matches/u,
    );
    expect(setup.service.read({ view: 'overview', printer: 'hall' }, OWNER)).toMatchObject({
      state: 'idle',
    });
  });
});

describe('printing and its limits', () => {
  it('prints a PDF the printer takes as it is, and records who printed', async () => {
    await added();
    setup.uploads.set('u1', { profile: 'anna', name: 'report.pdf', data: PDF });
    const reply = await setup.service.act(
      {
        action: 'print',
        source: { kind: 'upload', uploadId: 'u1' },
        options: { copies: 2, sides: 'two-sided-long-edge' },
      },
      ANNA,
    );
    expect(reply).toMatchObject({
      format: 'application/pdf',
      converted: false,
      job: { name: 'report.pdf', mine: true, person: 'anna' },
    });
    expect(Buffer.from(printer.documents[0] ?? [])).toEqual(PDF);
    expect(setup.converted).toEqual([]);
    const print = printer.seen.filter(
      (entry) => entry.operation === 0x0006 || entry.operation === 0x0005,
    );
    expect(print.length).toBeGreaterThan(0);
  });

  it('converts an image to JPEG when the printer takes JPEG but not PNG', async () => {
    await printer.stop();
    printer = new FakeIppPrinter({ formats: ['image/jpeg'] });
    await printer.start();
    await added();
    setup.uploads.set('p', { profile: 'owner-1', name: 'photo.png', data: PNG });
    const reply = await setup.service.act(
      { action: 'print', source: { kind: 'upload', uploadId: 'p' } },
      OWNER,
    );
    expect(reply).toMatchObject({ format: 'image/jpeg', converted: true });
    expect(setup.converted).toEqual([{ kind: 'jpeg', length: PNG.length }]);
    expect(Buffer.from(printer.documents[0] ?? [])).toEqual(JPEG);
  });

  it('rasterises a PDF for a printer that only takes PWG raster', async () => {
    await printer.stop();
    printer = new FakeIppPrinter({ formats: ['image/pwg-raster'] });
    await printer.start();
    await added();
    setup.uploads.set('d', { profile: 'owner-1', name: 'doc.pdf', data: PDF });
    const reply = await setup.service.act(
      { action: 'print', source: { kind: 'upload', uploadId: 'd' } },
      OWNER,
    );
    expect(reply).toMatchObject({ format: 'image/pwg-raster', converted: true });
    expect(setup.converted[0]?.kind).toBe('pdf-raster');
  });

  it('refuses a format it cannot convert, by name, and files that are not documents', async () => {
    await printer.stop();
    printer = new FakeIppPrinter({ formats: ['application/vnd.hp-PCL'] });
    await printer.start();
    await added();
    setup.uploads.set('d', { profile: 'owner-1', name: 'doc.pdf', data: PDF });
    await expect(
      setup.service.act({ action: 'print', source: { kind: 'upload', uploadId: 'd' } }, OWNER),
    ).rejects.toMatchObject({ reason: 'format_unsupported' });
    setup.uploads.set('t', { profile: 'owner-1', name: 'notes.txt', data: Buffer.from('hello') });
    await expect(
      setup.service.act({ action: 'print', source: { kind: 'upload', uploadId: 't' } }, OWNER),
    ).rejects.toMatchObject({ reason: 'format_unsupported' });
  });

  it('will not print another person’s upload', async () => {
    await added();
    setup.uploads.set('u1', { profile: 'anna', name: 'report.pdf', data: PDF });
    await expect(
      setup.service.act({ action: 'print', source: { kind: 'upload', uploadId: 'u1' } }, BEN),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });

  it('prints a test page', async () => {
    await added();
    const reply = await setup.service.act({ action: 'test_page' }, ANNA);
    expect(reply).toMatchObject({
      format: 'image/jpeg',
      converted: true,
      job: { name: 'Test page' },
    });
  });

  it('lets people cancel their own jobs but not each other’s, and the owner anyone’s', async () => {
    await added();
    setup.uploads.set('a', { profile: 'anna', name: 'a.pdf', data: PDF });
    const job = PRINTER_JOB.parse(
      (
        await setup.service.act(
          { action: 'print', source: { kind: 'upload', uploadId: 'a' } },
          ANNA,
        )
      )['job'],
    );
    await expect(setup.service.act({ action: 'cancel', job: job.key }, BEN)).rejects.toMatchObject({
      reason: 'not_authorized',
    });
    await setup.service.act({ action: 'cancel', job: job.key }, ANNA);
    expect(printer.seen.some((entry) => entry.operation === 0x0008)).toBe(true);
    await expect(
      setup.service.act({ action: 'cancel', job: 'nothing' }, OWNER),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });

  it('hides job names and people of others from members', async () => {
    await added();
    setup.uploads.set('a', { profile: 'anna', name: 'secret plans.pdf', data: PDF });
    await setup.service.act({ action: 'print', source: { kind: 'upload', uploadId: 'a' } }, ANNA);
    const owner = PRINTER_QUEUE_VIEW.parse(setup.service.read({ view: 'queue' }, OWNER));
    const ben = PRINTER_QUEUE_VIEW.parse(setup.service.read({ view: 'queue' }, BEN));
    expect([owner.waiting[0]?.name, owner.waiting[0]?.person]).toEqual([
      'secret plans.pdf',
      'anna',
    ]);
    expect([ben.waiting[0]?.name, ben.waiting[0]?.person, ben.waiting[0]?.mine]).toEqual([
      null,
      null,
      false,
    ]);
    expect(ben.others).toBe(1);
  });

  it('marks an operation the printer refuses so it is not offered again', async () => {
    await added();
    printer.failStatus = 0x0403;
    await expect(setup.service.act({ action: 'identify' }, OWNER)).rejects.toMatchObject({
      reason: 'not_authorized',
    });
    expect(setup.registry.list()[0]?.record.disabledOps).toContain(0x003c);
  });

  it('answers the options a print sheet needs and what each person may do', async () => {
    await added();
    const owner = PRINTER_OPTIONS_VIEW.parse(setup.service.read({ view: 'options' }, OWNER));
    const member = PRINTER_OPTIONS_VIEW.parse(setup.service.read({ view: 'options' }, ANNA));
    expect(owner.actions).toEqual(expect.arrayContaining(['print', 'forget', 'add', 'rescan']));
    expect(member.actions).toContain('print');
    expect(member.actions).not.toContain('forget');
    expect(member.actions).not.toContain('rescan');
  });
});

describe('settings and defaults', () => {
  it('lets the owner change settings and everyone change their own print defaults', async () => {
    await added();
    await setup.service.act(
      { action: 'configure', settings: { weeklyBudget: 40, notify: { low: false } } },
      OWNER,
    );
    await setup.service.act(
      { action: 'configure', prefs: { copies: 3, notifyJobDone: false } },
      ANNA,
    );
    const settings = PRINTER_SETTINGS_VIEW.parse(setup.service.read({ view: 'settings' }, OWNER));
    expect(settings).toMatchObject({ weeklyBudget: 40, notify: { low: false, empty: true } });
    const options = PRINTER_OPTIONS_VIEW.parse(setup.service.read({ view: 'options' }, ANNA));
    expect(options.prefs).toMatchObject({ copies: 3, notifyJobDone: false });
    await expect(
      setup.service.act({ action: 'configure', settings: { weeklyBudget: 1 } }, ANNA),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });

  it('applies a person’s defaults to their print', async () => {
    await added();
    await setup.service.act({ action: 'configure', prefs: { sides: 'two-sided-long-edge' } }, ANNA);
    setup.uploads.set('a', { profile: 'anna', name: 'a.pdf', data: PDF });
    const reply = await setup.service.act(
      { action: 'print', source: { kind: 'upload', uploadId: 'a' } },
      ANNA,
    );
    expect(reply).toMatchObject({ job: { duplex: true } });
  });

  it('opens the address the printer announced in its advert before its own more-info page', async () => {
    setup = newServiceRig(undefined, undefined, [
      {
        key: printer.state.uuid,
        uuid: printer.state.uuid,
        name: 'Hall',
        model: null,
        location: null,
        uri: printer.url,
        secure: false,
        authentication: false,
        adminUrl: 'http://hall.local/admin',
        fqdn: 'hall.local',
      },
    ]);
    await added();
    expect(await setup.service.act({ action: 'open_page' }, ANNA)).toMatchObject({
      url: 'http://hall.local/admin',
    });
  });

  it('finds the web page and refuses when there is none', async () => {
    await added();
    expect(await setup.service.act({ action: 'open_page' }, ANNA)).toMatchObject({
      url: 'http://127.0.0.1/',
    });
  });
});
