import { describe, expect, it } from 'vitest';
import type { PrinterJob, PrinterStatsView } from '@smarteverything/domain';
import type { ViewOf } from '../data/printer-api';
import { nameFor, outcomeOf, reasonText, stepIndex } from './add-model';
import { detailRows, uptimeLabel } from './details-view';
import { HISTORY_OPTIONS, RESULT_LABEL, historyRows, jobSubtitle } from './history-view';
import { SETTING_ROWS } from './search-rows';
import {
  barsOf,
  gapNote,
  laneSegments,
  splitSlices,
  stateShareSlices,
  streakLine,
  totalsItems,
} from './stats-view';
import { statusOf } from './status';
import { burnLine, forecastLine, marksOf, seriesOf } from './supplies-view';
import {
  choicesOf,
  finishingWord,
  initialForm,
  numberChoices,
  orientationOf,
  printOptionsOf,
  qualityOf,
  sidesOf,
  wordOf,
} from './print-model';
import { detailsOf, liveOf } from './fixtures';

const JOB: PrinterJob = {
  key: 'j1',
  jobId: 1,
  state: 'completed',
  mine: true,
  origin: 'hub',
  name: 'Tax form',
  person: 'anna',
  pages: 3,
  pagesDone: 3,
  sheets: 2,
  color: 1,
  mono: 2,
  duplex: true,
  copies: 1,
  format: 'application/pdf',
  createdAt: '2026-10-18T10:00:00.000Z',
  startedAt: '2026-10-18T10:00:10.000Z',
  completedAt: '2026-10-18T10:01:00.000Z',
  reasons: [],
  cause: null,
  message: null,
  ahead: null,
  progress: 100,
};

describe('add flow wording', () => {
  it('turns every hub reason into plain text and keeps unknown ones as they are', () => {
    expect(reasonText('unreachable', 'x')).toContain('Nothing answered');
    expect(reasonText('not_authenticated', 'x')).toContain('user name and password');
    expect(reasonText('mystery', 'The hub said no')).toBe('The hub said no');
    expect(reasonText(null, 'Plain')).toBe('Plain');
  });

  it('reads the certificate and added answers and rejects anything else', () => {
    expect(
      outcomeOf({
        status: 'confirm_certificate',
        fingerprint: 'AA',
        subject: 'CN=x',
        validFrom: 'a',
        validTo: 'b',
        uri: 'ipps://p',
      })?.status,
    ).toBe('confirm_certificate');
    expect(
      outcomeOf({ status: 'added', printer: { ref: 'r', name: 'P', online: true } })?.status,
    ).toBe('added');
    expect(outcomeOf({ status: 'nope' })).toBeNull();
  });

  it('names the printer from the model first and counts the steps', () => {
    expect(nameFor('LaserJet', 'Hall')).toBe('LaserJet');
    expect(nameFor(null, 'Hall')).toBe('Hall');
    expect(nameFor(null, null)).toBe('Printer');
    expect(stepIndex('find')).toBe(0);
    expect(stepIndex('sign')).toBe(1);
  });
});

describe('print form', () => {
  const options: ViewOf<'options'> = {
    printer: { ref: 'r', name: 'P', online: true },
    actions: ['print'],
    formats: [],
    accepts: [],
    copies: { lower: 1, upper: 99 },
    sides: ['one-sided', 'two-sided-long-edge'],
    colorModes: ['color', 'monochrome'],
    qualities: ['draft', 'normal'],
    media: ['iso_a4_210x297mm'],
    mediaReady: [],
    mediaSources: [],
    mediaTypes: [],
    orientations: [],
    scalings: [],
    outputBins: [],
    contentOptimize: [],
    resolutions: [],
    finishings: [3, 4],
    numberUp: [],
    priorities: null,
    holdUntil: [],
    pageRanges: true,
    defaults: { sides: 'one-sided', copies: 1 },
    prefs: {
      sides: 'two-sided-long-edge',
      colorMode: 'monochrome',
      quality: null,
      media: null,
      copies: 2,
      notifyJobDone: true,
    },
  };

  it('starts from the person defaults and only keeps values the printer supports', () => {
    const form = initialForm(options);
    expect(form).toMatchObject({
      copies: 2,
      sides: 'two-sided-long-edge',
      colorMode: 'monochrome',
      quality: null,
    });
  });

  it('sends only what was chosen', () => {
    const form = { ...initialForm(options), pageRanges: ' 1-3 ', finishings: [4] };
    expect(printOptionsOf(form)).toStrictEqual({
      copies: 2,
      sides: 'two-sided-long-edge',
      colorMode: 'monochrome',
      pageRanges: '1-3',
      finishings: [4],
    });
    expect(
      printOptionsOf({ ...initialForm(options), copies: 1, sides: null, colorMode: null }),
    ).toStrictEqual({});
  });

  it('words values and narrows strings to the allowed ones', () => {
    expect(wordOf('two-sided-long-edge')).toBe('Two-sided, flip on long edge');
    expect(wordOf('iso-a4')).toBe('Iso a4');
    expect(finishingWord(4)).toBe('Staple');
    expect(finishingWord(99)).toBe('Finishing 99');
    expect(sidesOf('nope')).toBeNull();
    expect(qualityOf('high')).toBe('high');
    expect(orientationOf('landscape')).toBe('landscape');
    expect(choicesOf(['night'])).toStrictEqual([{ value: 'night', label: 'Night' }]);
    expect(numberChoices([2, 4])).toStrictEqual([
      { value: '2', label: '2' },
      { value: '4', label: '4' },
    ]);
  });
});

describe('history rows', () => {
  it('merges jobs and gaps newest first and words each', () => {
    const view: ViewOf<'jobs'> = {
      printer: { ref: 'r', name: 'P', online: true },
      jobs: [JOB],
      total: 1,
      gaps: [
        { from: '2026-10-18T11:00:00.000Z', to: '2026-10-18T12:00:00.000Z', atLeastPages: 4 },
        { from: '2026-10-17T11:00:00.000Z', to: '2026-10-17T12:00:00.000Z', atLeastPages: null },
      ],
    };
    const rows = historyRows(view);
    expect(rows.map((row) => row.kind)).toStrictEqual(['gap', 'job', 'gap']);
    expect(rows[0]).toMatchObject({ text: 'Not recorded: at least 4 pages, jobs unknown' });
    expect(rows[2]).toMatchObject({
      text: 'Not recorded: the hub could not reach the printer, jobs unknown',
    });
    expect(jobSubtitle(JOB)).toBe('3 pages · Colour · Two-sided · anna');
    expect(RESULT_LABEL.aborted).toBe('Failed');
    expect(HISTORY_OPTIONS.map((option) => option.value)).toContain('canceled');
  });
});

describe('details rows', () => {
  it('lists only what the printer reported', () => {
    const rows = detailRows(detailsOf({ serial: 'S1', firmware: null, location: null }));
    const labels = rows.map((row) => row.label);
    expect(labels).toContain('Serial number');
    expect(labels).not.toContain('Firmware');
    expect(uptimeLabel(90_000)).toBe('1 d 1 h');
    expect(uptimeLabel(5400)).toBe('1 h 30 min');
    expect(uptimeLabel(120)).toBe('2 min');
  });
});

describe('status', () => {
  it('shows offline as its own state and job progress only while printing', () => {
    const offline = liveOf({ online: false });
    expect(statusOf(offline)).toStrictEqual({ tone: 'asleep', text: 'Offline', progress: null });
    expect(statusOf(liveOf()).progress).toBeNull();
    expect(
      statusOf(
        liveOf({ values: { 'raw:printer.state': 'printing', 'raw:printer.job_progress': 40 } }),
      ).progress,
    ).toBe(0.4);
  });
});

describe('settings search rows', () => {
  it('has unique ids and a title for every row', () => {
    const ids = SETTING_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTING_ROWS.every((row) => row.title !== '')).toBe(true);
  });
});

describe('supplies view', () => {
  const supply = {
    key: 'black',
    slot: 'black' as const,
    name: 'Black',
    colour: '#000000',
    kind: 'ink' as const,
    consumed: true,
    level: 40,
    partial: false,
    standing: 'ok' as const,
    threshold: 15,
    daysLeft: 12,
    percentPerDay: 3.5,
    percentPer100Pages: 8,
    emptyAt: '2026-10-30T00:00:00.000Z',
    price: null,
  };
  const view: ViewOf<'supplies'> = {
    printer: { ref: 'r', name: 'P', online: true },
    period: 'month',
    supplies: [supply],
    lines: [
      {
        key: 'black',
        points: [{ at: '2026-10-01T00:00:00.000Z', level: 80 }],
        forecast: [
          { at: '2026-10-18T00:00:00.000Z', level: 40 },
          { at: '2026-10-30T00:00:00.000Z', level: 0 },
        ],
      },
    ],
    marks: [
      { key: 'black', at: '2026-10-02T00:00:00.000Z', kind: 'replaced', certain: false },
      { key: 'other', at: '2026-10-02T00:00:00.000Z', kind: 'empty', certain: true },
    ],
    gaps: [],
  };

  it('draws the level and a separate forecast line', () => {
    const series = seriesOf(view, supply, 'primary');
    expect(series.map((entry) => entry.label)).toStrictEqual(['Black level', 'Black forecast']);
    expect(seriesOf({ ...view, lines: [] }, supply, 'primary')).toStrictEqual([]);
  });

  it('words the burn rate, the forecast and uncertain replacements', () => {
    expect(burnLine(supply)).toBe('Uses about 3.5% a day · 8.0% per 100 pages');
    expect(burnLine({ ...supply, percentPerDay: null, percentPer100Pages: null })).toBeNull();
    expect(forecastLine(supply)).toContain('12 days left');
    expect(forecastLine({ ...supply, emptyAt: null })).toBeNull();
    expect(marksOf(view, supply)).toStrictEqual([
      expect.stringMatching(/^Replaced .* \(estimated\)$/u),
    ]);
  });
});

describe('stats view', () => {
  const totals = {
    pages: 10,
    jobs: 4,
    sheets: 6,
    color: 2,
    mono: 8,
    duplexPages: 4,
    colorShare: 0.2,
    duplexShare: 0.4,
    paperSaved: 2,
    notAttributed: 0,
    coveredDays: 7,
  };
  const view = {
    printer: { ref: 'r', name: 'P', online: true },
    stats: {
      period: 'week',
      from: '2026-10-12',
      to: '2026-10-18',
      buckets: [
        { key: '2026-10-12', pages: 5, jobs: 2, color: 1, mono: 4, covered: true },
        { key: '2026-10-13', pages: 9, jobs: 2, color: 1, mono: 4, covered: false },
      ],
      previousBuckets: [],
      totals,
      previous: { ...totals, pages: 20 },
      delta: {
        pages: -0.5,
        jobs: 0,
        sheets: null,
        colorShare: 0.05,
        duplexShare: null,
        paperSaved: 1,
      },
      average7: [],
      average30: [],
      busiestDay: null,
      pagesPerJob: [],
      printFree: { current: 0, longest: 0 },
      printing: { current: 2, longest: 5 },
      heatmap: [],
      weekdayHour: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      reliability: { onlinePercent: null, restarts: 0, jams: 0, errors: 0, months: [] },
      lifetimePages: null,
    },
    unit: 'pages',
    colour: true,
    budget: { weekly: 100, monthlyCap: null, target: 50 },
    cost: null,
    people: [],
    bests: { biggestJob: null, longestSeconds: null },
    states: {
      shares: [
        { state: 'idle', seconds: 100 },
        { state: 'printing', seconds: 0 },
      ],
      lane: [{ state: 'idle', from: '2026-10-18T00:00:00.000Z', to: '2026-10-18T01:00:00.000Z' }],
    },
    events: [],
  } satisfies PrinterStatsView;

  it('labels the bars and zeroes parts the hub could not record', () => {
    const bars = barsOf('week', view.stats.buckets);
    expect(bars[0]).toStrictEqual({ key: '2026-10-12', value: 5, label: 'M' });
    expect(bars[1]?.value).toBe(0);
    expect(gapNote(view.stats.buckets, '2026-10-01')).toBe(
      '1 bar not recorded because the hub could not reach the printer.',
    );
    expect(gapNote(view.stats.buckets, '2026-10-14')).toBeNull();
    expect(gapNote(view.stats.buckets, null)).toBeNull();
    expect(
      barsOf('day', [
        { key: '2026-10-18T06', pages: 1, jobs: 1, color: 0, mono: 1, covered: true },
      ])[0]?.label,
    ).toBe('06');
    expect(
      barsOf('year', [{ key: '2026-03', pages: 1, jobs: 1, color: 0, mono: 1, covered: true }])[0]
        ?.label,
    ).toBe('M');
    expect(
      barsOf('month', [
        { key: '2026-10-05', pages: 1, jobs: 1, color: 0, mono: 1, covered: true },
      ])[0]?.label,
    ).toBe('05');
  });

  it('shows less printing as good only when there is a print-less target', () => {
    const items = totalsItems(view);
    expect(items.find((item) => item.key === 'pages')?.caption).toBe('−50%');
    expect(items.find((item) => item.key === 'colour')?.caption).toBe('+5 pts');
    expect(items.find((item) => item.key === 'saved')?.value).toBe('2');
  });

  it('builds the split, state and streak figures', () => {
    expect(splitSlices(view).map((slice) => slice.key)).toStrictEqual(['colour', 'mono']);
    expect(stateShareSlices(view).map((slice) => slice.key)).toStrictEqual(['idle']);
    expect(laneSegments(view)[0]?.end).toBe(Date.parse('2026-10-18T01:00:00.000Z'));
    expect(streakLine(2, 5, 'printing')).toBe('2 days now · longest 5 days');
    expect(streakLine(0, 0, 'printing')).toBe('No printing streak yet');
  });
});
