import { readFile } from 'node:fs/promises';
import { mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import {
  SESSION_AGENT_ADDRESS,
  SESSION_AGENT_FILE,
  type CaptureTarget,
  type ComputerCapture,
  type MachineOpenTarget,
  type SessionAgentAddress,
  type SessionAgentOperation,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { isMissing } from '../../fs-util';
import { NodeFailureError } from '../node-failure';
import { AGENT_GONE, AgentConnection, type AgentAnswer } from './agent-connection';

const log = new Logger('hub.node-agent');

export type StopWatching = () => void;

export interface SessionAgent {
  readonly reachable: () => Promise<boolean>;
  readonly watch: (onChange: () => void) => StopWatching;
  readonly open: (target: MachineOpenTarget) => Promise<void>;
  readonly ring: (on: boolean, ended: () => void) => Promise<void>;
  readonly capture: (target: CaptureTarget) => Promise<ComputerCapture>;
}

export class SocketSessionAgent implements SessionAgent {
  private readonly listeners = new Set<() => void>();
  private watcher: ReturnType<typeof watch> | null = null;
  private following = false;

  constructor(private readonly directory: string | null) {}

  async reachable(): Promise<boolean> {
    try {
      await this.call({ op: 'ping' });
      return true;
    } catch (cause) {
      if (cause instanceof NodeFailureError && cause.code === 'not_supported') return false;
      throw cause;
    }
  }

  watch(onChange: () => void): StopWatching {
    this.listeners.add(onChange);
    if (!this.following) {
      this.following = true;
      this.watcher = this.follow();
    }
    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0) {
        this.watcher?.close();
        this.watcher = null;
        this.following = false;
      }
    };
  }

  async open(target: MachineOpenTarget): Promise<void> {
    await this.acting({ op: 'open', target });
  }

  async ring(on: boolean, ended: () => void): Promise<void> {
    let finished = false;
    const once = (): void => {
      if (finished) return;
      finished = true;
      ended();
    };
    await this.acting({ op: 'ring', on }, once);
    if (!on) once();
  }

  async capture(target: CaptureTarget): Promise<ComputerCapture> {
    const answer = await this.acting({ op: 'capture', target });
    if (answer.capture === null) {
      throw new NodeFailureError('failed', 'The SmartEverything app returned no picture.');
    }
    return answer.capture;
  }

  private follow(): ReturnType<typeof watch> | null {
    const directory = this.directory;
    if (directory === null) return null;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const watcher = watch(directory, (_event, name) => {
      if (name === SESSION_AGENT_FILE) this.notify();
    });
    watcher.on('error', (cause) => {
      log.error('node.agent_watch_failed', cause, { directory });
    });
    return watcher;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private async address(): Promise<SessionAgentAddress> {
    if (this.directory === null) throw new NodeFailureError('not_supported', AGENT_GONE);
    try {
      const text = await readFile(join(this.directory, SESSION_AGENT_FILE), 'utf8');
      return SESSION_AGENT_ADDRESS.parse(JSON.parse(text));
    } catch (cause) {
      if (isMissing(cause)) throw new NodeFailureError('not_supported', AGENT_GONE);
      throw new NodeFailureError(
        'failed',
        `The SmartEverything app left an unreadable address: ${messageOf(cause)}`,
      );
    }
  }

  private async call(
    operation: SessionAgentOperation,
    ringEnded: () => void = noop,
  ): Promise<AgentAnswer> {
    return AgentConnection.open(await this.address(), operation, ringEnded).answer;
  }

  private async acting(
    operation: SessionAgentOperation,
    ringEnded: () => void = noop,
  ): Promise<AgentAnswer> {
    try {
      return await this.call(operation, ringEnded);
    } catch (cause) {
      if (cause instanceof NodeFailureError && cause.code === 'not_supported') this.notify();
      throw cause;
    }
  }
}

function noop(): void {
  return undefined;
}
