import { homedir, userInfo } from 'node:os';
import { runProgram } from '../../run-program';
import { sessionAgentDirectory } from '../../session-agent/location';
import { SocketSessionAgent } from '../../session-agent/session-agent';
import type { ComputerControls, ControlOptions } from '../controls';
import { HomeFiles } from '../home-files';
import { MachineRing } from '../machine-ring';
import { modelSized } from '../model-picture';
import { PortableMachine } from '../portable/portable-machine';
import { PortableProcesses } from '../portable/portable-processes';
import {
  unsupportedAudio,
  unsupportedDisplays,
  unsupportedInput,
  unsupportedSession,
  unsupportedSystem,
  unsupportedTiling,
  unsupportedWindows,
} from '../portable/unsupported';
import { DarwinApps } from './darwin-apps';
import { darwinPlaces } from './darwin-places';
import { DarwinPower } from './darwin-power';
import { DarwinProcessSource } from './darwin-processes';
import { darwinVolume } from './darwin-volume';

export function darwinControls(options: ControlOptions): ComputerControls {
  const agent = new SocketSessionAgent(
    sessionAgentDirectory('darwin', {
      runtimeDirectory: null,
      localAppData: null,
      home: homedir(),
    }),
  );
  return {
    power: new DarwinPower(runProgram),
    processes: new PortableProcesses({
      machine: 'macOS',
      source: new DarwinProcessSource(runProgram),
      signals: { end: 'SIGTERM', force: 'SIGKILL', stop: 'SIGSTOP', continue: 'SIGCONT' },
      ownUser: userInfo().username,
      ownPid: process.pid,
      now: Date.now,
      failed: (cause): void => {
        options.log.error('node.session_part_failed', cause, { part: 'processes' });
      },
    }),
    links: () => [],
    session: unsupportedSession('macOS'),
    audio: unsupportedAudio('macOS'),
    displays: unsupportedDisplays('macOS'),
    windows: unsupportedWindows('macOS'),
    tiling: unsupportedTiling('macOS'),
    system: unsupportedSystem('macOS', darwinPlaces),
    apps: new DarwinApps(runProgram),
    files: new HomeFiles(),
    capture: { capture: async (target) => modelSized(await agent.capture(target)) },
    input: unsupportedInput('macOS'),
    machine: new PortableMachine({
      machine: 'macOS',
      agent,
      ring: new MachineRing(agent, darwinVolume(runProgram)),
      openNeedsApp: false,
      open: async (target): Promise<void> => {
        await runProgram('open', [target.kind === 'url' ? target.url : target.path]);
      },
      wake: async (): Promise<void> => {
        await runProgram('caffeinate', ['-u', '-t', '1']);
      },
    }),
  };
}
