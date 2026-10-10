export type Fields = Readonly<Record<string, string>>;

export interface InterfaceCounters {
  readonly rx: number;
  readonly tx: number;
}

export interface CollectOutput {
  readonly values: ReadonlyMap<string, string>;
  readonly cpuTimes: ReadonlyMap<string, readonly number[]>;
  readonly interfaces: ReadonlyMap<string, InterfaceCounters>;
  readonly ports: readonly { readonly port: string; readonly link: string }[];
  readonly radios: readonly Fields[];
  readonly radioSettings: readonly Fields[];
  readonly radioCounts: readonly Fields[];
  readonly stations: readonly Fields[];
  readonly stationSignals: readonly Fields[];
  readonly leases: readonly Fields[];
  readonly reachableMacs: readonly string[];
  readonly blockedMacs: readonly string[];
}

interface MutableOutput {
  values: Map<string, string>;
  cpuTimes: Map<string, number[]>;
  interfaces: Map<string, InterfaceCounters>;
  ports: { port: string; link: string }[];
  radios: Fields[];
  radioSettings: Fields[];
  radioCounts: Fields[];
  stations: Fields[];
  stationSignals: Fields[];
  leases: Fields[];
  reachableMacs: string[];
  blockedMacs: string[];
}

export class CollectParseError extends Error {
  override readonly name = 'CollectParseError';
}

const COLLECT_END_MARKER = 'END=1';

type LineHandler = (output: MutableOutput, rest: string) => void;

const FIELD_LISTS = {
  'RADIO ': 'radios',
  'RSTATIC ': 'radioSettings',
  'RCOUNT ': 'radioCounts',
  'STA ': 'stations',
  'STASLOW ': 'stationSignals',
  'LEASE ': 'leases',
} as const;

const HANDLERS: readonly (readonly [string, LineHandler])[] = [
  ['STAT ', addCpuTimes],
  ['IF ', addInterface],
  ['PORT ', addPort],
  ['ARP ', addArp],
  ['BLOCKED ', addBlocked],
  ...Object.entries(FIELD_LISTS).map(([prefix, list]): readonly [string, LineHandler] => [
    prefix,
    (output, rest): void => {
      output[list].push(parseFields(rest));
    },
  ]),
];

export function parseCollectOutput(raw: string): CollectOutput {
  if (!raw.split('\n').some((line) => line.trim() === COLLECT_END_MARKER)) {
    throw new CollectParseError('The router sent an incomplete reply');
  }
  const output = emptyOutput();
  for (const line of raw.split('\n')) {
    parseLine(output, line.trimEnd());
  }
  return output;
}

export function parseFields(text: string): Fields {
  const fields: Record<string, string> = {};
  let lastKey: string | null = null;
  for (const token of text.split(/\s+/).filter((part) => part.length > 0)) {
    const separator = token.indexOf('=');
    if (separator > 0) {
      lastKey = token.slice(0, separator);
      fields[lastKey] = token.slice(separator + 1);
    } else if (lastKey !== null) {
      fields[lastKey] = `${fields[lastKey] ?? ''} ${token}`;
    }
  }
  return fields;
}

function parseLine(output: MutableOutput, line: string): void {
  if (line.length === 0) {
    return;
  }
  const handler = HANDLERS.find(([prefix]) => line.startsWith(prefix));
  if (handler !== undefined) {
    handler[1](output, line.slice(handler[0].length));
    return;
  }
  const separator = line.indexOf('=');
  if (separator > 0) {
    output.values.set(line.slice(0, separator), line.slice(separator + 1));
  }
}

function emptyOutput(): MutableOutput {
  return {
    values: new Map(),
    cpuTimes: new Map(),
    interfaces: new Map(),
    ports: [],
    radios: [],
    radioSettings: [],
    radioCounts: [],
    stations: [],
    stationSignals: [],
    leases: [],
    reachableMacs: [],
    blockedMacs: [],
  };
}

function addCpuTimes(output: MutableOutput, rest: string): void {
  const [name, ...times] = rest.split(/\s+/);
  if (name === undefined || name.length === 0) {
    return;
  }
  output.cpuTimes.set(name, times.filter((time) => time.length > 0).map(Number));
}

function addInterface(output: MutableOutput, rest: string): void {
  const [name, rx, tx] = rest.split(/\s+/);
  if (name === undefined || rx === undefined || tx === undefined) {
    return;
  }
  output.interfaces.set(name, { rx: Number(rx), tx: Number(tx) });
}

function addPort(output: MutableOutput, rest: string): void {
  const separator = rest.indexOf(' ');
  if (separator > 0) {
    output.ports.push({ port: rest.slice(0, separator), link: rest.slice(separator + 1).trim() });
  }
}

function addArp(output: MutableOutput, rest: string): void {
  const [mac, flags] = rest.split(/\s+/);
  if (mac !== undefined && flags !== undefined && flags !== '0x0') {
    output.reachableMacs.push(mac.toLowerCase());
  }
}

function addBlocked(output: MutableOutput, rest: string): void {
  const mac = rest.trim();
  if (mac.length > 0) {
    output.blockedMacs.push(mac.toLowerCase());
  }
}
