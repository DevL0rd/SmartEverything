import { POWER_MODES, type PowerMode, type SystemState } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

type PowerModes = NonNullable<SystemState['powerMode']>;

const PROFILE_OF: Readonly<Record<PowerMode, string>> = {
  power_saver: 'power-saver',
  balanced: 'balanced',
  performance: 'performance',
};

const PROFILE_LINE = /^[* ] ([a-z-]+):\s*$/;

function modeOf(profile: string): PowerMode | null {
  return POWER_MODES.find((mode) => PROFILE_OF[mode] === profile) ?? null;
}

export function parseProfiles(text: string): readonly PowerMode[] {
  return text
    .split('\n')
    .map((line) => modeOf(PROFILE_LINE.exec(line)?.[1] ?? ''))
    .filter((mode) => mode !== null);
}

export class PowerProfiles {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
  ) {}

  supported(): Promise<boolean> {
    return this.probe.available('powerprofilesctl', ['get']);
  }

  async read(): Promise<PowerModes | null> {
    if (!(await this.supported())) {
      return null;
    }
    const offered = parseProfiles(await this.run('powerprofilesctl', ['list']));
    const current = modeOf((await this.run('powerprofilesctl', ['get'])).trim());
    return current === null ? null : { current, offered: [...offered] };
  }

  async set(mode: PowerMode): Promise<void> {
    const modes = await this.read();
    if (modes === null) {
      throw new NodeFailureError('not_supported', 'This computer has no power modes to switch.');
    }
    if (!modes.offered.includes(mode)) {
      throw new NodeFailureError('not_supported', 'This computer does not offer that power mode.');
    }
    await this.run('powerprofilesctl', ['set', PROFILE_OF[mode]]);
  }
}
