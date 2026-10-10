import { dirname, join } from 'node:path';
import { argv, execPath } from 'node:process';

const HELPER_FILE = 'hook-helper.mjs';

export interface LinkLaunch {
  readonly command: string;
  readonly script: string;
  readonly dataDirectory: string;
}

export function linkLaunchOf(dataDirectory: string): LinkLaunch {
  return {
    command: execPath,
    script: join(dirname(argv[1] ?? ''), HELPER_FILE),
    dataDirectory,
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
    '--data',
    quoted(launch.dataDirectory),
  ].join(' ');
}
