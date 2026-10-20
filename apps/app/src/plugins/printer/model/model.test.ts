import { describe, expect, it } from 'vitest';
import type { PrinterJob } from '@smarteverything/domain';
import { PRINTER_KEYS, supplyCapabilityKey } from '@smarteverything/domain';
import { printerFactsOf } from '../../../features/device-visuals/model/printer-facts';
import { deltaChip, pagesMeaning, shareDelta } from './delta';
import { chipsOf, fixCardsOf, lowestLine } from './chips';
import { INKS, detailsOf, liveOf } from './fixtures';
import { agoLabel, clockLabel, countLabel, daysLabel, percentLabel, unitLabel } from './format';
import { PressGate } from './add-model';
import { jobCardOf } from './job-card';
import { supplyCopy } from './supply-copy';

const JOB: PrinterJob = {
  key: 'job-1',
  jobId: 1,
  state: 'processing',
  mine: true,
  origin: 'hub',
  name: 'Report',
  person: 'anna',
  pages: 18,
  pagesDone: 6,
  sheets: null,
  color: null,
  mono: null,
  duplex: null,
  copies: 1,
  format: 'application/pdf',
  createdAt: '2026-10-18T10:00:00.000Z',
  startedAt: '2026-10-18T10:00:30.000Z',
  completedAt: null,
  reasons: [],
  cause: null,
  message: null,
  ahead: 0,
  progress: 33,
};
const NOW = Date.parse('2026-10-18T10:01:42.000Z');

describe('the stopped job card', () => {
  it('shows page, ETA and elapsed time for a job that is printing', () => {
    const card = jobCardOf(JOB, { stopped: false, now: NOW, ppm: 6 });
    expect(card).toMatchObject({
      kind: 'printing',
      pageLabel: 'Page 7 of 18',
      elapsed: '1:12',
      remaining: 'About 2:00 left',
    });
  });

  it('freezes time, hides the ETA and says where it stopped when the printer is stopped', () => {
    const card = jobCardOf(JOB, { stopped: true, now: NOW, ppm: 6 });
    expect(card).toMatchObject({
      kind: 'stopped',
      headline: 'Stopped at page 6 of 18 · waiting for the printer',
      elapsed: null,
      remaining: null,
    });
    expect(
      jobCardOf({ ...JOB, cause: 'Paper jam' }, { stopped: true, now: NOW, ppm: 6 }).detail,
    ).toBe('Paper jam');
    expect(jobCardOf({ ...JOB, state: 'stopped' }, { stopped: false, now: NOW, ppm: 6 }).kind).toBe(
      'stopped',
    );
  });

  it('handles held and waiting jobs and unknown page counts', () => {
    expect(
      jobCardOf({ ...JOB, state: 'held' }, { stopped: false, now: NOW, ppm: null }),
    ).toMatchObject({ kind: 'held', headline: 'On hold' });
    expect(
      jobCardOf({ ...JOB, state: 'pending', ahead: 2 }, { stopped: false, now: NOW, ppm: null }),
    ).toMatchObject({ kind: 'waiting', detail: '2 jobs ahead' });
    expect(
      jobCardOf({ ...JOB, state: 'pending', ahead: 0 }, { stopped: false, now: NOW, ppm: null })
        .detail,
    ).toBe('Next in line');
    expect(
      jobCardOf(
        { ...JOB, pages: null, pagesDone: null, startedAt: null },
        { stopped: true, now: NOW, ppm: 6 },
      ).headline,
    ).toBe('Stopped · waiting for the printer');
    const quiet = jobCardOf(
      { ...JOB, pages: null, pagesDone: null, startedAt: null, progress: null },
      { stopped: false, now: NOW, ppm: 6 },
    );
    expect(quiet).toMatchObject({
      headline: 'Printing',
      elapsed: null,
      remaining: null,
      progress: null,
    });
    expect(
      jobCardOf({ ...JOB, pagesDone: 18 }, { stopped: false, now: NOW, ppm: 6 }).remaining,
    ).toBeNull();
  });
});

describe('one low rule for chips, cards and the line under the hero', () => {
  const low = liveOf({
    details: {
      supplies: INKS.map((ink) =>
        ink.key === 'black'
          ? { ...ink, standing: 'low' as const, daysLeft: 7 }
          : ink.key === 'magenta'
            ? { ...ink, standing: 'low' as const }
            : ink,
      ),
      problems: [{ keyword: 'media-low-warning', severity: 'warning', part: 'input-tray' }],
    },
    values: { [supplyCapabilityKey('black')]: 4, [supplyCapabilityKey('magenta')]: 12 },
  });

  it('puts Black at 4 percent with 7 days left among the low supplies, and counts them the same everywhere', () => {
    expect(low.attention.low.map((status) => status.key)).toEqual(['black', 'magenta']);
    expect(chipsOf(low).map((chip) => chip.label)).toEqual([
      'Paper running low',
      'Black is low',
      'Magenta is low',
    ]);
    expect(fixCardsOf(low).map((card) => card.title)).toEqual([
      'Paper running low',
      'Black is low',
      'Magenta is low',
    ]);
    expect(lowestLine(low)).toBe('Lowest: Black 4%');
    expect(low.summary).toEqual({ tone: 'warn', text: '2 supplies are low' });
  });

  it('says nothing when nothing is low', () => {
    const calm = liveOf();
    expect(chipsOf(calm)).toEqual([]);
    expect(lowestLine(calm)).toBeNull();
    expect(calm.summary.text).toBe('Ready');
  });

  it('keeps the lowest line quiet when the lowest level is only unknown', () => {
    const unknown = liveOf({
      details: {
        supplies: INKS.map((ink) => ({ ...ink, standing: 'unknown' as const })),
      },
      values: { [supplyCapabilityKey('magenta')]: 47 },
    });
    expect(lowestLine(unknown)).toBeNull();
  });

  it('turns an empty tank and a full waste tank into the right words', () => {
    const empty = liveOf({
      details: {
        supplies: INKS.map((ink) =>
          ink.key === 'cyan'
            ? { ...ink, standing: 'out' as const }
            : ink.key === 'waste'
              ? { ...ink, standing: 'out' as const }
              : ink,
        ),
      },
      values: { [supplyCapabilityKey('cyan')]: 0, [supplyCapabilityKey('waste')]: 100 },
    });
    expect(fixCardsOf(empty).map((card) => [card.title, card.tone])).toEqual([
      ['Cyan is empty', 'critical'],
      ['Waste tank is full', 'critical'],
    ]);
    expect(fixCardsOf(empty)[0]?.cause).toBe('Replace the cartridge to keep printing.');
    const almost = liveOf({
      details: {
        supplies: INKS.map((ink) =>
          ink.key === 'waste' ? { ...ink, standing: 'low' as const } : ink,
        ),
      },
    });
    expect(chipsOf(almost)[0]?.label).toBe('Waste tank is almost full');
    expect(fixCardsOf(almost)[0]?.cause).toBe('Have the waste tank replaced or serviced.');
  });

  it('names the part of a stopped printer and shows it as the highlight on the illustration', () => {
    const jam = liveOf({
      details: { problems: [{ keyword: 'media-jam-error', severity: 'error', part: 'path' }] },
      values: { [PRINTER_KEYS.state]: 'stopped' },
    });
    expect(fixCardsOf(jam)[0]).toMatchObject({
      title: 'Paper jam',
      tone: 'critical',
      part: 'path',
    });
    expect(printerFactsOf(jam)).toMatchObject({ phase: 'stopped', part: 'path' });
    expect(jam.summary).toEqual({ tone: 'error', text: 'Paper jam' });
  });
});

describe('what the illustration is told', () => {
  it('shows ink levels, unknown levels, the waste tank and the paper stack', () => {
    const facts = printerFactsOf(liveOf({ values: { [supplyCapabilityKey('cyan')]: null } }));
    expect(facts.inks.map((ink) => ink.share)).toEqual([0.8, null, 0.3, 0.9]);
    expect(facts.waste).toBe(0.2);
    expect(facts.paper).toBe(0.6);
    expect(facts.output).toBe(0.1);
  });

  it('shows sleep, offline and printing', () => {
    expect(printerFactsOf(liveOf({ values: { [PRINTER_KEYS.powerState]: 'standby' } })).phase).toBe(
      'asleep',
    );
    expect(printerFactsOf(liveOf({ online: false })).phase).toBe('offline');
    const printing = printerFactsOf(
      liveOf({ values: { [PRINTER_KEYS.state]: 'printing', [PRINTER_KEYS.jobProgress]: 50 } }),
      true,
    );
    expect(printing).toMatchObject({ phase: 'printing', progress: 0.5, identify: true });
  });

  it('copes with a printer that reports no supplies or trays', () => {
    const bare = liveOf({ details: { supplies: [], trays: [], bins: [], reportsSupplies: false } });
    const facts = printerFactsOf(bare);
    expect(facts).toMatchObject({ inks: [], waste: null, paper: null, output: 0 });
  });

  it('reads nothing from details that are not a printer', () => {
    expect(detailsOf().pluginId).toBe('printer');
  });
});

describe('words for supplies', () => {
  const black = INKS[0];
  const waste = INKS[4];

  it('says level, days left and state in one place', () => {
    if (black === undefined || waste === undefined) throw new Error('fixture');
    expect(supplyCopy(black, 80, 'ok')).toMatchObject({
      value: '80%',
      caption: '40 days left',
      code: 'K',
      aria: 'Black, 80 percent',
    });
    expect(supplyCopy({ ...black, daysLeft: null }, 12, 'low').caption).toBe('Running low');
    expect(supplyCopy({ ...black, daysLeft: null }, 50, 'ok').caption).toBe('Plenty left');
    expect(supplyCopy(black, 0, 'out')).toMatchObject({
      caption: 'Empty',
      aria: 'Black, 0 percent, empty',
    });
    expect(supplyCopy(black, null, 'unknown')).toMatchObject({
      value: 'Not reported',
      caption: 'No level from the printer',
      aria: 'Black, not reported',
    });
    expect(supplyCopy(waste, 20, 'ok')).toMatchObject({
      caption: 'More than a year to full',
      aria: 'Waste tank, 20 percent full',
    });
    expect(supplyCopy(waste, 100, 'out').caption).toBe('Full');
    expect(supplyCopy({ ...waste, daysLeft: null }, 30, 'ok').caption).toBe('Fills slowly');
    expect(supplyCopy({ ...black, name: '' }, 50, 'ok').name).toBe('Black');
    expect(supplyCopy(black, 12, 'low').aria).toBe('Black, 12 percent, low');
  });

  it('formats counts, times and durations', () => {
    expect(countLabel(1, 'page')).toBe('1 page');
    expect(countLabel(2, 'page')).toBe('2 pages');
    expect(unitLabel(1, 'pages')).toBe('1 page');
    expect(unitLabel(3, 'labels')).toBe('3 labels');
    expect(clockLabel(72)).toBe('1:12');
    expect(clockLabel(-4)).toBe('0:00');
    expect(agoLabel(1000, 20_000)).toBe('just now');
    expect(agoLabel(0, 5 * 60_000)).toBe('5 min ago');
    expect(agoLabel(0, 3 * 3_600_000)).toBe('3 h ago');
    expect(agoLabel(0, 2 * 86_400_000)).toBe('2 days ago');
    expect(daysLabel(null)).toBeNull();
    expect(daysLabel(0.4)).toBe('Less than a day');
    expect(daysLabel(1000)).toBe('More than a year');
    expect(daysLabel(1)).toBe('1 day');
    expect(percentLabel(null)).toBe('Not reported');
    expect(percentLabel(41.6)).toBe('42%');
  });
});

describe('change chips are neutral unless a goal says otherwise', () => {
  it('does not paint less printing red', () => {
    expect(deltaChip(-0.23, 'neutral')).toEqual({ text: '−23%', tone: 'neutral' });
    expect(deltaChip(0.1, 'neutral')?.tone).toBe('neutral');
    expect(deltaChip(null, 'neutral')).toBeNull();
    expect(deltaChip(0, 'neutral')).toEqual({ text: 'Same as before', tone: 'neutral' });
  });

  it('is good when it moves the right way for a goal and bad when it does not', () => {
    expect(deltaChip(-0.2, pagesMeaning(true))?.tone).toBe('good');
    expect(deltaChip(0.2, pagesMeaning(true))?.tone).toBe('bad');
    expect(deltaChip(-0.2, 'more-is-better')?.tone).toBe('bad');
    expect(deltaChip(0.2, 'more-is-better')?.tone).toBe('good');
    expect(pagesMeaning(false)).toBe('neutral');
  });

  it('shows share changes in points', () => {
    expect(shareDelta(0.05)).toEqual({ text: '+5 pts', tone: 'neutral' });
    expect(shareDelta(-0.1)?.text).toBe('−10 pts');
    expect(shareDelta(0)?.text).toBe('Same as before');
    expect(shareDelta(null)).toBeNull();
  });
});

describe('pressing an add button', () => {
  it('starts one attempt per press and ignores presses while one is running', async () => {
    const gate = new PressGate();
    let calls = 0;
    let finish: (value: string) => void = () => undefined;
    const run = (): Promise<string> => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const first = gate.run(run);
    const repeats = await Promise.all([gate.run(run), gate.run(run)]);
    expect(repeats).toEqual([null, null]);
    expect(calls).toBe(1);
    finish('done');
    await expect(first).resolves.toBe('done');
    await expect(gate.run(() => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
    await expect(gate.run(() => Promise.resolve('again'))).resolves.toBe('again');
  });
});
