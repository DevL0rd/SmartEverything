import { homedir, userInfo } from 'node:os';
import { windowsShell } from '../../collectors/windows/powershell-session';
import { runProgram } from '../../run-program';
import { sessionAgentDirectory } from '../../session-agent/location';
import { SocketSessionAgent } from '../../session-agent/session-agent';
import type { ComputerControls, ControlOptions } from '../controls';
import { HomeFiles } from '../home-files';
import { MachineRing } from '../machine-ring';
import { PortableMachine } from '../portable/portable-machine';
import { PortableProcesses } from '../portable/portable-processes';
import {
  unsupportedAudio,
  unsupportedDisplays,
  unsupportedSession,
  unsupportedSystem,
  unsupportedWindows,
} from '../portable/unsupported';
import { WindowsApps } from './windows-apps';
import { localAppData } from './windows-environment';
import { windowsPlaces } from './windows-places';
import { WindowsPower } from './windows-power';
import { WindowsProcessSource } from './windows-processes';
import { windowsVolume } from './windows-volume';
import { WAKE_DISPLAY_SCRIPT } from './windows-wake';
import { z } from 'zod';

export function windowsControls(options: ControlOptions): ComputerControls {
  const agent = new SocketSessionAgent(
    sessionAgentDirectory('win32', {
      runtimeDirectory: null,
      localAppData: localAppData(),
      home: homedir(),
    }),
  );
  return {
    power: new WindowsPower(runProgram),
    processes: new PortableProcesses({
      machine: 'Windows',
      source: new WindowsProcessSource(windowsShell),
      signals: { end: 'SIGTERM', force: 'SIGKILL', stop: null, continue: null },
      ownUser: userInfo().username,
      ownPid: process.pid,
      now: Date.now,
      failed: (cause): void => {
        options.log.error('node.session_part_failed', cause, { part: 'processes' });
      },
    }),
    links: () => [],
    session: unsupportedSession('Windows'),
    audio: unsupportedAudio('Windows'),
    displays: unsupportedDisplays('Windows'),
    windows: unsupportedWindows('Windows'),
    system: unsupportedSystem('Windows', windowsPlaces),
    apps: new WindowsApps(windowsShell, runProgram),
    files: new HomeFiles(),
    capture: { capture: (target) => agent.capture(target) },
    machine: new PortableMachine({
      machine: 'Windows',
      agent,
      ring: new MachineRing(agent, windowsVolume(windowsShell)),
      openNeedsApp: true,
      open: (target) => agent.open(target),
      wake: async (): Promise<void> => {
        await windowsShell.run(WAKE_DISPLAY_SCRIPT, z.null());
      },
    }),
  };
}
