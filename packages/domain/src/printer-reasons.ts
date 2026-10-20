export type ReasonSeverity = 'report' | 'warning' | 'error';

export type PrinterPart =
  | 'cover'
  | 'input-tray'
  | 'cartridge'
  | 'path'
  | 'input-path'
  | 'output-path'
  | 'output'
  | 'waste'
  | 'none';

export interface ReasonSplit {
  readonly base: string;
  readonly suffix: ReasonSeverity | null;
}

const SUFFIXES: readonly ReasonSeverity[] = ['report', 'warning', 'error'];

export function splitReason(keyword: string): ReasonSplit {
  const suffix = SUFFIXES.find((candidate) => keyword.endsWith(`-${candidate}`));
  return suffix === undefined
    ? { base: keyword, suffix: null }
    : { base: keyword.slice(0, -(suffix.length + 1)), suffix };
}

export function reasonSeverity(keyword: string, stopped: boolean): ReasonSeverity {
  const { suffix } = splitReason(keyword);
  if (suffix !== null) return suffix;
  return stopped ? 'error' : 'warning';
}

interface ReasonInfo {
  readonly part: PrinterPart;
  readonly title: string;
  readonly cause: string;
}

const REASON_INFO: Readonly<Record<string, ReasonInfo>> = {
  'cover-open': {
    part: 'cover',
    title: 'Cover open',
    cause: 'A cover or lid is open. Close it to continue.',
  },
  'door-open': {
    part: 'cover',
    title: 'Door open',
    cause: 'A door is open. Close it to continue.',
  },
  'interlock-open': {
    part: 'cover',
    title: 'Cover open',
    cause: 'A safety cover is open. Close it to continue.',
  },
  'media-jam': {
    part: 'path',
    title: 'Paper jam',
    cause: 'Paper is stuck in the paper path. Clear it, then close the covers.',
  },
  'media-path-jam': {
    part: 'path',
    title: 'Paper jam',
    cause: 'Paper is stuck in the paper path. Clear it, then close the covers.',
  },
  'media-path-input-jam': {
    part: 'input-path',
    title: 'Paper jam at the input',
    cause: 'Paper is stuck where it enters the printer. Remove it from the tray side.',
  },
  'media-path-output-jam': {
    part: 'output-path',
    title: 'Paper jam at the output',
    cause: 'Paper is stuck where it leaves the printer. Remove it from the output side.',
  },
  'input-media-tray-jam': {
    part: 'input-tray',
    title: 'Paper jam in the tray',
    cause: 'Paper is stuck in the input tray. Take the tray out and clear it.',
  },
  'output-media-tray-jam': {
    part: 'output',
    title: 'Paper jam in the output tray',
    cause: 'Paper is stuck in the output tray. Clear it.',
  },
  'media-empty': {
    part: 'input-tray',
    title: 'Out of paper',
    cause: 'The paper tray is empty. Load paper to continue.',
  },
  'media-needed': {
    part: 'input-tray',
    title: 'Paper needed',
    cause: 'The printer needs the paper the job asks for. Load it to continue.',
  },
  'media-low': {
    part: 'input-tray',
    title: 'Paper running low',
    cause: 'The paper tray is nearly empty.',
  },
  'media-path-input-empty': {
    part: 'input-tray',
    title: 'Out of paper',
    cause: 'The paper tray is empty. Load paper to continue.',
  },
  'input-tray-missing': {
    part: 'input-tray',
    title: 'Tray missing',
    cause: 'A paper tray is not in the printer. Push it in.',
  },
  'output-area-full': {
    part: 'output',
    title: 'Output tray full',
    cause: 'The output tray is full. Take the pages out.',
  },
  'output-area-almost-full': {
    part: 'output',
    title: 'Output tray almost full',
    cause: 'The output tray is nearly full. Take the pages out soon.',
  },
  'media-path-output-full': {
    part: 'output',
    title: 'Output tray full',
    cause: 'The output tray is full. Take the pages out.',
  },
  'output-tray-missing': {
    part: 'output',
    title: 'Output tray missing',
    cause: 'The output tray is not in the printer.',
  },
  'toner-low': {
    part: 'cartridge',
    title: 'Toner low',
    cause: 'Toner is running low. Have a new cartridge ready.',
  },
  'toner-empty': {
    part: 'cartridge',
    title: 'Toner empty',
    cause: 'Toner has run out. Replace the cartridge to continue.',
  },
  'marker-supply-low': {
    part: 'cartridge',
    title: 'Ink or toner low',
    cause: 'A cartridge is running low. Have a new one ready.',
  },
  'marker-supply-empty': {
    part: 'cartridge',
    title: 'Ink or toner empty',
    cause: 'A cartridge has run out. Replace it to continue.',
  },
  'marker-supply-missing': {
    part: 'cartridge',
    title: 'Cartridge missing',
    cause: 'A cartridge is not installed. Put it back.',
  },
  'marker-ink-almost-empty': {
    part: 'cartridge',
    title: 'Ink low',
    cause: 'A cartridge is almost empty. Have a new one ready.',
  },
  'marker-ink-empty': {
    part: 'cartridge',
    title: 'Ink empty',
    cause: 'A cartridge has run out. Replace it to continue.',
  },
  'marker-ink-missing': {
    part: 'cartridge',
    title: 'Cartridge missing',
    cause: 'An ink cartridge is not installed. Put it back.',
  },
  'marker-toner-missing': {
    part: 'cartridge',
    title: 'Cartridge missing',
    cause: 'A toner cartridge is not installed. Put it back.',
  },
  'marker-toner-cartridge-missing': {
    part: 'cartridge',
    title: 'Cartridge missing',
    cause: 'A toner cartridge is not installed. Put it back.',
  },
  'developer-low': {
    part: 'cartridge',
    title: 'Developer low',
    cause: 'The developer unit is running low.',
  },
  'developer-empty': {
    part: 'cartridge',
    title: 'Developer empty',
    cause: 'The developer unit has run out.',
  },
  'opc-near-eol': {
    part: 'cartridge',
    title: 'Drum nearly worn',
    cause: 'The drum is near the end of its life.',
  },
  'opc-life-over': {
    part: 'cartridge',
    title: 'Drum worn out',
    cause: 'The drum has reached the end of its life. Replace it.',
  },
  'marker-waste-almost-full': {
    part: 'waste',
    title: 'Waste tank almost full',
    cause: 'The waste tank is nearly full. Have a replacement ready.',
  },
  'marker-waste-full': {
    part: 'waste',
    title: 'Waste tank full',
    cause: 'The waste tank is full. Replace or empty it to continue.',
  },
  'marker-waste-ink-receptacle-almost-full': {
    part: 'waste',
    title: 'Waste tank almost full',
    cause: 'The ink waste pad is nearly full. Have it serviced soon.',
  },
  'marker-waste-ink-receptacle-full': {
    part: 'waste',
    title: 'Waste tank full',
    cause: 'The ink waste pad is full. It needs servicing.',
  },
  'marker-waste-toner-receptacle-almost-full': {
    part: 'waste',
    title: 'Waste tank almost full',
    cause: 'The waste toner box is nearly full. Have a replacement ready.',
  },
  'marker-waste-toner-receptacle-full': {
    part: 'waste',
    title: 'Waste tank full',
    cause: 'The waste toner box is full. Replace it.',
  },
  'fuser-over-temp': {
    part: 'none',
    title: 'Fuser too hot',
    cause: 'The fuser is too hot. Let the printer cool down.',
  },
  'fuser-under-temp': {
    part: 'none',
    title: 'Fuser too cold',
    cause: 'The fuser is still warming up.',
  },
  'motor-failure': {
    part: 'none',
    title: 'Motor fault',
    cause: 'A motor reported a fault. Turn the printer off and on.',
  },
  'fan-failure': {
    part: 'none',
    title: 'Fan fault',
    cause: 'A fan reported a fault. Turn the printer off and on.',
  },
  'wifi-not-configured': {
    part: 'none',
    title: 'Wi-Fi not set up',
    cause: 'The printer has no Wi-Fi settings.',
  },
  'spool-area-full': {
    part: 'none',
    title: 'Print memory full',
    cause: 'The printer cannot take more jobs until it finishes some.',
  },
  'timed-out': {
    part: 'none',
    title: 'Timed out',
    cause: 'A job stopped waiting for data and timed out.',
  },
};

const QUIET: ReadonlySet<string> = new Set([
  'none',
  'paused',
  'moving-to-paused',
  'resuming',
  'stopping',
  'stopped-partly',
  'hold-new-jobs',
  'standby',
  'hibernate',
  'suspend',
  'power-up',
  'power-down',
  'shutdown',
  'deactivated',
  'testing',
  'connecting-to-device',
  'printer-ready-to-print',
  'identify-printer-requested',
  'configuration-change',
  'marker-warming-up',
  'marker-adjusting-print-quality',
  'marker-power-saver',
  'warming-up',
  'printer-manual-reset',
  'printer-nms-reset',
]);

const HYPHEN = /-/gu;

function humanise(base: string): string {
  const text = base.replace(HYPHEN, ' ');
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

export interface PrinterProblem {
  readonly keyword: string;
  readonly severity: 'warning' | 'error';
  readonly part: PrinterPart;
  readonly title: string;
  readonly cause: string;
}

export function problemOf(keyword: string, stopped: boolean): PrinterProblem | null {
  const { base } = splitReason(keyword);
  const severity = reasonSeverity(keyword, stopped);
  if (QUIET.has(base) || severity === 'report') return null;
  const known = REASON_INFO[base];
  return {
    keyword,
    severity,
    part: known?.part ?? 'none',
    title: known?.title ?? humanise(base),
    cause: known?.cause ?? 'The printer reported this and gave no more detail. Check its display.',
  };
}

export function problemsOf(
  reasons: readonly string[],
  stopped: boolean,
): readonly PrinterProblem[] {
  const seen = new Set<string>();
  return reasons.flatMap((keyword) => {
    const problem = problemOf(keyword, stopped);
    if (problem === null || seen.has(problem.title)) return [];
    seen.add(problem.title);
    return [problem];
  });
}
