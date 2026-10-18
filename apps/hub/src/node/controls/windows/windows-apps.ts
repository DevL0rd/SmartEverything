import type { InstalledApp } from '@smarteverything/domain';
import { z } from 'zod';
import type { PowerShell } from '../../collectors/windows/powershell-session';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { AppControl } from '../session-controls';
import { notSupported } from '../portable/unsupported';

const APPS_SCRIPT =
  ',@(Get-StartApps | Sort-Object Name | ForEach-Object { [pscustomobject]@{ name = [string]$_.Name; id = [string]$_.AppID } })';

const APPS = z.array(z.object({ name: z.string().min(1), id: z.string().min(1) }));

export class WindowsApps implements AppControl {
  constructor(
    private readonly shell: PowerShell,
    private readonly program: RunProgram,
  ) {}

  async installed(): Promise<InstalledApp[]> {
    const found = await this.shell.run(APPS_SCRIPT, APPS);
    return found.map((app) => ({ id: app.id, name: app.name, comment: null, icon: null }));
  }

  async open(appId: string): Promise<void> {
    const known = (await this.installed()).some((app) => app.id === appId);
    if (!known) {
      throw new NodeFailureError('not_found', 'That app is not installed on this computer.');
    }
    await this.program('explorer.exe', [`shell:AppsFolder\\${appId}`]);
  }

  close(): Promise<number> {
    return notSupported('Closing an app', 'Windows');
  }
}
