import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRINTER_DETAILS, PRINTER_KEYS } from '@smarteverything/domain';
import { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { SNAPSHOTS, readSnapshot } from '../../../src/plugins/builtin/printer/session-host';
import { FakeIppPrinter } from './fake-ipp-printer';
import { newRig, openSession, recordFor, type Rig } from './rig';

let printer: FakeIppPrinter;
let rig: Rig;
let session: PrinterSession;

beforeEach(async () => {
  printer = new FakeIppPrinter();
  await printer.start();
  rig = newRig();
  session = await openSession(rig, printer);
});

afterEach(async () => {
  session.stop();
  await printer.stop();
});

function valueOf(key: string): unknown {
  return rig.states.filter((update) => update.capability === key).at(-1)?.value;
}

function later(seconds: number): void {
  rig.time.now = new Date(rig.time.now.getTime() + seconds * 1000);
}

function kinds(): string[] {
  return rig.events.map((event) => event.kind);
}

describe('a printer session reading a printer', () => {
  it('publishes the device with its capabilities and details on the first read', async () => {
    await session.poll();
    const device = rig.devices.at(-1);
    expect(device).toMatchObject({
      kind: 'printer',
      name: 'Hall printer',
      online: true,
      externalId: `printer:${printer.state.uuid}`,
    });
    expect(device?.capabilities.map((capability) => capability.key)).toEqual(
      expect.arrayContaining([
        PRINTER_KEYS.state,
        'raw:printer.supply.black',
        'raw:printer.supply.cyan',
        'raw:printer.supply.waste',
        'raw:printer.tray.1',
      ]),
    );
    expect(PRINTER_DETAILS.safeParse(device?.details).success).toBe(true);
    expect(valueOf(PRINTER_KEYS.state)).toBe('idle');
    expect(valueOf('raw:printer.supply.black')).toBe(80);
    expect(valueOf('raw:printer.supply.waste')).toBe(10);
  });

  it('samples supply levels into history while writing state at most once a minute', async () => {
    await session.poll();
    const cyan = printer.state.supplies[1];
    if (cyan === undefined) throw new Error('The fake printer has no second supply.');
    cyan.level = 12;
    await session.poll();
    expect(
      rig.samples
        .filter((sample) => sample.key === 'raw:printer.supply.cyan')
        .map((sample) => sample.value),
    ).toEqual([60, 12]);
    expect(valueOf('raw:printer.supply.cyan')).toBe(60);
  });

  it('announces a problem only after it has stayed for five seconds, and clears it the same way', async () => {
    printer.state.state = 5;
    printer.state.reasons = ['media-jam-error'];
    await session.poll();
    expect(kinds()).not.toContain('problem_added');
    later(6);
    await session.poll();
    const problem = rig.events.find((event) => event.kind === 'problem_added');
    expect(problem?.subject).toContain('Paper jam');
    expect(problem).toMatchObject({
      data: {
        keyword: 'media-jam-error',
        severity: 'error',
        part: 'path',
        printer: 'Hall printer',
      },
    });
    expect(valueOf(PRINTER_KEYS.problem)).toBe('Paper jam');
    printer.state.state = 3;
    printer.state.reasons = [];
    later(1);
    await session.poll();
    later(6);
    await session.poll();
    expect(kinds()).toContain('problem_cleared');
    expect(session.ledger.day('2026-10-18').jams).toBe(1);
  });

  it('says once that a supply is low, and again only after it recovered', async () => {
    printer.state.supplies[1]!.level = 10;
    await session.poll();
    expect(rig.events.filter((event) => event.kind === 'supply_low')).toHaveLength(1);
    later(60);
    await session.poll();
    expect(rig.events.filter((event) => event.kind === 'supply_low')).toHaveLength(1);
    expect(session.ledger.marks().map((mark) => mark.kind)).toEqual(['low']);
  });

  it('notes a replaced cartridge when the level jumps and the marker time moved', async () => {
    printer.state.supplies[0]!.level = 10;
    await session.poll();
    printer.state.supplies[0]!.level = 100;
    printer.state.markerChangeTime = 99;
    await session.poll();
    expect(rig.events.find((event) => event.kind === 'supply_replaced')).toMatchObject({
      data: { supply: 'black', certain: true },
    });
  });

  it('detects a restart when the up time falls and does not count the counter drop as pages', async () => {
    await session.poll();
    printer.state.upTime = 5;
    printer.state.pages = 3;
    await session.poll();
    expect(kinds()).toContain('restarted');
    expect(session.record.epoch).toBe(1);
    expect(session.ledger.day('2026-10-18').counterPages).toBe(0);
  });

  it('turns a page counter into unattributed pages for the day', async () => {
    await session.poll();
    printer.state.pages = 130;
    await session.poll();
    expect(session.ledger.day('2026-10-18')).toMatchObject({
      counterPages: 10,
      estimatedPages: 10,
    });
    expect(valueOf(PRINTER_KEYS.pagesToday)).toBe(10);
  });

  it('follows a job from start to finish and counts it once', async () => {
    printer.state.state = 4;
    printer.state.jobs.push({
      id: 1,
      name: 'Report',
      user: 'anna',
      state: 5,
      impressions: 4,
      done: 1,
      createdAt: 1000,
    });
    await session.poll();
    expect(kinds()).toContain('job_started');
    expect(rig.devices.at(-1)?.details['activeJob']).toMatchObject({
      pages: 4,
      pagesDone: 1,
      state: 'processing',
    });
    printer.state.jobs[0]!.state = 9;
    printer.state.jobs[0]!.done = 4;
    printer.state.state = 3;
    await session.poll();
    await session.poll();
    expect(rig.events.filter((event) => event.kind === 'job_finished')).toHaveLength(1);
    expect(session.ledger.day('2026-10-18')).toMatchObject({ jobs: 1, pages: 4 });
    expect(valueOf(PRINTER_KEYS.pagesToday)).toBe(4);
  });

  it('goes offline after three failed reads and comes back on the next good one', async () => {
    await session.poll();
    printer.malformed = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      later(40);
      await session.poll();
    }
    expect(rig.devices.at(-1)?.online).toBe(false);
    printer.malformed = false;
    later(40);
    await session.poll();
    expect(rig.devices.at(-1)?.online).toBe(true);
  });

  it('treats a busy printer as busy, not as offline', async () => {
    await session.poll();
    printer.busy = true;
    for (let attempt = 0; attempt < 4; attempt += 1) await session.poll();
    expect(rig.devices.at(-1)?.online).toBe(true);
  });

  it('shows a printer that was away as having an unrecorded gap', async () => {
    await session.describeNow();
    const described = readSnapshot(rig.host.records(SNAPSHOTS).get(printer.state.uuid));
    if (described === null) throw new Error('The description was not saved.');
    const record = recordFor(printer, { lastSeen: '2026-10-16T09:00:00.000Z' });
    const restored = new PrinterSession(rig.host, record, described, false);
    restored.mirror.attach(rig.sink);
    await restored.poll();
    expect(restored.ledger.day('2026-10-16').gaps).toEqual([{ from: 540, to: 1440 }]);
    expect(restored.ledger.day('2026-10-17').gaps).toEqual([{ from: 0, to: 1440 }]);
    expect(restored.ledger.day('2026-10-18').gaps).toEqual([{ from: 0, to: 600 }]);
    restored.stop();
  });
});
