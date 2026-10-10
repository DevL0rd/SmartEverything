import type { InstalledApp } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { AppControl } from '../session-controls';
import type { DesktopEntries } from './desktop-entries';
import type { KdeBridge } from './kde-bridge';
import { ownUid } from './sessions';
import { statSync } from 'node:fs';

function ownedBy(pid: number, uid: number): boolean {
  try {
    return statSync(`/proc/${String(pid)}`).uid === uid;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return false;
    }
    throw cause;
  }
}

export class LinuxApps implements AppControl {
  constructor(
    private readonly entries: DesktopEntries,
    private readonly bridge: () => KdeBridge,
    private readonly run: RunProgram,
  ) {}

  installed(): Promise<InstalledApp[]> {
    return Promise.resolve(
      this.entries.all().map(({ id, name, comment, icon }) => ({ id, name, comment, icon })),
    );
  }

  async open(appId: string): Promise<void> {
    const entry = this.entries.find(appId);
    if (entry === undefined) {
      throw new NodeFailureError('not_found', 'That app is not installed on this computer.');
    }
    await this.run('gio', ['launch', entry.path]);
  }

  async close(appId: string, force: boolean): Promise<number> {
    const pids = await this.bridge().windowsOf(appId, !force);
    if (pids.length === 0) {
      throw new NodeFailureError('not_found', 'That app has no open windows.');
    }
    if (force) {
      const uid = ownUid();
      new Set(pids).forEach((pid) => {
        if (pid !== process.pid && ownedBy(pid, uid)) {
          process.kill(pid, 'SIGKILL');
        }
      });
    }
    return pids.length;
  }
}
