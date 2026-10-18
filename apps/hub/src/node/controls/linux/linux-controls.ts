import { homedir } from 'node:os';
import { runProgram } from '../../run-program';
import { sessionAgentDirectory } from '../../session-agent/location';
import { SocketSessionAgent } from '../../session-agent/session-agent';
import type { ComputerControls, ControlOptions } from '../controls';
import { DesktopEntries } from './desktop-entries';
import { DisplayRevert, systemRevertOptions, systemSchedule } from './display-revert';
import { HomeFiles } from '../home-files';
import { KdeWindows } from './kde-windows';
import { LinuxApps } from './linux-apps';
import { LinuxCapture } from './linux-capture';
import { LinuxMachine } from './linux-machine';
import { LinuxRing } from './linux-ring';
import { displayEnvironment, LinuxDisplays } from './linux-displays';
import { linuxLinks } from './linux-links';
import { LinuxProcesses } from './linux-processes';
import { LinuxSession } from './linux-session';
import { linuxSystemControls } from './linux-system';
import { LinuxWindows } from './linux-windows';
import { LogindPower } from './logind-power';
import { spawnLines } from './line-stream';
import { KwinNightLight } from './night-light';
import { cachedProbe, programAvailable, type ProgramProbe } from './program-probe';
import { PulseAudio } from './pulse-audio';
import { DesktopRevertNotice } from './revert-notice';
import { isKdePlasma, sessionEnvironment } from './session-environment';
import { SpectacleCapture } from './spectacle-capture';
import { WmctrlWindows } from './wmctrl-windows';

type PartFailure = (cause: unknown) => void;

function partFailure(options: ControlOptions, part: string): PartFailure {
  return (cause): void => {
    options.log.error('node.session_part_failed', cause, { part });
  };
}

function linuxDisplays(
  options: ControlOptions,
  probe: ProgramProbe,
  session: LinuxSession,
): LinuxDisplays {
  return new LinuxDisplays({
    run: runProgram,
    probe,
    lines: spawnLines,
    environment: () => displayEnvironment(isKdePlasma()),
    nightLight: new KwinNightLight(() => session.bus(), runProgram),
    notice: new DesktopRevertNotice(() => session.bus()),
    revert: new DisplayRevert({
      ...systemRevertOptions,
      now: options.now,
      schedule: systemSchedule,
    }),
    schedule: systemSchedule,
    failed: partFailure(options, 'displays'),
  });
}

function linuxWindows(
  options: ControlOptions,
  probe: ProgramProbe,
  session: LinuxSession,
  entries: DesktopEntries,
): LinuxWindows {
  return new LinuxWindows({
    kde: isKdePlasma,
    probe,
    kdeProvider: () => new KdeWindows(() => session.bridge(), entries),
    x11Provider: () => new WmctrlWindows(runProgram, probe, spawnLines),
    schedule: systemSchedule,
    failed: partFailure(options, 'windows'),
  });
}

export function linuxControls(options: ControlOptions): ComputerControls {
  const entries = new DesktopEntries();
  const probe = cachedProbe(programAvailable);
  const audio = new PulseAudio({
    run: runProgram,
    probe,
    lines: spawnLines,
    failed: partFailure(options, 'audio'),
  });
  const agent = new SocketSessionAgent(
    sessionAgentDirectory('linux', {
      runtimeDirectory: sessionEnvironment().XDG_RUNTIME_DIR,
      localAppData: null,
      home: homedir(),
    }),
  );
  const session = new LinuxSession({
    entries,
    audio,
    now: options.now,
    failed: (part, cause): void => {
      partFailure(options, part)(cause);
    },
  });
  return {
    power: new LogindPower(runProgram),
    processes: new LinuxProcesses(),
    links: linuxLinks,
    session,
    audio,
    displays: linuxDisplays(options, probe, session),
    windows: linuxWindows(options, probe, session, entries),
    system: linuxSystemControls({ log: options.log }),
    apps: new LinuxApps(entries, () => session.bridge(), runProgram),
    files: new HomeFiles(),
    capture: new LinuxCapture(new SpectacleCapture(runProgram, options.now), agent, isKdePlasma),
    machine: new LinuxMachine({
      run: runProgram,
      probe,
      agent,
      ring: new LinuxRing(agent, audio, session),
      plasma: isKdePlasma,
    }),
  };
}
