import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEVICE_CAPABILITY,
  DEVICE_KIND_LABELS,
  PRINTER_ACTION_INPUT,
  PRINTER_ACTION_NAMES,
  PRINTER_ACTION_TOOL_INPUT,
  PRINTER_CANDIDATES_VIEW,
  PRINTER_DETAILS,
  PRINTER_JOB,
  PRINTER_KEYS,
  PRINTER_OPTIONS_VIEW,
  PRINTER_OVERVIEW,
  PRINTER_QUEUE_VIEW,
  PRINTER_READ_INPUT,
  PRINTER_SETTINGS_VIEW,
  PRINTER_STATS_VIEW,
  PrinterError,
  deviceFamily,
  presentDevice,
  printerBinKey,
  printerTrayKey,
  printerTrayMediaKey,
  type DeviceCapability,
  type PrinterDetails,
} from '../src';

export const DETAILS: PrinterDetails = {
  pluginId: 'printer',
  uuid: '5ea8558e-a16f-3ee9-703c-df37e677edab',
  variant: 'tank',
  mfp: true,
  colour: true,
  duplex: true,
  ppm: 12,
  ppmColour: 8,
  formats: ['application/pdf', 'image/jpeg'],
  security: 'ipps',
  pinned: true,
  uri: 'ipps://printer.local:631/ipp/print',
  adminUrl: 'https://printer.local/',
  iconUrl: null,
  location: 'Hall',
  serial: null,
  firmware: '1.2.3',
  versions: ['1.1', '2.0'],
  authentication: ['none'],
  resolutions: [600],
  features: {
    subscriptions: false,
    identify: true,
    pause: false,
    hold: false,
    cancelAll: true,
    validate: true,
    cancelJob: true,
  },
  reportsSupplies: true,
  reportsCounters: false,
  supplies: [
    {
      key: 'black',
      slot: 'black',
      name: 'Black ink',
      colour: '#000000',
      kind: 'ink',
      consumed: true,
      lowLevel: 10,
      standing: 'ok',
      threshold: 15,
      daysLeft: null,
    },
  ],
  trays: [{ number: 1, name: 'main', capacity: 250 }],
  bins: [{ number: 1, name: 'face-down', capacity: null }],
  stateMessage: 'Idle.',
  operatorMessage: null,
  problems: [{ keyword: 'media-low-warning', severity: 'warning', part: 'input-tray' }],
  alerts: [{ code: 'lowPaper', severity: 'warning', group: 'input', description: null }],
  activeJob: {
    pages: 4,
    pagesDone: 1,
    startedAt: '2026-10-18T10:00:00+00:00',
    state: 'processing',
  },
  lastSeen: '2026-10-18T10:00:00+00:00',
  gapOpen: false,
  wifiSsid: null,
  uptimeSeconds: 1200,
};

const JOB = {
  key: 'job-1',
  jobId: 7,
  state: 'processing',
  mine: true,
  origin: 'hub',
  name: 'Report',
  person: 'Anna',
  pages: 4,
  pagesDone: 2,
  sheets: 2,
  color: 0,
  mono: 2,
  duplex: true,
  copies: 1,
  format: 'application/pdf',
  createdAt: '2026-10-18T10:00:00+00:00',
  startedAt: '2026-10-18T10:00:05+00:00',
  completedAt: null,
  reasons: ['job-printing'],
  cause: null,
  message: null,
  ahead: 0,
  progress: 50,
} as const;

const REF = { ref: 'printer:abc', name: 'Hall printer', online: true } as const;

describe('printer contract', () => {
  it('names capability keys the same way everywhere', () => {
    expect(PRINTER_KEYS.state).toBe('raw:printer.state');
    expect(printerTrayKey(2)).toBe('raw:printer.tray.2');
    expect(printerTrayMediaKey(2)).toBe('raw:printer.tray.2.media');
    expect(printerBinKey(1)).toBe('raw:printer.bin.1');
  });

  it('reads the device details a plugin publishes and a job it lists', () => {
    expect(PRINTER_DETAILS.parse(DETAILS)).toEqual(DETAILS);
    expect(PRINTER_JOB.parse(JOB)).toEqual(JOB);
    expect(PRINTER_DETAILS.safeParse({ ...DETAILS, security: 'http' }).success).toBe(false);
  });

  it('accepts every printer action and refuses unknown fields', () => {
    const inputs = [
      {
        action: 'print',
        source: { kind: 'upload', uploadId: 'u1' },
        options: { copies: 2, sides: 'one-sided' },
      },
      { action: 'print', source: { kind: 'attachment', name: 'a.pdf' }, name: 'A' },
      { action: 'print', source: { kind: 'machine', machine: 'pc', path: '/a.pdf' } },
      { action: 'test_page' },
      { action: 'cancel', job: 'job-1' },
      { action: 'cancel_all' },
      { action: 'hold', job: 'job-1' },
      { action: 'release', job: 'job-1' },
      { action: 'identify', how: 'flash' },
      { action: 'pause' },
      { action: 'resume' },
      { action: 'open_page' },
      { action: 'add', uri: 'ipps://printer.local/ipp/print', fingerprint: 'AA' },
      { action: 'rescan' },
      { action: 'trust_certificate', fingerprint: 'AA:BB' },
      { action: 'credentials', user: 'u', password: 'p' },
      { action: 'clear_history' },
      { action: 'forget' },
      {
        action: 'configure',
        settings: { weeklyBudget: 50, notify: { low: true } },
        prefs: { copies: 2 },
      },
    ];
    for (const input of inputs) expect(PRINTER_ACTION_INPUT.safeParse(input).success).toBe(true);
    expect(new Set(inputs.map((input) => input.action))).toEqual(new Set(PRINTER_ACTION_NAMES));
    expect(PRINTER_ACTION_INPUT.safeParse({ action: 'test_page', extra: 1 }).success).toBe(false);
    expect(
      PRINTER_ACTION_INPUT.safeParse({ action: 'print', source: { kind: 'url', url: 'x' } })
        .success,
    ).toBe(false);
  });

  it('offers the actions to tools as one flat object that reaches the same checks', () => {
    const json = z.toJSONSchema(PRINTER_ACTION_TOOL_INPUT, { io: 'input' });
    expect(json).toMatchObject({ type: 'object', required: ['action'] });
    expect(json).not.toHaveProperty('oneOf');
    const keys = Object.keys(PRINTER_ACTION_TOOL_INPUT.def.in.shape);
    for (const option of PRINTER_ACTION_INPUT.options) {
      for (const key of Object.keys(option.shape)) expect(keys).toContain(key);
    }
    expect(
      PRINTER_ACTION_TOOL_INPUT.parse({ action: 'cancel', job: 'k1', printer: 'p' }),
    ).toStrictEqual({ action: 'cancel', job: 'k1', printer: 'p' });
    const missing = PRINTER_ACTION_TOOL_INPUT.safeParse({ action: 'cancel' });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]).toMatchObject({ path: ['job'] });
    expect(PRINTER_ACTION_TOOL_INPUT.safeParse({ action: 'test_page', extra: 1 }).success).toBe(
      false,
    );
    expect(PRINTER_ACTION_TOOL_INPUT.safeParse({ action: 'test_page', job: 'x' }).success).toBe(
      false,
    );
  });

  it('accepts the read views and refuses nonsense', () => {
    expect(
      PRINTER_READ_INPUT.safeParse({
        view: 'stats',
        period: 'week',
        metric: 'pages',
        compare: true,
      }).success,
    ).toBe(true);
    expect(
      PRINTER_READ_INPUT.safeParse({ view: 'jobs', state: 'completed', limit: 20, person: 'Anna' })
        .success,
    ).toBe(true);
    expect(PRINTER_READ_INPUT.safeParse({ view: 'nothing' }).success).toBe(false);
  });

  it('carries a refusal reason and its fields', () => {
    const error = new PrinterError('needs_tls', 'use ipps', { uri: 'ipps://x' });
    expect(error).toMatchObject({
      name: 'PrinterError',
      reason: 'needs_tls',
      fields: { uri: 'ipps://x' },
    });
    expect(new PrinterError('busy', 'later').fields).toEqual({});
  });

  it('describes the views the app reads', () => {
    const supply = {
      key: 'black',
      slot: 'black',
      name: 'Black',
      colour: '#000000',
      kind: 'ink',
      consumed: true,
      level: 50,
      partial: false,
      standing: 'ok',
      threshold: 15,
      daysLeft: null,
      percentPerDay: null,
      percentPer100Pages: null,
      emptyAt: null,
      price: null,
    };
    const tray = {
      number: 1,
      name: 'main',
      level: 40,
      partial: false,
      capacity: 250,
      media: 'A4',
      mediaType: null,
      ok: true,
    };
    expect(
      PRINTER_OVERVIEW.safeParse({
        printer: REF,
        state: 'idle',
        queue: 'running',
        power: 'awake',
        summary: 'Ready',
        tone: 'ok',
        queued: 0,
        supplies: [supply],
        trays: [tray],
        bins: [],
        daysLeft: null,
        actions: ['print'],
        today: {
          pagesToday: 0,
          pagesWeek: 0,
          jobsToday: 0,
          color: 0,
          mono: 0,
          weeklyBudget: 100,
          lifetimePages: null,
        },
      }).success,
    ).toBe(true);
    expect(
      PRINTER_QUEUE_VIEW.safeParse({
        printer: REF,
        active: JOB,
        waiting: [],
        others: 2,
        last: null,
      }).success,
    ).toBe(true);
    expect(
      PRINTER_CANDIDATES_VIEW.safeParse({
        searching: false,
        printers: [REF],
        candidates: [
          {
            uri: 'ipp://x',
            name: 'X',
            model: null,
            location: null,
            secure: false,
            authentication: false,
            known: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(PRINTER_OPTIONS_VIEW.safeParse({}).success).toBe(false);
    expect(PRINTER_SETTINGS_VIEW.safeParse({}).success).toBe(false);
    expect(PRINTER_STATS_VIEW.safeParse({}).success).toBe(false);
  });
});

describe('printer presentation', () => {
  function capability(
    key: string,
    label: string,
    value: Record<string, unknown>,
    access = 'read',
  ): DeviceCapability {
    return DEVICE_CAPABILITY.parse({ key, label, access, value });
  }

  const capabilities = [
    capability(PRINTER_KEYS.state, 'State', {
      kind: 'enum',
      options: ['idle', 'printing', 'stopped'],
    }),
    capability(
      PRINTER_KEYS.queue,
      'Queue',
      { kind: 'enum', options: ['running', 'paused'] },
      'read_write',
    ),
    capability('raw:printer.supply.cyan', 'Cyan ink', {
      kind: 'number',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    }),
    capability(PRINTER_KEYS.testPage, 'Test page', { kind: 'action' }, 'write'),
  ];

  it('knows the printer kind and family, with or without capabilities', () => {
    expect(DEVICE_KIND_LABELS.printer).toBe('Printer');
    expect(deviceFamily({ kind: 'printer', model: 'Fake Color' })).toBe('printer');
    expect(deviceFamily({ kind: 'printer', model: 'Fake Color', capabilities })).toBe('printer');
  });

  it('presents fixed keys by name and dynamic supplies as readings', () => {
    const presented = presentDevice({ kind: 'printer', model: 'Fake Color', capabilities });
    expect(presented.family).toBe('printer');
    const byKey = new Map(presented.capabilities.map((entry) => [entry.key, entry]));
    expect(byKey.get(PRINTER_KEYS.state)).toMatchObject({ tier: 'primary', groupLabel: 'Status' });
    expect(byKey.get(PRINTER_KEYS.queue)).toMatchObject({ tier: 'control', writable: true });
    expect(byKey.get('raw:printer.supply.cyan')).toMatchObject({
      tier: 'reading',
      groupLabel: 'Printer',
    });
    expect(byKey.get(PRINTER_KEYS.testPage)).toMatchObject({
      tier: 'control',
      groupLabel: 'Actions',
    });
  });
});
