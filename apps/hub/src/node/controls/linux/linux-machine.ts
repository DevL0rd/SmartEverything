import type { MachineOpenTarget } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { SessionAgent } from '../../session-agent/session-agent';
import type { MachineControl, MachineReport, StopWatching } from '../session-controls';
import { guardedLogind } from './logind-power';
import { linuxMachineReport, type LinuxFacts } from './machine-support';
import type { ProgramProbe } from './program-probe';
import { graphicalSession, ownUid } from './sessions';

const log = new Logger('hub.node-machine');

interface LinuxRingPort {
  readonly set: (on: boolean) => Promise<void>;
}

export interface LinuxMachineOptions {
  readonly run: RunProgram;
  readonly probe: ProgramProbe;
  readonly agent: SessionAgent;
  readonly ring: LinuxRingPort;
  readonly plasma: () => boolean;
}

function lingerOf(output: string): boolean | null {
  const value = output.trim();
  if (value === 'yes') return true;
  return value === 'no' ? false : null;
}

export class LinuxMachine implements MachineControl {
  constructor(private readonly options: LinuxMachineOptions) {}

  async report(): Promise<MachineReport> {
    return linuxMachineReport(await this.facts());
  }

  watch(onChange: () => void): StopWatching {
    return this.options.agent.watch(onChange);
  }

  ring(on: boolean): Promise<void> {
    return this.options.ring.set(on);
  }

  async open(target: MachineOpenTarget): Promise<void> {
    await this.options.run('xdg-open', [target.kind === 'url' ? target.url : target.path]);
  }

  async unlock(): Promise<void> {
    const session = await this.session();
    await guardedLogind(this.options.run('loginctl', ['unlock-session', session]));
  }

  showUnlock(): Promise<void> {
    return Promise.reject(
      new NodeFailureError('not_supported', 'This computer can unlock directly.'),
    );
  }

  private async session(): Promise<string> {
    const session = await graphicalSession(this.options.run);
    if (session === null) {
      throw new NodeFailureError('no_session', 'Nobody is signed in on this computer.');
    }
    return session;
  }

  private async lingering(): Promise<boolean | null> {
    try {
      return lingerOf(
        await this.options.run('loginctl', [
          'show-user',
          String(ownUid()),
          '--property=Linger',
          '--value',
        ]),
      );
    } catch (cause) {
      log.warn('node.linger_unknown', { reason: messageOf(cause) });
      return null;
    }
  }

  private async facts(): Promise<LinuxFacts> {
    const { run, probe, agent, plasma } = this.options;
    const [session, reachable, spectacle, gio, opener, linger] = await Promise.all([
      graphicalSession(run),
      agent.reachable(),
      probe('spectacle'),
      probe('gio'),
      probe('xdg-open'),
      this.lingering(),
    ]);
    return {
      session: session !== null,
      agent: reachable,
      plasma: plasma(),
      spectacle,
      gio,
      opener,
      linger,
    };
  }
}
