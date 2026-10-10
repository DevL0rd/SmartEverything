import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { helperCommand, type LinkLaunch } from './link-launch';

const CONTROLLER_FOLDER = 'controller';

const HOLD_SECONDS = 604_800;

export function controllerFolder(directory: string): string {
  return join(directory, CONTROLLER_FOLDER);
}

function controllerSettings(launch: LinkLaunch): Readonly<Record<string, unknown>> {
  const group = (subcommand: string, timeout: number): Record<string, unknown> => ({
    hooks: [{ type: 'command', command: helperCommand(launch, subcommand), timeout }],
  });
  return {
    hooks: {
      UserPromptSubmit: [group('hook', 30)],
      Stop: [group('hook', HOLD_SECONDS)],
      PreToolUse: [{ matcher: '', ...group('floor', 10) }],
    },
  };
}

export async function writeControllerFolder(
  directory: string,
  launch: LinkLaunch,
): Promise<string> {
  const folder = controllerFolder(directory);
  const path = join(folder, '.claude', 'settings.json');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, `${JSON.stringify(controllerSettings(launch), null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(`${path}.tmp`, path);
  return folder;
}
