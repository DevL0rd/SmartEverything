import { runProgram } from '../../run-program';
import type { ComputerControls, ControlOptions } from '../controls';
import { DesktopEntries } from './desktop-entries';
import { HomeFiles } from './home-files';
import { LinuxApps } from './linux-apps';
import { linuxLinks } from './linux-links';
import { LinuxProcesses } from './linux-processes';
import { LinuxSession } from './linux-session';
import { LogindPower } from './logind-power';
import { SpectacleCapture } from './spectacle-capture';

export function linuxControls(options: ControlOptions): ComputerControls {
  const entries = new DesktopEntries();
  const session = new LinuxSession({
    run: runProgram,
    entries,
    now: options.now,
    failed: (part, cause): void => {
      options.log.error('node.session_part_failed', cause, { part });
    },
  });
  return {
    power: new LogindPower(runProgram),
    processes: new LinuxProcesses(runProgram),
    links: linuxLinks,
    session,
    apps: new LinuxApps(entries, () => session.bridge(), runProgram),
    files: new HomeFiles(),
    capture: new SpectacleCapture(runProgram, options.now),
  };
}
