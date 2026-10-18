import type { ServiceChange, ServiceRow, ServicesState, TimerRow } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

const BLOCKED_UNITS: readonly RegExp[] = [
  /^smarteverything/,
  /^pipewire/,
  /^wireplumber/,
  /^dbus/,
  /^systemd-/,
  /^plasma-/,
  /^kwin/,
  /^graphical-session/,
  /^xdg-desktop-portal/,
  /^xdg-document-portal/,
  /^gpg-agent/,
];

const UNITS = z.array(
  z.object({ unit: z.string(), load: z.string(), active: z.string(), description: z.string() }),
);

const UNIT_FILES = z.array(z.object({ unit_file: z.string(), state: z.string() }));

const TIMERS = z.array(
  z.object({
    unit: z.string(),
    activates: z.string(),
    next: z.number().nullable(),
    last: z.number().nullable(),
  }),
);

const SERVICE_STATES: Readonly<Record<string, ServiceRow['state']>> = {
  active: 'active',
  inactive: 'inactive',
  failed: 'failed',
  activating: 'activating',
};

const LOGIN_STATES: Readonly<Record<string, boolean>> = {
  enabled: true,
  'enabled-runtime': true,
  alias: true,
  disabled: false,
};

const SHOWN_NOWHERE: ReadonlySet<string> = new Set(['transient']);

const LISTING = ['--type=service', '--all', '--output=json', '--no-pager'];

function isoOf(microseconds: number | null): string | null {
  return microseconds === null || microseconds <= 0
    ? null
    : new Date(microseconds / 1000).toISOString();
}

export function isBlockedUnit(unit: string): boolean {
  return BLOCKED_UNITS.some((pattern) => pattern.test(unit));
}

function sameUnit(unit: string, wanted: string): boolean {
  const lower = wanted.toLowerCase();
  return unit.toLowerCase() === lower || unit.toLowerCase() === `${lower}.service`;
}

export class SystemdUser {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
  ) {}

  supported(): Promise<boolean> {
    return this.probe.available('systemctl', ['--user', '--version']);
  }

  async list(): Promise<ServicesState> {
    if (!(await this.supported())) {
      return { services: [], timers: [] };
    }
    const [mine, system, timers] = await Promise.all([
      this.userServices(),
      this.systemServices(),
      this.timers(),
    ]);
    return { services: [...mine, ...system], timers: [...timers] };
  }

  async set(change: ServiceChange): Promise<void> {
    const { services } = await this.list();
    const found = services.find((service) => sameUnit(service.unit, change.unit));
    if (found === undefined) {
      throw new NodeFailureError(
        'not_found',
        `This computer has no service called ${change.unit}.`,
      );
    }
    if (found.system) {
      throw new NodeFailureError(
        'not_permitted',
        `${found.unit} is a system service; only your own services can be changed here.`,
      );
    }
    if (isBlockedUnit(found.unit)) {
      throw new NodeFailureError(
        'blocked',
        `${found.unit} keeps SmartEverything or the desktop running and cannot be changed from here.`,
      );
    }
    await this.run('systemctl', ['--user', change.operation, found.unit]);
  }

  private async userServices(): Promise<readonly ServiceRow[]> {
    const [units, files] = await Promise.all([
      this.run('systemctl', ['--user', 'list-units', ...LISTING]),
      this.run('systemctl', [
        '--user',
        'list-unit-files',
        '--type=service',
        '--output=json',
        '--no-pager',
      ]),
    ]);
    const fileStates = new Map(
      UNIT_FILES.parse(JSON.parse(files)).map((file) => [file.unit_file, file.state]),
    );
    return UNITS.parse(JSON.parse(units))
      .filter(
        (unit) => unit.load !== 'not-found' && !SHOWN_NOWHERE.has(fileStates.get(unit.unit) ?? ''),
      )
      .map((unit) => ({
        unit: unit.unit,
        description: unit.description,
        state: SERVICE_STATES[unit.active] ?? 'other',
        startsAtLogin: LOGIN_STATES[fileStates.get(unit.unit) ?? ''] ?? null,
        system: false,
      }));
  }

  private async systemServices(): Promise<readonly ServiceRow[]> {
    const units = await this.run('systemctl', ['list-units', ...LISTING]).then(
      (output) => UNITS.parse(JSON.parse(output)),
      () => [],
    );
    return units
      .filter((unit) => unit.load === 'loaded')
      .map((unit) => ({
        unit: unit.unit,
        description: unit.description,
        state: SERVICE_STATES[unit.active] ?? 'other',
        startsAtLogin: null,
        system: true,
      }));
  }

  private async timers(): Promise<readonly TimerRow[]> {
    const output = await this.run('systemctl', [
      '--user',
      'list-timers',
      '--all',
      '--output=json',
      '--no-pager',
    ]);
    return TIMERS.parse(JSON.parse(output)).map((timer) => ({
      unit: timer.unit,
      description: timer.activates,
      nextRunAt: isoOf(timer.next),
      lastRunAt: isoOf(timer.last),
    }));
  }
}
