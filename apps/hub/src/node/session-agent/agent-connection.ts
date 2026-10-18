import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import {
  SESSION_AGENT_MESSAGE,
  type ComputerCapture,
  type SessionAgentAddress,
  type SessionAgentOperation,
  type SessionAgentMessage,
  type SessionAgentReply,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { NodeFailureError } from '../node-failure';

const log = new Logger('hub.node-agent');

export const AGENT_GONE = 'The SmartEverything app is not running on this computer.';

export interface AgentAnswer {
  readonly capture: ComputerCapture | null;
}

type Failed = Extract<SessionAgentReply, { ok: false }>;

function failureOf(reply: Failed): NodeFailureError {
  return new NodeFailureError(
    reply.code === 'not_supported' ? 'not_supported' : 'failed',
    reply.message,
  );
}

export class AgentConnection {
  private buffer = '';
  private settled = false;
  private readonly id = randomUUID();

  private constructor(
    private readonly socket: Socket,
    private readonly address: SessionAgentAddress,
    private readonly operation: SessionAgentOperation,
    private readonly handlers: {
      readonly answered: (answer: AgentAnswer) => void;
      readonly failed: (cause: NodeFailureError) => void;
      readonly ringEnded: () => void;
    },
  ) {}

  static open(
    address: SessionAgentAddress,
    operation: SessionAgentOperation,
    ringEnded: () => void,
  ): { readonly answer: Promise<AgentAnswer>; readonly close: () => void } {
    let connection: AgentConnection | null = null;
    const answer = new Promise<AgentAnswer>((resolve, reject) => {
      connection = new AgentConnection(createConnection(address.socket), address, operation, {
        answered: resolve,
        failed: reject,
        ringEnded,
      });
      connection.wire();
    });
    return {
      answer,
      close: (): void => {
        connection?.socket.destroy();
      },
    };
  }

  private wire(): void {
    this.socket.setEncoding('utf8');
    this.socket.once('connect', () => {
      this.socket.write(
        `${JSON.stringify({ id: this.id, token: this.address.token, operation: this.operation })}\n`,
      );
    });
    this.socket.on('data', (chunk: string) => {
      this.receive(chunk);
    });
    this.socket.once('error', () => {
      this.fail(new NodeFailureError('not_supported', AGENT_GONE));
    });
    this.socket.once('close', () => {
      this.fail(new NodeFailureError('not_supported', AGENT_GONE));
      if (this.operation.op === 'ring' && this.operation.on) this.handlers.ringEnded();
    });
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    for (let end = this.buffer.indexOf('\n'); end >= 0; end = this.buffer.indexOf('\n')) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      this.accept(line);
    }
  }

  private accept(line: string): void {
    const value = this.parsed(line);
    if (value === null) {
      this.fail(new NodeFailureError('failed', 'The SmartEverything app answered unreadably.'));
      return;
    }
    if (value.type === 'event') {
      this.handlers.ringEnded();
      this.socket.destroy();
      return;
    }
    if (value.id !== this.id) return;
    if (!value.ok) {
      this.fail(failureOf(value));
      return;
    }
    this.settled = true;
    this.handlers.answered({ capture: value.capture });
    if (!(this.operation.op === 'ring' && this.operation.on)) this.socket.end();
  }

  private parsed(line: string): SessionAgentMessage | null {
    try {
      const message = SESSION_AGENT_MESSAGE.safeParse(JSON.parse(line));
      if (message.success) return message.data;
      log.warn('node.agent_message_invalid', { issues: message.error.issues.length });
    } catch (cause) {
      log.warn('node.agent_message_unreadable', { reason: messageOf(cause) });
    }
    return null;
  }

  private fail(cause: NodeFailureError): void {
    if (this.settled) return;
    this.settled = true;
    this.handlers.failed(cause);
    this.socket.destroy();
  }
}
