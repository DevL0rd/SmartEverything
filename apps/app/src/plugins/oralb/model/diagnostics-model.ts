import type { BrushView, OralbProbe, OralbSettings } from '@smarteverything/domain';
import { ORALB_PROBES } from '@smarteverything/domain';
import { probeStatus, type ProbeStatus } from './settings-model';

type DiagnosticsView = Extract<BrushView, { readonly view: 'diagnostics' }>;

export type OralbDiagnostics = Extract<DiagnosticsView['brand'], { readonly brand: 'oralb' }>;

export interface ProbeText {
  readonly title: string;
  readonly writes: string;
  readonly bytes: string | null;
  readonly detail: string;
}

export const PROBE_TEXT: Readonly<Record<OralbProbe, ProbeText>> = {
  advert_log: {
    title: 'Broadcast check',
    writes: 'writes nothing',
    bytes: null,
    detail: 'Checks that the handle is heard brushing while no phone is connected to it.',
  },
  connect_dump: {
    title: 'Read everything once',
    writes: 'writes nothing',
    bytes: null,
    detail: 'Connects, reads what the handle offers and disconnects.',
  },
  history_select: {
    title: 'Read an older session',
    writes: 'writes one select byte',
    bytes: '02 01 to the control point FF21, then reads the session record FF29',
    detail:
      'Asks the handle for its newest stored session. It does not change anything on the handle.',
  },
  metadata_select: {
    title: 'Read the handle details',
    writes: 'writes one select byte',
    bytes: '05 FF to the control point FF21, then reads the record FF29',
    detail: 'Asks the handle for its own description. It does not change anything on the handle.',
  },
  pacer_write: {
    title: 'Pacer write',
    writes: 'writes the current value back',
    bytes:
      'the pacer schedule as read, to FF26 (control byte 37 2A first, then without if refused)',
    detail: 'Writes the same schedule the handle already has and checks it reads back equal.',
  },
  mode_order_write: {
    title: 'Mode order write',
    writes: 'writes the current value back',
    bytes: 'the mode slots as read, to FF25 (control byte 37 29 first, then without if refused)',
    detail: 'Writes the same mode order the handle already has and checks it reads back equal.',
  },
  ring_write: {
    title: 'SmartRing colour write',
    writes: 'writes the current value back',
    bytes:
      'the ring colour as read, then one other colour, then the first again, to FF2B (control byte 37 2F first, then without if refused)',
    detail: 'The ring changes colour for a moment and returns to the colour it had.',
  },
  head_reset_write: {
    title: 'Head reminder write',
    writes: 'writes the current value back',
    bytes: 'the head reminder as read, to FF2D (no control byte). It never resets the countdown',
    detail: 'Writes the same reading the handle already has and checks it reads back equal.',
  },
  clock_write: {
    title: 'Clock write',
    writes: 'writes the current value back',
    bytes:
      'the handle clock as read plus the time since, to FF22 (control byte 37 26 first, then without if refused)',
    detail: 'Sets the handle clock to the time it already shows. It is not read back, it ticks.',
  },
};

export interface ProbeRow {
  readonly probe: OralbProbe;
  readonly text: ProbeText;
  readonly status: ProbeStatus;
  readonly again: boolean;
}

export function probeRows(
  settings: Pick<OralbSettings, 'probes'>,
  firmware: number | null,
): readonly ProbeRow[] {
  return ORALB_PROBES.map((probe) => {
    const status = probeStatus(settings, probe, firmware);
    return { probe, text: PROBE_TEXT[probe], status, again: status !== 'none' };
  });
}

export function testsLine(
  settings: Pick<OralbSettings, 'probes'>,
  firmware: number | null,
): string {
  const passed = ORALB_PROBES.filter(
    (probe) => probeStatus(settings, probe, firmware) === 'passed',
  );
  return `Handle tests: ${String(passed.length)} of ${String(ORALB_PROBES.length)} run`;
}

export const STATUS_WORD: Readonly<Record<ProbeStatus, string>> = {
  passed: 'Passed',
  failed: 'Failed',
  stale: 'Run again',
  none: 'Not run',
};

export function confirmText(probe: OralbProbe): { readonly title: string; readonly body: string } {
  const text = PROBE_TEXT[probe];
  const bytes = text.bytes === null ? 'It sends nothing to the handle.' : `It sends ${text.bytes}.`;
  return {
    title: `Run the test “${text.title}”?`,
    body: `This test ${text.writes}. ${bytes} The Oral-B app must be closed. Nothing runs while the brush is in use.`,
  };
}

export function recordLines(records: OralbDiagnostics['records']): string {
  return records.map((record) => `${record.at.slice(11, 19)}  ${record.hex}`).join('\n');
}

export function identityRows(brand: OralbDiagnostics): readonly (readonly [string, string])[] {
  const { identity } = brand;
  return [
    ['Protocol', String(identity.protocol)],
    ['Model id', `0x${identity.modelId.toString(16).padStart(2, '0')}`],
    ['Firmware', String(identity.firmware)],
    ['Bluetooth name', identity.gapName ?? 'Not read'],
    ['Characteristics', identity.present.length === 0 ? 'None read' : identity.present.join(', ')],
    [
      'Battery reading',
      identity.ff05Length === null
        ? 'Not on this firmware'
        : `${String(identity.ff05Length)} bytes`,
    ],
    [
      'Force reading',
      identity.ff0bLength === null
        ? 'Not on this firmware'
        : `${String(identity.ff0bLength)} bytes`,
    ],
    ['Last advert', identity.advertHex],
  ];
}

export function brandRows(brand: OralbDiagnostics): readonly (readonly [string, string])[] {
  const bands = brand.forceBands;
  const baseline = brand.headBaseline;
  return [
    [
      'Live source',
      brand.liveSource === null
        ? 'None right now'
        : brand.liveSource === 'link'
          ? 'Connected'
          : 'Broadcast',
    ],
    [
      'Broadcast interval',
      brand.advertIntervalMs === null
        ? 'Not measured'
        : `${String(Math.round(brand.advertIntervalMs))} ms`,
    ],
    ['Background filter', brand.filterRegistered ? 'Registered' : 'Not registered'],
    [
      'Pressure bands',
      bands === null ? 'Still learning' : `Learned from ${String(bands.samples)} readings`,
    ],
    ['Head countdown start', baseline === null ? 'Not set' : `${String(baseline.days)} days`],
  ];
}
