import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PRINTER_JOBS_VIEW,
  PRINTER_QUEUE_VIEW,
  PRINTER_STATS_VIEW,
  PRINTER_SUPPLIES_VIEW,
} from '@smarteverything/domain';
import type { JobRecord } from '../../../src/plugins/builtin/printer/records';
import type { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { FakeIppPrinter } from './fake-ipp-printer';
import { ANNA, OWNER, newServiceRig, type ServiceRig } from './service-rig';

let printer: FakeIppPrinter;
let setup: ServiceRig;
let session: PrinterSession;

beforeEach(async () => {
  printer = new FakeIppPrinter();
  await printer.start();
  setup = newServiceRig();
  await setup.service.act({ action: 'add', uri: printer.url, name: 'Hall' }, OWNER);
  const [first] = setup.registry.list();
  if (first === undefined) throw new Error('The printer was not added.');
  session = first;
  await session.poll();
});

afterEach(async () => {
  for (const each of setup.registry.list()) each.stop();
  await printer.stop();
});

function job(key: string, patch: Partial<JobRecord>): JobRecord {
  return {
    key,
    jobId: Number(key.replace(/\D/gu, '')) || null,
    epoch: 0,
    origin: 'hub',
    person: 'owner-1',
    name: `Document ${key}`,
    state: 'completed',
    reasons: [],
    printerReasons: [],
    message: null,
    format: 'application/pdf',
    copies: 1,
    colorMode: null,
    sides: null,
    pages: 4,
    sheets: 2,
    color: 1,
    mono: 3,
    kOctets: null,
    createdAt: '2026-10-17T09:00:00.000Z',
    startedAt: '2026-10-17T09:00:05.000Z',
    completedAt: '2026-10-17T09:01:05.000Z',
    counted: true,
    ...patch,
  };
}

function seedHistory(): void {
  const { ledger } = session;
  ledger.saveJob(job('j1', { person: 'owner-1' }));
  ledger.saveJob(
    job('j2', {
      person: 'anna',
      pages: 12,
      createdAt: '2026-10-16T09:00:00.000Z',
      startedAt: '2026-10-16T09:00:05.000Z',
      completedAt: '2026-10-16T09:05:00.000Z',
    }),
  );
  ledger.saveJob(
    job('j3', {
      state: 'canceled',
      pages: null,
      color: null,
      mono: null,
      createdAt: '2026-10-17T07:00:00.000Z',
      startedAt: null,
      completedAt: '2026-10-17T07:05:00.000Z',
    }),
  );
  ledger.saveJob(
    job('j4', { state: 'processing', completedAt: null, createdAt: '2026-10-18T09:59:00.000Z' }),
  );
  ledger.saveJob(
    job('j5', {
      state: 'pending',
      completedAt: null,
      startedAt: null,
      createdAt: '2026-10-18T09:59:30.000Z',
    }),
  );
  ledger.addGap(new Date('2026-10-17T12:00:00.000Z'), new Date('2026-10-17T13:00:00.000Z'));
  ledger.transition('idle', new Date('2026-10-17T08:00:00.000Z'));
  ledger.transition('printing', new Date('2026-10-17T09:00:00.000Z'));
  ledger.transition('idle', new Date('2026-10-17T09:01:00.000Z'));
  ledger.note('job_finished', 'Document j1 finished', new Date('2026-10-17T09:01:05.000Z'));
}

describe('job views', () => {
  it('lists history newest first, filters by state and person, and shows gaps', () => {
    seedHistory();
    const all = PRINTER_JOBS_VIEW.parse(setup.service.read({ view: 'jobs', limit: 50 }, OWNER));
    expect(all.jobs.map((entry) => entry.key)).toStrictEqual(['j5', 'j4', 'j1', 'j3', 'j2']);
    expect(all.total).toBe(5);
    expect(all.gaps).toHaveLength(1);
    const done = PRINTER_JOBS_VIEW.parse(
      setup.service.read({ view: 'jobs', state: 'completed' }, OWNER),
    );
    expect(done.jobs.map((entry) => entry.key)).toStrictEqual(['j1', 'j2']);
    const annas = PRINTER_JOBS_VIEW.parse(
      setup.service.read({ view: 'jobs', person: 'anna' }, OWNER),
    );
    expect(annas.jobs.map((entry) => entry.key)).toStrictEqual(['j2']);
    const waiting = PRINTER_JOBS_VIEW.parse(
      setup.service.read({ view: 'jobs', state: 'waiting' }, OWNER),
    );
    expect(waiting.jobs.map((entry) => entry.key)).toStrictEqual(['j5']);
    const ranged = PRINTER_JOBS_VIEW.parse(
      setup.service.read(
        { view: 'jobs', from: '2026-10-17T00:00:00.000Z', to: '2026-10-17T23:59:59.000Z' },
        OWNER,
      ),
    );
    expect(ranged.jobs.map((entry) => entry.key)).toStrictEqual(['j1', 'j3']);
  });

  it('hides other people’s document names and person filters from members', () => {
    seedHistory();
    const seen = PRINTER_JOBS_VIEW.parse(
      setup.service.read({ view: 'jobs', person: 'owner-1' }, ANNA),
    );
    expect(seen.jobs).toStrictEqual([]);
    const own = PRINTER_JOBS_VIEW.parse(setup.service.read({ view: 'jobs' }, ANNA));
    const mine = own.jobs.find((entry) => entry.key === 'j2');
    const theirs = own.jobs.find((entry) => entry.key === 'j1');
    expect(mine?.name).toBe('Document j2');
    expect(theirs?.name).toBeNull();
  });

  it('puts the running job first in the queue with its live page count and counts other people’s jobs', () => {
    seedHistory();
    const queue = PRINTER_QUEUE_VIEW.parse(setup.service.read({ view: 'queue' }, ANNA));
    expect(queue.active?.key).toBe('j4');
    expect(queue.waiting.map((entry) => entry.key)).toStrictEqual(['j5']);
    expect(queue.others).toBe(2);
    expect(queue.last?.key).toBe('j1');
  });
});

describe('statistics view', () => {
  it('counts jobs, people, bests, state time and events for the owner', () => {
    seedHistory();
    const view = PRINTER_STATS_VIEW.parse(
      setup.service.read({ view: 'stats', period: 'week', anchor: '2026-10-18' }, OWNER),
    );
    expect(view.stats.totals.jobs).toBe(2);
    expect(view.people.map((entry) => entry.label).sort()).toStrictEqual(['anna', 'owner-1']);
    expect(view.people.find((entry) => entry.mine)?.label).toBe('owner-1');
    expect(view.bests.biggestJob).toBe(12);
    expect(view.bests.longestSeconds).toBe(295);
    expect(view.states.lane.length).toBeGreaterThan(0);
    expect(view.states.shares.find((share) => share.state === 'printing')?.seconds).toBe(60);
    expect(view.events.at(-1)?.text).toBe('Document j1 finished');
    expect(view.cost).toBeNull();
    expect(view.unit).toBe('pages');
  });

  it('shows a member only their own count and no bests', () => {
    seedHistory();
    const view = PRINTER_STATS_VIEW.parse(
      setup.service.read({ view: 'stats', period: 'month' }, ANNA),
    );
    expect(view.people).toStrictEqual([
      { label: 'You', jobs: 1, mine: true },
      { label: 'Others', jobs: 1, mine: false },
    ]);
    expect(view.bests).toStrictEqual({ biggestJob: null, longestSeconds: null });
  });

  it('prices pages once the owner gives cartridge prices and adds up the month', async () => {
    seedHistory();
    const supplies = PRINTER_SUPPLIES_VIEW.parse(setup.service.read({ view: 'supplies' }, OWNER));
    const prices = Object.fromEntries(
      supplies.supplies
        .filter((supply) => supply.consumed)
        .map((supply) => [supply.key, { price: 30, yieldPages: 300 }]),
    );
    await setup.service.act({ action: 'configure', settings: { prices, currency: 'EUR' } }, OWNER);
    const view = PRINTER_STATS_VIEW.parse(
      setup.service.read({ view: 'stats', period: 'month', anchor: '2026-10-18' }, OWNER),
    );
    expect(view.cost?.currency).toBe('EUR');
    expect(view.cost?.perColourPage).toBeGreaterThan(0);
    expect(view.cost?.months.at(-1)?.month).toBe('2026-10');
    expect(view.cost?.month).toBeGreaterThan(0);
  });
});

describe('supplies view', () => {
  it('draws level history, marks and the forecast line', () => {
    const { ledger } = session;
    const [first] = PRINTER_SUPPLIES_VIEW.parse(
      setup.service.read({ view: 'supplies' }, OWNER),
    ).supplies;
    if (first === undefined) throw new Error('The printer reported no supply.');
    const days = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
    days.forEach((day, index) => {
      ledger.recordSupply(first.key, 90 - index * 10, new Date(`${day}T12:00:00.000Z`));
    });
    ledger.addMark({
      key: first.key,
      at: '2026-10-15T08:00:00.000Z',
      kind: 'replaced',
      before: 5,
      after: 100,
      pages: 12,
      certain: true,
    });
    const week = PRINTER_SUPPLIES_VIEW.parse(
      setup.service.read({ view: 'supplies', period: 'week' }, OWNER),
    );
    const line = week.lines.find((entry) => entry.key === first.key);
    expect(line?.points.length).toBeGreaterThanOrEqual(3);
    expect(week.marks.map((mark) => mark.kind)).toContain('replaced');
    const day = PRINTER_SUPPLIES_VIEW.parse(
      setup.service.read({ view: 'supplies', period: 'day' }, OWNER),
    );
    expect(day.period).toBe('day');
    const year = PRINTER_SUPPLIES_VIEW.parse(
      setup.service.read({ view: 'supplies', period: 'year' }, OWNER),
    );
    expect(year.lines.length).toBe(year.supplies.length);
  });
});
