import type { AiHarnessHost } from '@smarteverything/domain';

export const OS_NAMES = { linux: 'Linux', windows: 'Windows', macos: 'macOS' } as const;

export function machineLabel(host: AiHarnessHost): string {
  return `${host.name} (${OS_NAMES[host.platform]})`;
}

export function machineChangedNote(input: {
  readonly from: AiHarnessHost;
  readonly to: AiHarnessHost;
  readonly cwd: string;
}): string {
  const confinement =
    input.to.sandbox === 'partial'
      ? ' Its sandbox confines writes only; reads are not confined.'
      : '';
  return `Machine changed: you are now running on ${machineLabel(input.to)}, folder ${input.cwd}.${confinement} Previous machine: ${input.from.name}.`;
}

export function machineChangeFailedNote(input: {
  readonly stay: AiHarnessHost;
  readonly wanted: AiHarnessHost;
  readonly reason: string;
}): string {
  return `Machine change to ${input.wanted.name} failed (${input.reason}). You are still running on ${machineLabel(input.stay)}.`;
}
