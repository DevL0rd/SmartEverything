import type { InstalledApp } from '@smarteverything/domain';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import { orElse, UNREADABLE } from '../linux/fs-fallback';
import { notSupported } from '../portable/unsupported';
import type { AppControl } from '../session-controls';

const APP_SUFFIX = '.app';

function folders(home: string): readonly string[] {
  return [
    '/Applications',
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
    join(home, 'Applications'),
  ];
}

export class DarwinApps implements AppControl {
  constructor(
    private readonly program: RunProgram,
    private readonly home: string = homedir(),
  ) {}

  async installed(): Promise<InstalledApp[]> {
    const found = await Promise.all(
      folders(this.home).map(async (folder) =>
        (await orElse(readdir(folder), [], UNREADABLE))
          .filter((name) => name.endsWith(APP_SUFFIX))
          .map((name) => join(folder, name)),
      ),
    );
    return found
      .flat()
      .map((path) => ({
        id: path,
        name: basename(path, APP_SUFFIX),
        comment: null,
        icon: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async open(appId: string): Promise<void> {
    const known = (await this.installed()).some((app) => app.id === appId);
    if (!known) {
      throw new NodeFailureError('not_found', 'That app is not installed on this computer.');
    }
    await this.program('open', [appId]);
  }

  close(): Promise<number> {
    return notSupported('Closing an app', 'macOS');
  }
}
