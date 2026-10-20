import {
  encodedPowerShell,
  firewallScript,
  firewallSteps,
  reportScript,
  stepResultOf,
  stepResultsOf,
  type DesktopPlatform,
  type FirewallPlan,
  type FirewallStep,
  type FirewallStepResult,
} from '@smarteverything/domain';

export interface ElevatedRun {
  readonly program: string;
  readonly args: readonly string[];
  readonly steps: readonly FirewallStep[];
  readonly declinedWhen: (exitCode: number | null, output: string) => boolean;
  readonly resultsOf: (stdout: string) => FirewallStepResult[];
}

const PKEXEC_DISMISSED = 126;
const PKEXEC_ERROR = 127;
const PKEXEC_NOT_AUTHORIZED = /not authorized/iu;
const WINDOWS_CANCELLED = 1223;
const APPLESCRIPT_CANCELLED = '(-128)';

class PlanPlatformError extends Error {
  constructor(backend: string, platform: DesktopPlatform) {
    super(
      `a ${backend} firewall plan is applied on its own platform; this desktop runs ${platform}`,
    );
    this.name = 'PlanPlatformError';
  }
}

const PLAN_PLATFORM: Readonly<Record<FirewallPlan['backend'], DesktopPlatform>> = {
  ufw: 'linux',
  firewalld: 'linux',
  sysctl: 'linux',
  windows: 'win32',
  macos: 'darwin',
};

const MAC_RUN_SCRIPT_AS_ADMINISTRATOR = [
  'on run argv',
  '  do shell script (item 1 of argv) with administrator privileges',
  'end run',
];

function linuxRun(steps: readonly FirewallStep[]): ElevatedRun {
  return {
    program: 'pkexec',
    args: ['/bin/sh', '-c', reportScript(steps)],
    steps,
    declinedWhen: (exitCode, output) =>
      exitCode === PKEXEC_DISMISSED ||
      (exitCode === PKEXEC_ERROR && PKEXEC_NOT_AUTHORIZED.test(output)),
    resultsOf: (stdout) => stepResultsOf(steps, stdout),
  };
}

function windowsRun(steps: readonly FirewallStep[], lines: readonly string[]): ElevatedRun {
  const inner = encodedPowerShell(["$ErrorActionPreference = 'Stop'", ...lines].join('\n'));
  const outer = [
    'try {',
    `  $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${inner}'`,
    '  exit $process.ExitCode',
    '} catch {',
    '  $cause = $_.Exception',
    '  while ($null -ne $cause) {',
    `    if ($cause -is [System.ComponentModel.Win32Exception] -and $cause.NativeErrorCode -eq ${String(WINDOWS_CANCELLED)}) { exit ${String(WINDOWS_CANCELLED)} }`,
    '    $cause = $cause.InnerException',
    '  }',
    '  throw',
    '}',
  ].join('\n');
  return {
    program: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedPowerShell(outer)],
    steps,
    declinedWhen: (exitCode) => exitCode === WINDOWS_CANCELLED,
    resultsOf: () => steps.map((step) => stepResultOf(step, 0, '')),
  };
}

function macRun(steps: readonly FirewallStep[]): ElevatedRun {
  return {
    program: 'osascript',
    args: [...MAC_RUN_SCRIPT_AS_ADMINISTRATOR.flatMap((line) => ['-e', line]), reportScript(steps)],
    steps,
    declinedWhen: (_exitCode, output) => output.includes(APPLESCRIPT_CANCELLED),
    resultsOf: (stdout) => stepResultsOf(steps, stdout),
  };
}

export function elevatedRunOf(plan: FirewallPlan, platform: DesktopPlatform): ElevatedRun {
  if (PLAN_PLATFORM[plan.backend] !== platform) {
    throw new PlanPlatformError(plan.backend, platform);
  }
  const steps = firewallSteps(plan);
  switch (plan.backend) {
    case 'ufw':
    case 'firewalld':
    case 'sysctl':
      return linuxRun(steps);
    case 'windows':
      return windowsRun(steps, firewallScript(plan));
    case 'macos':
      return macRun(steps);
  }
}
