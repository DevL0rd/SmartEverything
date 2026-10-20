import { describe, expect, it } from 'vitest';
import { decodeMessage } from '../src/decode';
import { readDescription } from '../src/description';
import { IppReadError } from '../src/errors';
import { readJob, readJobs } from '../src/jobs';
import { readEvent, readGrant } from '../src/notifications';
import { plainGroups, plainObject } from '../src/plain';
import { parseResponse, requireSuccess } from '../src/response';
import { readStatus } from '../src/status';
import { colorantOf, readSupplies, supplyKindOf } from '../src/supply';
import { readTrays } from '../src/trays';
import { readAlerts } from '../src/alerts';
import { encodeMessage } from '../src/encode';
import { GROUP_TAG } from '../src/tags';
import { attribute, ipp } from '../src/values';
import { GET_PRINTER_ATTRIBUTES_RESPONSE } from './fixtures/gpa-response';
import { bytesOf } from './helpers';

const fixture = decodeMessage(bytesOf(GET_PRINTER_ATTRIBUTES_RESPONSE));
const printer = plainGroups(fixture.groups, GROUP_TAG.printer)[0] ?? {};

describe('the reference printer description', () => {
  const description = readDescription(printer);

  it('reads identity, including the IEEE 1284 device id and the uuid', () => {
    expect(description.identity).toMatchObject({
      name: 'Fake Printer',
      makeAndModel: 'Example Printer',
      manufacturer: 'Example',
      model: 'Printer',
      uuid: '5ea8558e-a16f-3ee9-703c-df37e677edab',
      location: null,
    });
    expect(description.identity.uris).toHaveLength(2);
    expect(description.identity.icons).toHaveLength(3);
  });

  it('reads capabilities the print sheet is built from', () => {
    expect(description.capabilities).toMatchObject({
      color: false,
      pagesPerMinute: 12,
      sides: ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'],
      identifyActions: ['display', 'sound'],
      copies: { lower: 1, upper: 999 },
      pageRanges: true,
      authentication: ['none'],
      security: ['none', 'tls'],
    });
    expect(description.capabilities.operations).toContain(0x003c);
    expect(description.capabilities.resolutions).toEqual([600]);
    expect(description.capabilities.rasterTypes).toEqual([]);
    expect(description.capabilities.rasterResolutions).toEqual([]);
  });

  it('reads defaults', () => {
    expect(description.defaults).toMatchObject({ sides: 'one-sided', quality: 4, copies: 1 });
  });

  it('reads the status carried in the same answer', () => {
    expect(description.status).toMatchObject({
      state: 'idle',
      reasons: [],
      accepting: true,
      queuedJobs: 0,
    });
    expect(description.status.supplies).toEqual([
      expect.objectContaining({
        name: 'Toner Waste Tank',
        kind: 'waste',
        consumed: false,
        level: 25,
      }),
      expect.objectContaining({ name: 'Black Toner', kind: 'toner', colorant: 'black', level: 75 }),
    ]);
  });

  it('reads trays: unknown levels stay unknown', () => {
    const { inputTrays } = description.status;
    expect(inputTrays.map((tray) => [tray.name, tray.level])).toEqual([
      ['auto', null],
      ['main', 40],
      ['manual', null],
      ['by-pass-tray', null],
    ]);
  });
});

describe('printer status in the encodings real printers use', () => {
  it('prefers printer-supply and adds colour and low level from marker-* arrays', () => {
    const supplies = readSupplies({
      'printer-supply': [
        'index=1;class=supplyThatIsConsumed;type=ink;unit=percent;maxcapacity=100;level=40;colorantname=cyan;',
        'index=2;class=supplyThatIsConsumed;type=ink;unit=percent;maxcapacity=100;level=-2;colorantname=magenta;',
      ],
      'printer-supply-description': ['Cyan ink', 'Magenta ink'],
      'marker-names': ['Cyan', 'Magenta'],
      'marker-colors': ['#00FFFF', 'none'],
      'marker-low-levels': [10, 15],
    });
    expect(supplies).toEqual([
      expect.objectContaining({ colorant: 'cyan', colour: '#00ffff', lowLevel: 10, level: 40 }),
      expect.objectContaining({ colorant: 'magenta', colour: null, lowLevel: 15, level: null }),
    ]);
  });

  it('falls back to marker-* when there is no printer-supply', () => {
    const supplies = readSupplies({
      'marker-names': ['Black Cartridge', 'Waste Toner Box', 'Light Cyan'],
      'marker-types': ['toner-cartridge', 'waste-toner', 'ink'],
      'marker-levels': [-3, 80, 55],
      'marker-high-levels': [100, 100, 0],
      'marker-low-levels': [5, 0, 10],
    });
    expect(supplies).toEqual([
      expect.objectContaining({
        kind: 'toner',
        level: null,
        partial: true,
        colorant: 'black',
        consumed: true,
      }),
      expect.objectContaining({ kind: 'waste', level: 80, consumed: false }),
      expect.objectContaining({ kind: 'ink', level: 55, colorant: 'light-cyan', lowLevel: 10 }),
    ]);
  });

  it('treats an entry with neither level nor type as no supply, and keeps counts apart', () => {
    expect(readSupplies({ 'printer-supply': ['garbage'] })).toEqual([]);
    const lonely = readSupplies({
      'printer-supply': ['type=toner;level=50;maxcapacity=100;colorantname=unknown;'],
      'marker-names': ['A', 'B'],
    });
    expect(lonely).toHaveLength(1);
    expect(lonely[0]).toMatchObject({ colour: null, lowLevel: null, level: 50, colorant: null });
  });

  it('tolerates entries with a missing type, a level past 100, a text level or an odd colorant', () => {
    const supplies = readSupplies({
      'printer-supply': [
        'level=50;',
        'type=toner;level=150;',
        'type=toner;level=abc;maxcapacity=100;',
        'type=ink;level=10;maxcapacity=100;colorantname=custom-dye;',
      ],
      'printer-supply-description': ['', '', '', 'Yellow cartridge'],
    });
    expect(supplies.map((supply) => [supply.kind, supply.level, supply.colorant])).toEqual([
      ['other', 50, null],
      ['toner', null, null],
      ['toner', null, null],
      ['ink', 10, 'yellow'],
    ]);
  });

  it('maps free text to colorants and kinds', () => {
    expect(colorantOf('Photo Black Cartridge')).toBe('black');
    expect(colorantOf('Light Magenta')).toBe('light-magenta');
    expect(colorantOf('light-black')).toBe('light-black');
    expect(colorantOf('dark_gray')).toBe('dark-gray');
    expect(colorantOf('light--cyan')).toBe('light-cyan');
    expect(colorantOf('Fuser kit')).toBeNull();
    expect(supplyKindOf('wasteToner')).toBe('waste');
    expect(supplyKindOf('opc')).toBe('drum');
    expect(supplyKindOf('inkCartridge')).toBe('ink');
    expect(supplyKindOf('cleanerUnit')).toBe('cleaner');
    expect(supplyKindOf('mystery')).toBe('other');
  });

  it('reads input and output trays, status bits and partial levels', () => {
    const trays = readTrays({
      'printer-input-tray': [
        'type=sheetFeedAutoRemovableTray;maxcapacity=250;level=125;status=0;name=main;medianame=iso_a4_210x297mm;mediatype=stationery',
        'type=sheetFeedManual;maxcapacity=1;level=-3;status=4;name=manual',
        'type=x;maxcapacity=0;level=0;status=0',
      ],
      'printer-output-tray':
        'type=unRemovableBin;maxcapacity=100;remaining=100;status=0;name=face-down',
    });
    expect(trays.input).toEqual([
      expect.objectContaining({
        name: 'main',
        level: 50,
        capacity: 250,
        ok: true,
        mediaName: 'iso_a4_210x297mm',
        mediaType: 'stationery',
      }),
      expect.objectContaining({ name: 'manual', level: null, partial: true, ok: false }),
      expect.objectContaining({ name: 'tray 3', level: null, capacity: null }),
    ]);
    const bare = readTrays({ 'printer-input-tray': 'name=bare' }).input[0];
    expect(bare).toMatchObject({ ok: true, capacity: null, level: null });
    expect(trays.output).toEqual([expect.objectContaining({ name: 'face-down', level: 100 })]);
  });

  it('reads alerts, drops the placeholder and maps severities', () => {
    const alerts = readAlerts({
      'printer-alert': [
        'code=coverOpen;severity=critical;group=cover;groupindex=1;time=100',
        'code=lowPaper;severity=warningBinaryChangeEvent;group=input',
        'code=powerUp;severity=other',
        'code=other',
        'severity=critical',
      ],
      'printer-alert-description': ['Cover is open'],
    });
    expect(alerts).toEqual([
      {
        code: 'coverOpen',
        severity: 'critical',
        group: 'cover',
        groupIndex: 1,
        description: 'Cover is open',
        time: 100,
      },
      {
        code: 'lowPaper',
        severity: 'warning',
        group: 'input',
        groupIndex: null,
        description: null,
        time: null,
      },
      {
        code: 'powerUp',
        severity: 'report',
        group: null,
        groupIndex: null,
        description: null,
        time: null,
      },
    ]);
    expect(readAlerts({ 'printer-alert': 'code=jam;severity=warning' })[0]?.severity).toBe(
      'warning',
    );
  });

  it('reads the state, reasons, counters, messages and clock of a busy printer', () => {
    const status = readStatus({
      'printer-state': 5,
      'printer-state-reasons': ['media-jam-error', 'none'],
      'printer-state-message': '',
      'printer-is-accepting-jobs': false,
      'queued-job-count': 3,
      'printer-up-time': 1000,
      'printer-current-time': '2026-10-18T05:35:26.000Z',
      'printer-state-change-time': 900,
      'printer-config-change-time': 10,
      'marker-change-time': 20,
      'media-ready': 'iso_a4_210x297mm',
      'printer-pages-completed': 1200,
      'printer-impressions-completed': 1300,
      'printer-media-sheets-completed': 1100,
      'printer-impressions-completed-col': { monochrome: 1000, 'full-color': 300 },
      'printer-message-from-operator': 'Out of order',
      'printer-detailed-status-messages': ['', 'Jam in rear'],
      'printer-location': null,
    });
    expect(status).toMatchObject({
      state: 'stopped',
      reasons: ['media-jam-error'],
      message: null,
      accepting: false,
      queuedJobs: 3,
      upTime: 1000,
      stateChangeTime: 900,
      configChangeTime: 10,
      markerChangeTime: 20,
      mediaReady: ['iso_a4_210x297mm'],
      operatorMessage: 'Out of order',
      detailedMessages: ['Jam in rear'],
      counters: { pages: 1200, impressions: 1300, sheets: 1100, color: 300, mono: 1000 },
    });
  });

  it('survives optional attributes of the wrong type but not a missing printer-state', () => {
    expect(readStatus({ 'printer-state': 3, 'queued-job-count': 'many' }).queuedJobs).toBeNull();
    expect(() => readStatus({ 'printer-state': 9 })).toThrow(IppReadError);
    expect(() => readStatus({})).toThrow();
  });

  it('reads the raster types and resolutions a printer accepts', () => {
    const raster = readDescription({
      'printer-state': 3,
      'pwg-raster-document-type-supported': ['black_1', 'sgray_8'],
      'pwg-raster-document-resolution-supported': [
        { x: 300, y: 300, units: 'dpi' },
        { x: 600, y: 600, units: 'dpi' },
      ],
    });
    expect(raster.capabilities.rasterTypes).toEqual(['black_1', 'sgray_8']);
    expect(raster.capabilities.rasterResolutions).toEqual([300, 600]);
    expect(raster.capabilities.rasterSheetBack).toBe('normal');
  });

  it('reads how a printer wants the back side of a duplex raster', () => {
    const back = (value: string): string =>
      readDescription({ 'printer-state': 3, 'pwg-raster-document-sheet-back': value }).capabilities
        .rasterSheetBack;
    expect(back('flipped')).toBe('flipped');
    expect(back('manual-tumble')).toBe('manual-tumble');
    expect(back('nonsense')).toBe('normal');
  });

  it('reads a serial number from the device id and a priority range', () => {
    const description = readDescription({
      'printer-state': 3,
      'printer-device-id': 'MANUFACTURER:ACME;MODEL:Jet 5;SN:ABC123;CMD:PWG;',
      'job-priority-supported': 1,
      'printer-uuid': 'urn:uuid:ABCDEF',
      'finishings-supported': [3, 4],
      'job-hold-until-supported': ['no-hold'],
    });
    expect(description.identity).toMatchObject({
      manufacturer: 'ACME',
      model: 'Jet 5',
      serial: 'ABC123',
      uuid: 'abcdef',
    });
    expect(description.capabilities.priorities).toEqual({ lower: 1, upper: 1 });
    expect(description.capabilities.finishings).toEqual([4]);
    const ranged = readDescription({
      'printer-state': 3,
      'job-priority-supported': { lower: 1, upper: 100 },
      'printer-serial-number': 'SN-1',
    });
    expect(ranged.capabilities.priorities).toEqual({ lower: 1, upper: 100 });
    expect(ranged.identity.serial).toBe('SN-1');
    expect(readDescription({ 'printer-state': 3 }).capabilities.priorities).toBeNull();
    expect(readDescription({ 'printer-state': 3 }).identity.manufacturer).toBeNull();
  });
});

describe('jobs and notifications', () => {
  const base = {
    'job-id': 12,
    'job-state': 5,
    'job-uuid': 'urn:uuid:aa',
    'job-name': 'Report',
    'job-originating-user-name': 'anna',
    'job-state-reasons': ['job-printing', 'none'],
    'job-state-message': 'Printing',
    'time-at-creation': 10,
    'time-at-processing': 11,
    'time-at-completed': null,
    'date-time-at-creation': '2026-10-18T05:00:00.000Z',
    'job-impressions': 6,
    'job-impressions-completed': 2,
    'job-media-sheets': 3,
    'job-media-sheets-completed': 1,
    'job-media-progress': 30,
    'job-k-octets': 120,
    copies: 1,
    'document-format-supplied': 'application/pdf',
    'number-of-intervening-jobs': 0,
    'job-printer-up-time': 99,
    'job-impressions-completed-col': { monochrome: 2 },
  };

  it('reads a processing job with progress and colour counters', () => {
    expect(readJob(base)).toMatchObject({
      id: 12,
      uuid: 'aa',
      name: 'Report',
      user: 'anna',
      state: 'processing',
      reasons: ['job-printing'],
      startedAt: 11,
      completedAt: null,
      createdDate: '2026-10-18T05:00:00.000Z',
      impressions: 6,
      impressionsDone: 2,
      sheets: 3,
      sheetsDone: 1,
      progress: 30,
      mono: 2,
      color: null,
    });
  });

  it('maps every job state and skips jobs it cannot read', () => {
    const states = [3, 4, 5, 6, 7, 8, 9].map(
      (state) => readJob({ 'job-id': 1, 'job-state': state })?.state,
    );
    expect(states).toEqual([
      'pending',
      'held',
      'processing',
      'stopped',
      'canceled',
      'aborted',
      'completed',
    ]);
    expect(readJob({ 'job-id': 1, 'job-state': 42 })).toBeNull();
    expect(
      readJob({
        'job-id': 1,
        'job-state': 6,
        'job-printer-state-reasons': ['media-jam-error', 'none'],
      })?.printerReasons,
    ).toEqual(['media-jam-error']);
    expect(readJob({ 'job-id': 1, 'job-state': 6 })?.printerReasons).toEqual([]);
    expect(readJob({ 'job-state': 3 })).toBeNull();
    expect(readJobs([base, { 'job-state': 3 }, { 'job-id': 2, 'job-state': 9 }])).toHaveLength(2);
  });

  it('reads a subscription grant and an event, ignoring broken groups', () => {
    expect(readGrant({ 'notify-subscription-id': 4, 'notify-lease-duration': 3600 })).toEqual({
      id: 4,
      leaseSeconds: 3600,
    });
    expect(readGrant({ 'notify-subscription-id': 4 })).toEqual({ id: 4, leaseSeconds: null });
    expect(readGrant({})).toBeNull();
    expect(
      readEvent({
        'notify-sequence-number': 8,
        'notify-subscribed-event': 'printer-state-changed',
        'printer-state': 5,
        'printer-state-reasons': ['none', 'media-jam-error'],
        'printer-is-accepting-jobs': true,
        'job-id': 3,
        'job-state': 9,
        'notify-text': 'jam',
      }),
    ).toEqual({
      sequence: 8,
      events: ['printer-state-changed'],
      state: 5,
      reasons: ['media-jam-error'],
      accepting: true,
      jobId: 3,
      jobState: 9,
      text: 'jam',
    });
    expect(readEvent({ 'notify-sequence-number': 1 })).toMatchObject({
      events: [],
      state: null,
      jobId: null,
    });
    expect(readEvent({})).toBeNull();
  });
});

describe('responses', () => {
  const ok = encodeMessage({
    major: 2,
    minor: 0,
    code: 0x0507,
    requestId: 3,
    groups: [
      {
        tag: GROUP_TAG.operation,
        attributes: [attribute('status-message', ipp.text('printer is busy'))],
      },
      { tag: GROUP_TAG.printer, attributes: [attribute('printer-state', ipp.enumeration(3))] },
      { tag: GROUP_TAG.job, attributes: [attribute('job-id', ipp.integer(1))] },
      {
        tag: GROUP_TAG.subscription,
        attributes: [attribute('notify-subscription-id', ipp.integer(2))],
      },
      {
        tag: GROUP_TAG.eventNotification,
        attributes: [attribute('notify-sequence-number', ipp.integer(5))],
      },
      { tag: GROUP_TAG.unsupported, attributes: [attribute('media', ipp.keyword('x'))] },
    ],
    data: new Uint8Array(0),
  });

  it('exposes each group and the status message', () => {
    const response = parseResponse(ok);
    expect(response).toMatchObject({
      status: 0x0507,
      requestId: 3,
      major: 2,
      minor: 0,
      statusMessage: 'printer is busy',
    });
    expect(response.printer).toHaveLength(1);
    expect(response.jobs[0]).toEqual({ 'job-id': 1 });
    expect(response.subscriptions).toHaveLength(1);
    expect(response.events).toHaveLength(1);
    expect(response.unsupported).toHaveLength(1);
  });

  it('names the operation, the status and the printer text when refused', () => {
    expect(() => requireSuccess(0x000b, parseResponse(ok))).toThrow(
      /getPrinterAttributes was refused with busy \(0x0507\): printer is busy/u,
    );
  });

  it('accepts ok-ignored statuses and reports unknown codes by number', () => {
    const lenient = parseResponse(
      encodeMessage({
        major: 1,
        minor: 1,
        code: 1,
        requestId: 1,
        groups: [],
        data: new Uint8Array(0),
      }),
    );
    expect(requireSuccess(0x0004, lenient).statusMessage).toBeNull();
    const odd = parseResponse(
      encodeMessage({
        major: 1,
        minor: 1,
        code: 0x0abc,
        requestId: 1,
        groups: [],
        data: new Uint8Array(0),
      }),
    );
    expect(() => requireSuccess(0x7777, odd)).toThrow(
      /operation 0x7777 was refused with status 0x0abc \(0x0abc\)$/u,
    );
  });

  it('turns attributes into plain objects', () => {
    expect(
      plainObject([attribute('a', ipp.integer(1), ipp.integer(2)), attribute('b', ipp.text('x'))]),
    ).toEqual({ a: [1, 2], b: 'x' });
  });
});
