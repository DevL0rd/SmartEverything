import type { InstalledApp } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { AppControl } from '../session-controls';
import type { DesktopEntries } from './desktop-entries';
import type { KdeBridge } from './kde-bridge';
import { sendSignal } from './linux-processes';

function gone(cause: unknown): boolean {
  return cause instanceof NodeFailureError && cause.code === 'not_found';
}

export class LinuxApps implements AppControl {
  constructor(
    private readonly entries: DesktopEntries,
    private readonly bridge: () => Pick<KdeBridge, 'windowsOf'>,
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
      for (const pid of new Set(pids)) {
        try {
          if (pid !== process.pid) {
            sendSignal(pid, 'SIGKILL');
          }
        } catch (cause) {
          if (!gone(cause)) {
            throw cause;
          }
        }
      }
    }
    return pids.length;
  }
}
