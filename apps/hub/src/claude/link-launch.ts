import { dirname, join } from 'node:path';
import { argv, execPath } from 'node:process';
import type { ClaudeSites } from './sites';

const HELPER_FILE = 'hook-helper.mjs';

export interface LinkLaunch {
  readonly command: string;
  readonly script: string;
  readonly directory: string;
  readonly ready: string;
}

export function linkLaunchOf(sites: Pick<ClaudeSites, 'directory' | 'ready'>): LinkLaunch {
  return {
    command: execPath,
    script: join(dirname(argv[1] ?? ''), HELPER_FILE),
    directory: sites.directory,
    ready: sites.ready,
  };
}

function quoted(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function helperCommand(launch: LinkLaunch, subcommand: string): string {
  return [
    'ELECTRON_RUN_AS_NODE=1',
    quoted(launch.command),
    quoted(launch.script),
    subcommand,
    '--claude',
    quoted(launch.directory),
    '--ready',
    quoted(launch.ready),
  ].join(' ');
}
