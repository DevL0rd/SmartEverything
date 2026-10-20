import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import {
  SESSION_AGENT_REQUEST,
  type SessionAgentRequest,
  type SessionAgentReply,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { AgentFailure, type AgentActions } from './agent-actions.js';

const log = new Logger('desktop.agent');
const UNKNOWN_ID = 'unknown';
const MAX_LINE = 4096;

type Answer = Pick<Extract<SessionAgentReply, { ok: true }>, 'capture' | 'permissions'>;

const NOTHING: Answer = { capture: null, permissions: null };

function sameToken(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function send(socket: Socket, message: object): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
}

function refusal(
  id: string,
  code: Extract<SessionAgentReply, { ok: false }>['code'],
  message: string,
): SessionAgentReply {
  return { type: 'reply', id, ok: false, code, message };
}

export class AgentServer {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();

  constructor(
    private readonly token: string,
    private readonly actions: AgentActions,
  ) {
    this.server = createServer((socket) => {
      this.accept(socket);
    });
  }

  listen(address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(address, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
      for (const socket of this.sockets) socket.destroy();
    });
  }

  private accept(socket: Socket): void {
    let buffer = '';
    this.sockets.add(socket);
    socket.once('close', () => {
      this.sockets.delete(socket);
    });
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) {
        socket.destroy();
        return;
      }
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      this.line(socket, line).catch((cause: unknown) => {
        log.error('agent.request_crashed', cause);
        socket.destroy();
      });
    });
    socket.on('error', (cause) => {
      log.debug('agent.connection_error', () => ({ reason: messageOf(cause) }));
    });
  }

  private parse(line: string): SessionAgentRequest | null {
    try {
      const parsed = SESSION_AGENT_REQUEST.safeParse(JSON.parse(line));
      if (parsed.success) return parsed.data;
      log.warn('agent.request_invalid', { issues: parsed.error.issues.length });
    } catch (cause) {
      log.warn('agent.request_unreadable', { reason: messageOf(cause) });
    }
    return null;
  }

  private async line(socket: Socket, line: string): Promise<void> {
    const request = this.parse(line);
    if (request === null) {
      send(socket, refusal(UNKNOWN_ID, 'invalid_request', 'The request could not be read.'));
      socket.end();
      return;
    }
    if (!sameToken(request.token, this.token)) {
      log.warn('agent.unauthorized', { operation: request.operation.op });
      send(socket, refusal(request.id, 'unauthorized', 'The token does not match.'));
      socket.end();
      return;
    }
    await this.perform(socket, request);
  }

  private async perform(socket: Socket, request: SessionAgentRequest): Promise<void> {
    const { id, operation } = request;
    try {
      const answer = await this.run(socket, operation);
      log.info('agent.performed', { operation: operation.op });
      send(socket, { type: 'reply', id, ok: true, ...answer });
      if (!(operation.op === 'ring' && operation.on)) socket.end();
    } catch (cause) {
      log.warn('agent.failed', { operation: operation.op, reason: messageOf(cause) });
      const code = cause instanceof AgentFailure ? cause.code : 'failed';
      send(
        socket,
        refusal(id, code, messageOf(cause).slice(0, 500) || 'The app could not do that.'),
      );
      socket.end();
    }
  }

  private async run(socket: Socket, operation: SessionAgentRequest['operation']): Promise<Answer> {
    switch (operation.op) {
      case 'ping':
        return NOTHING;
      case 'open':
        await this.actions.open(operation.target);
        return NOTHING;
      case 'ring':
        await this.actions.ring(operation.on, () => {
          send(socket, { type: 'event', event: 'ring_ended' });
          socket.end();
        });
        return NOTHING;
      case 'capture':
        return { ...NOTHING, capture: await this.actions.capture(operation.target) };
      case 'permissions':
        return { ...NOTHING, permissions: [...this.actions.permissions()] };
    }
  }
}
