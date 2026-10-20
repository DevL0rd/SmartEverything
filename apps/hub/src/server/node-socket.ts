import { randomUUID } from 'node:crypto';
import {
  ApiError,
  NODE_AI_PROTOCOL,
  NODE_RUNTIME_FRAME,
  type ComputerNodeRow,
  type HubFrame,
  type HubRuntimeControl,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { ComputerNodeAccess } from '../computers/node-access';
import { RemoteComputerRuntimeHost } from '../computers/remote-runtime-host';
import { HUB_COMPUTER_FRAME, NODE_COMPUTER_FRAME } from '../node/computer-channel';
import { pipeLink, type HubLink } from '../node/link';
import type { Store } from '../store/store';
import { ComputerConnection, ComputerSockets } from './computer-socket';

const NODE_SOCKET_FRAME = z.discriminatedUnion('type', [
  ...NODE_RUNTIME_FRAME.options,
  NODE_COMPUTER_FRAME,
]);

type ComputerAttach = (identity: ComputerNodeRow, link: HubLink) => () => void;

class NodeSocketConnection extends ComputerConnection {
  readonly hosts: RemoteComputerRuntimeHost[] = [];
  private leaves: (() => void)[] = [];
  private computer: ((frame: unknown) => void) | null = null;

  get welcomed(): boolean {
    return this.computer !== null;
  }

  welcome(deliver: (frame: unknown) => void): void {
    this.greeted();
    this.computer = deliver;
  }

  deliver(frame: unknown): void {
    this.computer?.(frame);
  }

  attach(host: RemoteComputerRuntimeHost, leave: () => void): void {
    this.hosts.push(host);
    this.leave(leave);
  }

  leave(leave: () => void): void {
    this.leaves.push(leave);
  }

  protected detach(): void {
    for (const leave of this.leaves) leave();
    this.leaves = [];
  }
}

export interface NodeSocketServices {
  readonly directory: ComputerAiDirectory;
  readonly setOnline: (deviceId: string, online: boolean) => Promise<void>;
}

export class ComputerNodeSockets extends ComputerSockets<NodeSocketConnection> {
  private readonly attachers = new Set<ComputerAttach>();

  constructor(
    private readonly store: Store,
    access: ComputerNodeAccess,
    private readonly services: NodeSocketServices,
    log: Logger,
  ) {
    super(NODE_AI_PROTOCOL, access, log);
  }

  onComputer(attach: ComputerAttach): () => void {
    this.attachers.add(attach);
    return (): void => {
      this.attachers.delete(attach);
    };
  }

  protected open(socket: WebSocket, identity: ComputerNodeRow): NodeSocketConnection {
    return new NodeSocketConnection(socket, identity, () => {
      this.markOnline(identity.device_id, false);
    });
  }

  private markOnline(deviceId: string, online: boolean): void {
    this.services.setOnline(deviceId, online).catch((cause: unknown) => {
      this.log.error('computer.online_not_applied', cause, { deviceId, online });
    });
  }

  protected receive(connection: NodeSocketConnection, value: unknown): void {
    const frame = NODE_SOCKET_FRAME.parse(value);
    if (frame.type === 'hello') {
      this.hello(connection, frame);
      return;
    }
    if (!connection.welcomed)
      throw new ApiError('forbidden', 'The computer must complete its hello first.');
    if (frame.type !== 'computer') {
      for (const host of connection.hosts) host.receive(frame);
      return;
    }
    connection.deliver(frame.frame);
  }

  private hello(
    connection: NodeSocketConnection,
    frame: Extract<z.infer<typeof NODE_SOCKET_FRAME>, { type: 'hello' }>,
  ): void {
    if (connection.welcomed || frame.hello.machineId !== connection.identity.machine_id) {
      this.log.warn('computer.hello_refused', {
        socketId: connection.id,
        deviceId: connection.identity.device_id,
        reason: connection.welcomed ? 'repeated_hello' : 'machine_mismatch',
      });
      throw new ApiError('forbidden', 'The computer hello does not match its paired machine.');
    }
    const deviceId = connection.identity.device_id;
    const generation = randomUUID();
    for (const runtime of frame.runtimes) {
      const host = new RemoteComputerRuntimeHost(runtime, deviceId, generation, (control) => {
        connection.send(control);
      });
      connection.attach(
        host,
        this.services.directory.attachRuntime({ device_id: deviceId, runtime }, host, false),
      );
    }
    this.openComputer(connection);
    this.markOnline(deviceId, true);
    const welcome: HubRuntimeControl = {
      type: 'welcome',
      device_id: deviceId,
      generation,
      runtimes: frame.runtimes.map((runtime) =>
        this.store.computerRuntimes.settings({ device_id: deviceId, runtime }),
      ),
    };
    connection.send(welcome);
    this.log.info('computer.hello_accepted', {
      socketId: connection.id,
      deviceId,
      generation,
      runtimes: frame.runtimes,
      attachers: this.attachers.size,
      sinceOpenMs: Math.round(performance.now() - connection.openedAt),
    });
  }

  private openComputer(connection: NodeSocketConnection): void {
    const pipe = pipeLink<HubFrame, unknown>((frame) => {
      connection.send(HUB_COMPUTER_FRAME.parse({ type: 'computer', frame }));
    });
    connection.welcome(pipe.deliver);
    for (const attach of this.attachers) connection.leave(attach(connection.identity, pipe.link));
  }
}
