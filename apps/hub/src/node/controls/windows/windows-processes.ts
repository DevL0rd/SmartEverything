import { z } from 'zod';
import type { PowerShell } from '../../collectors/windows/powershell-session';
import { PROCESSES_SCRIPT } from '../../collectors/windows/windows-scripts';
import type { ProcessSource, RawProcess } from '../portable/portable-processes';

const UNKNOWN_USER = 'unknown';

const PROCESSES = z.array(
  z.object({
    pid: z.number(),
    ppid: z.number(),
    name: z.string(),
    command: z.string(),
    threads: z.number(),
    memory: z.number(),
    cpuSeconds: z.number(),
    created: z.number(),
    user: z.string(),
  }),
);

export class WindowsProcessSource implements ProcessSource {
  constructor(private readonly shell: PowerShell) {}

  async sweep(): Promise<readonly RawProcess[]> {
    const found = await this.shell.run(PROCESSES_SCRIPT, PROCESSES);
    return found
      .filter((item) => item.pid > 0 && item.name !== '')
      .map((item) => ({
        pid: item.pid,
        ppid: item.ppid,
        name: item.name,
        command: item.command,
        user: item.user === '' ? UNKNOWN_USER : item.user,
        start: item.created,
        memoryBytes: item.memory,
        threads: item.threads,
        cpuSeconds: item.cpuSeconds,
        cpuPercentOfOneCore: null,
      }));
  }
}
