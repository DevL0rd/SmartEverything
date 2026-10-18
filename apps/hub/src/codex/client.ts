import { TextDecoder } from 'node:util';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { JSON_VALUE } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { CodexProtocolError, CodexRuntimeError } from './errors';
import {
  RPC_MESSAGE,
  INITIALIZED,
  rpcIdentity,
  type RpcMethod,
  type RpcId,
  type RpcRecord,
  type RpcMessage,
} from './protocol';
const MAX_LINE_BYTES = 32 * 1024 * 1024;
const MAX_PENDING = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (cause: Error) => void;
  readonly timer: NodeJS.Timeout;
  readonly method: string;
  readonly startedAt: number;
}
export interface CodexClientOptions {
  readonly process: ChildProcessWithoutNullStreams;
  readonly received: (method: string, params: RpcRecord, id: RpcId | null) => void;
  readonly closed: (cause: Error) => void;
  readonly log?: Logger;
  readonly mode?: 'control' | 'provider';
}
export class CodexClient {
  private readonly pending = new Map<string, Pending>();
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private buffer = '';
  private nextId = 0;
  private stopped = false;
  private initialized = false;
  private readonly openedAt = performance.now();
  private framesIn = 0;
  private framesOut = 0;
  private bytesIn = 0;
  private bytesOut = 0;
  private notifications = 0;
  private timeouts = 0;
  private failures = 0;
  private stderrBytes = 0;
  constructor(private readonly options: CodexClientOptions) {
    options.log?.info('codex.process_started', {
      mode: options.mode,
      pid: options.process.pid,
    });
    options.process.stdout.on('data', (bytes: Buffer) => {
      this.data(bytes);
    });
    options.process.on('error', (cause) => {
      this.close(cause);
    });
    options.process.on('exit', (code, signal) => {
      options.log?.info('codex.process_exited', {
        mode: options.mode,
        pid: options.process.pid,
        exitCode: code,
        signal,
        stopped: this.stopped,
        pending: this.pending.size,
      });
      this.close(
        new CodexRuntimeError(
          'transport',
          'The Codex process exited; accepted work has an unknown outcome.',
          true,
        ),
      );
    });
    options.process.stdout.on('end', () => {
      this.close(new CodexProtocolError('The Codex protocol stream ended.'));
    });
    options.process.stdin.on('error', (cause): void => {
      this.close(cause);
    });
    options.process.stdout.on('error', (cause): void => {
      this.close(cause);
    });
    options.process.stderr.on('error', (cause): void => {
      this.close(cause);
    });
    options.process.stderr.on('data', (bytes: Buffer) => {
      this.stderrBytes += bytes.length;
    });
    options.process.stderr.resume();
  }
  async initialize(): Promise<string> {
    const result = INITIALIZED.parse(
      await this.request('initialize', {
        clientInfo: { name: 'smarteverything', title: 'SmartEverything', version: '0.1.0' },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          mcpServerOpenaiFormElicitation: true,
        },
      }),
    );
    const version = /^[^/\r\n]+\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(result.userAgent)?.[1];
    this.options.log?.debug('codex.initialize_answered', {
      mode: this.options.mode,
      version,
      userAgentLength: result.userAgent.length,
    });
    if (version !== '0.162.1')
      throw new CodexProtocolError('Codex protocol requires inspected version 0.162.1.');
    this.write({ method: 'initialized' });
    this.initialized = true;
    this.options.log?.info('codex.client_initialized', {
      mode: this.options.mode,
      version,
      elapsedMs: Math.round(performance.now() - this.openedAt),
    });
    return version;
  }
  request(method: RpcMethod, params: RpcRecord): Promise<unknown> {
    if (this.stopped)
      return Promise.reject(new CodexRuntimeError(method, 'The Codex connection is closed.'));
    if (!this.initialized && method !== 'initialize')
      return Promise.reject(new CodexProtocolError('Initialize Codex before requests.'));
    if (this.pending.size >= MAX_PENDING)
      return Promise.reject(new CodexProtocolError('Codex pending request capacity reached.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.timeouts += 1;
        this.options.log?.warn('codex.request_timed_out', {
          mode: this.options.mode,
          method,
          requestId: id,
          timeoutMs: REQUEST_TIMEOUT_MS,
          pending: this.pending.size,
        });
        this.pending.delete(rpcIdentity(id));
        reject(
          new CodexRuntimeError(
            method,
            'Codex did not acknowledge the request; do not replay it automatically.',
            true,
          ),
        );
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(rpcIdentity(id), {
        resolve,
        reject,
        timer,
        method,
        startedAt: performance.now(),
      });
      this.options.log?.trace('codex.request_sent', {
        mode: this.options.mode,
        method,
        requestId: id,
        pending: this.pending.size,
      });
      try {
        this.write({ id, method, params });
      } catch (cause) {
        this.close(cause instanceof Error ? cause : new CodexProtocolError('Codex write failed.'));
      }
    });
  }
  respond(id: RpcId, result: unknown): void {
    this.write({ id, result: JSON_VALUE.parse(result) });
  }
  reject(id: RpcId, message: string): void {
    this.write({ id, error: { code: -32601, message } });
  }
  stop(): void {
    this.close(
      new CodexRuntimeError(
        'stop',
        'The Codex client was stopped; unfinished work is unknown.',
        true,
      ),
    );
  }
  private write(value: unknown): void {
    if (this.stopped) throw new CodexRuntimeError('write', 'The Codex connection is closed.');
    const text = JSON.stringify(value);
    const size = Buffer.byteLength(text);
    if (size > MAX_LINE_BYTES)
      throw new CodexProtocolError('The Codex frame exceeds its byte limit.');
    this.framesOut += 1;
    this.bytesOut += size;
    if (
      !this.options.process.stdin.write(`${text}\n`) &&
      this.options.process.stdin.writableLength > MAX_LINE_BYTES
    )
      throw new CodexProtocolError('The Codex write buffer exceeds its byte limit.');
  }
  private data(bytes: Buffer): void {
    if (this.stopped) return;
    this.bytesIn += bytes.length;
    try {
      if (bytes.length > MAX_LINE_BYTES)
        throw new CodexProtocolError('The Codex read chunk exceeds its byte limit.');
      this.buffer += this.decoder.decode(bytes, { stream: true });
      let newline = this.buffer.indexOf('\n');
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_LINE_BYTES)
          throw new CodexProtocolError('The Codex frame exceeds its byte limit.');
        this.message(RPC_MESSAGE.parse(JSON.parse(line)));
        newline = this.buffer.indexOf('\n');
      }
      if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES)
        throw new CodexProtocolError('The Codex unterminated frame exceeds its byte limit.');
    } catch (cause) {
      this.close(
        cause instanceof Error ? cause : new CodexProtocolError('Codex frame parsing failed.'),
      );
    }
  }
  private message(message: RpcMessage): void {
    this.framesIn += 1;
    if ('method' in message) {
      this.notifications += 1;
      this.options.received(
        message.method,
        message.params ?? {},
        'id' in message ? message.id : null,
      );
      return;
    }
    const key = rpcIdentity(message.id);
    const pending = this.pending.get(key);
    if (pending === undefined) {
      this.options.log?.debug('codex.response_unmatched', {
        mode: this.options.mode,
        requestId: message.id,
      });
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(key);
    const durationMs = Math.round(performance.now() - pending.startedAt);
    if ('error' in message) {
      this.failures += 1;
      this.options.log?.warn('codex.request_failed', {
        mode: this.options.mode,
        method: pending.method,
        requestId: message.id,
        durationMs,
        messageLength: message.error.message.length,
        reason: message.error.message.slice(0, 200),
      });
    } else {
      this.options.log?.debug('codex.request_answered', {
        mode: this.options.mode,
        method: pending.method,
        requestId: message.id,
        durationMs,
      });
    }
    if ('error' in message)
      pending.reject(new CodexRuntimeError(pending.method, message.error.message.slice(0, 2000)));
    else pending.resolve(message.result);
  }
  private close(cause: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.options.log?.info('codex.client_closed', {
      mode: this.options.mode,
      pid: this.options.process.pid,
      errorName: cause.name,
      reason: cause.message.slice(0, 300),
      pending: this.pending.size,
      initialized: this.initialized,
      framesIn: this.framesIn,
      framesOut: this.framesOut,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      notifications: this.notifications,
      timeouts: this.timeouts,
      failures: this.failures,
      stderrBytes: this.stderrBytes,
      lifetimeMs: Math.round(performance.now() - this.openedAt),
    });
    this.buffer = '';
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new CodexRuntimeError(pending.method, cause.message, true));
    }
    this.pending.clear();
    this.options.process.kill();
    this.options.closed(cause);
  }
}
