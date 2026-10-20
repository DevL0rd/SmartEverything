import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { FakeIppPrinter } from './fake-ipp-printer';
import { newRig, openSession, reopenSession, type Rig } from './rig';

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

function later(seconds: number): void {
  rig.time.now = new Date(rig.time.now.getTime() + seconds * 1000);
}

function count(kind: string): number {
  return rig.events.filter((event) => event.kind === kind).length;
}

async function restart(): Promise<void> {
  session.stop();
  session = await reopenSession(rig, printer);
}

function black(level: number): void {
  const supply = printer.state.supplies[0];
  if (supply === undefined) throw new Error('The fake printer has no supply.');
  supply.level = level;
}

describe('trackers after the hub restarts', () => {
  it('does not announce a supply that was already low', async () => {
    black(10);
    await session.poll();
    expect(count('supply_low')).toBe(1);
    await restart();
    later(30);
    await session.poll();
    expect(count('supply_low')).toBe(1);
    expect(session.ledger.marks().map((mark) => mark.kind)).toEqual(['low']);
  });

  it('announces a supply that became low while the hub was down', async () => {
    await session.poll();
    await restart();
    black(10);
    later(30);
    await session.poll();
    expect(count('supply_low')).toBe(1);
  });

  it('does not announce a problem that was already standing', async () => {
    printer.state.state = 5;
    printer.state.reasons = ['media-jam-error'];
    await session.poll();
    later(6);
    await session.poll();
    expect(count('problem_added')).toBe(1);
    await restart();
    later(30);
    await session.poll();
    later(6);
    await session.poll();
    expect(count('problem_added')).toBe(1);
    expect(count('problem_cleared')).toBe(0);
  });

  it('clears a problem that went away while the hub was down', async () => {
    printer.state.state = 5;
    printer.state.reasons = ['media-jam-error'];
    await session.poll();
    later(6);
    await session.poll();
    await restart();
    printer.state.state = 3;
    printer.state.reasons = [];
    later(30);
    await session.poll();
    later(6);
    await session.poll();
    expect(count('problem_cleared')).toBe(1);
  });

  it('does not announce an alert that was already standing', async () => {
    printer.state.alerts = ['inputMediaSupplyEmpty'];
    await session.poll();
    expect(count('alert')).toBe(1);
    await restart();
    later(30);
    await session.poll();
    expect(count('alert')).toBe(1);
  });

  it('notes a cartridge replaced while the hub was down as uncertain, dated from the marker time', async () => {
    black(10);
    await session.poll();
    await restart();
    black(100);
    printer.state.upTime = 2000;
    printer.state.markerChangeTime = 1900;
    later(60);
    await session.poll();
    const replaced = rig.events.find((event) => event.kind === 'supply_replaced');
    expect(replaced).toMatchObject({ data: { supply: 'black', certain: false } });
    const mark = session.ledger.marks().find((entry) => entry.kind === 'replaced');
    expect(mark).toMatchObject({ key: 'black', certain: false });
    expect(mark?.at).toBe('2026-10-18T09:59:20.000Z');
  });

  it('notes a small rise as a replacement across a gap only when the marker time moved', async () => {
    black(50);
    await session.poll();
    await restart();
    black(58);
    later(60);
    await session.poll();
    expect(count('supply_replaced')).toBe(0);
    await restart();
    black(66);
    printer.state.markerChangeTime = 99;
    later(60);
    await session.poll();
    expect(count('supply_replaced')).toBe(1);
  });
});
