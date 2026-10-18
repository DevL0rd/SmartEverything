import type { PluginPermissions } from '@smarteverything/domain';

const BWRAP = '/usr/bin/bwrap';

export interface SandboxPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly home: string;
  readonly data: string;
  readonly permissions: PluginPermissions;
}

export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
}

function dataBinds(plan: SandboxPlan): readonly string[] {
  return plan.permissions.files === 'own' ? ['--bind', plan.data, plan.data] : [];
}

export function sandboxed(plan: SandboxPlan): Launch {
  return {
    command: BWRAP,
    args: [
      '--ro-bind',
      '/',
      '/',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--tmpfs',
      '/tmp',
      '--tmpfs',
      plan.home,
      '--ro-bind',
      plan.cwd,
      plan.cwd,
      ...dataBinds(plan),
      ...(plan.permissions.network ? [] : ['--unshare-net']),
      '--unshare-pid',
      '--die-with-parent',
      '--new-session',
      '--chdir',
      plan.cwd,
      '--',
      plan.command,
      ...plan.args,
    ],
  };
}
