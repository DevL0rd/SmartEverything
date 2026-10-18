import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ProgramProbe } from './program-probe';

const PROGRAM = 'ddcutil';
const BRIGHTNESS_CODE = '10';
const PERCENT = 100;
const DISPLAY_HEADER = /^Display (\d+)/;
const CONNECTOR_LINE = /^\s*DRM connector:\s+card\d+-(\S+)/;
const BRIEF_VALUE = /^VCP \S+ C (\d+) (\d+)/;

interface Reading {
  readonly current: number;
  readonly max: number;
}

export function parseDetect(text: string): ReadonlyMap<string, number> {
  const displays = new Map<string, number>();
  let number: number | null = null;
  for (const line of text.split('\n')) {
    const header = DISPLAY_HEADER.exec(line);
    if (header !== null) {
      number = Number(header[1]);
    } else if (line.startsWith('Invalid')) {
      number = null;
    }
    const connector = CONNECTOR_LINE.exec(line)?.[1];
    if (connector !== undefined && number !== null) {
      displays.set(connector, number);
    }
  }
  return displays;
}

export function parseBrief(text: string): Reading {
  const match = BRIEF_VALUE.exec(text.trim());
  if (match === null) {
    throw new NodeFailureError('failed', `ddcutil reported no brightness: ${text.trim()}`);
  }
  return { current: Number(match[1]), max: Number(match[2]) };
}

export class DdcBrightness {
  private detected: Promise<ReadonlyMap<string, number>> | null = null;
  private readonly levels = new Map<string, number>();

  constructor(
    private readonly run: RunProgram,
    private readonly probe: ProgramProbe,
  ) {}

  invalidate(): void {
    this.detected = null;
    this.levels.clear();
  }

  async covers(connector: string): Promise<boolean> {
    return (await this.displays()).has(connector);
  }

  async read(connector: string): Promise<number | null> {
    const known = this.levels.get(connector);
    if (known !== undefined) {
      return known;
    }
    const number = (await this.displays()).get(connector);
    if (number === undefined) {
      return null;
    }
    const level = this.percent(await this.reading(number));
    this.levels.set(connector, level);
    return level;
  }

  async set(connector: string, level: number): Promise<void> {
    const number = (await this.displays()).get(connector);
    if (number === undefined) {
      throw new NodeFailureError('not_supported', `${connector} cannot be dimmed from here.`);
    }
    const { max } = await this.reading(number);
    const raw = Math.round((level / PERCENT) * max);
    await this.run(PROGRAM, ['--display', String(number), 'setvcp', BRIGHTNESS_CODE, String(raw)]);
    this.levels.set(connector, Math.round(level));
  }

  private displays(): Promise<ReadonlyMap<string, number>> {
    this.detected ??= this.detect();
    return this.detected;
  }

  private async detect(): Promise<ReadonlyMap<string, number>> {
    if (!(await this.probe(PROGRAM))) {
      return new Map();
    }
    return parseDetect(await this.run(PROGRAM, ['detect', '--brief']));
  }

  private async reading(number: number): Promise<Reading> {
    return parseBrief(
      await this.run(PROGRAM, ['--display', String(number), 'getvcp', BRIGHTNESS_CODE, '--brief']),
    );
  }

  private percent(reading: Reading): number {
    return reading.max === 0 ? 0 : Math.round((reading.current / reading.max) * PERCENT);
  }
}
