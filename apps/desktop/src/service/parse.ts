import type { DesktopLinger } from '@smarteverything/domain';

export interface SystemdState {
  readonly loadState: string;
  readonly activeState: string;
  readonly subState: string;
  readonly result: string;
}

function propertiesOf(output: string): ReadonlyMap<string, string> {
  const entries = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes('='))
    .map((line): [string, string] => [
      line.slice(0, line.indexOf('=')),
      line.slice(line.indexOf('=') + 1),
    ]);
  return new Map(entries);
}

export function parseSystemdShow(output: string): SystemdState {
  const properties = propertiesOf(output);
  return {
    loadState: properties.get('LoadState') ?? 'unknown',
    activeState: properties.get('ActiveState') ?? 'unknown',
    subState: properties.get('SubState') ?? 'unknown',
    result: properties.get('Result') ?? 'unknown',
  };
}

export function systemdDetail(state: SystemdState): string {
  const base = `systemd reports ${state.activeState} (${state.subState})`;
  return state.result === 'success' || state.result === 'unknown'
    ? base
    : `${base}, last result ${state.result}`;
}

export function launchdRunning(output: string): boolean {
  return /^\s*state = running$/mu.test(output);
}

export function launchdDetail(output: string): string {
  const state = /^\s*state = (.+)$/mu.exec(output)?.[1];
  const exit = /^\s*last exit code = (.+)$/mu.exec(output)?.[1];
  const described = `launchd reports ${state ?? 'no state'}`;
  return exit === undefined ? described : `${described}, last exit code ${exit}`;
}

export class UnexpectedOutputError extends Error {
  readonly received: string;

  constructor(command: string, expected: string, received: string) {
    super(`${command} must answer ${expected}; received ${JSON.stringify(received)}`);
    this.name = 'UnexpectedOutputError';
    this.received = received;
  }
}

export function parseLinger(output: string): DesktopLinger {
  const value = output.trim();
  if (value === 'yes') {
    return 'enabled';
  }
  if (value === 'no') {
    return 'disabled';
  }
  throw new UnexpectedOutputError('loginctl show-user --property=Linger', 'yes or no', value);
}

export function parsePid(text: string | null): number | null {
  if (text === null) {
    return null;
  }
  const value = Number.parseInt(text.trim(), 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}
