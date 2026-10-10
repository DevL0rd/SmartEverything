import { createHash } from 'node:crypto';
import { Client, type ClientChannel } from 'ssh2';
import type { RouterShell, RunResult } from './router-shell';

const DONE_MARKER = '__LRM_DONE__';
const COLLECT_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 25_000;
const CONNECT_TIMEOUT_MS = 6_000;

interface SshTarget {
  readonly host: string;
  readonly user: string;
  readonly privateKey: string;
  readonly hostKeySha256: string | null;
  readonly remoteScript: string;
  readonly onFirstHostKey: (fingerprint: string) => void;
}

class HostKeyMismatchError extends Error {
  override readonly name = 'HostKeyMismatchError';

  constructor() {
    super('The router presented a different SSH host key than the one saved at setup');
  }
}

class RouterShellError extends Error {
  override readonly name = 'RouterShellError';
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fingerprintOf(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

interface Connection {
  readonly client: Client;
  readonly loop: ClientChannel;
}

export class SshRouterShell implements RouterShell {
  #connection: Promise<Connection> | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #mismatch = false;

  constructor(private readonly target: SshTarget) {}

  collect(line: string): Promise<string> {
    const next = this.#queue.then(() => this.#collectNow(line));
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async run(command: string): Promise<RunResult> {
    const { client } = await this.#connect();
    return new Promise<RunResult>((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error !== undefined) {
          reject(new RouterShellError(error.message));
          return;
        }
        readChannel(channel, RUN_TIMEOUT_MS).then(resolve, reject);
      });
    });
  }

  close(): void {
    const connection = this.#connection;
    this.#connection = null;
    void connection?.then(({ client }) => client.end()).catch(() => undefined);
  }

  async #collectNow(line: string): Promise<string> {
    const { loop } = await this.#connect();
    try {
      return await readUntilMarker(loop, line);
    } catch (error) {
      this.close();
      throw error;
    }
  }

  #connect(): Promise<Connection> {
    this.#connection ??= this.#open().catch((error: unknown) => {
      this.#connection = null;
      throw error;
    });
    return this.#connection;
  }

  #open(): Promise<Connection> {
    return new Promise<Connection>((resolve, reject) => {
      const client = new Client();
      client.once('ready', () => {
        this.#openLoop(client).then(resolve, reject);
      });
      client.once('error', (error) => {
        reject(this.#mismatch ? new HostKeyMismatchError() : new RouterShellError(error.message));
      });
      client.once('close', () => {
        this.#connection = null;
      });
      client.connect({
        host: this.target.host,
        username: this.target.user,
        privateKey: this.target.privateKey,
        readyTimeout: CONNECT_TIMEOUT_MS,
        keepaliveInterval: 15_000,
        hostVerifier: (key: Buffer) => this.#verifyHost(key),
      });
    });
  }

  #verifyHost(key: Buffer): boolean {
    const fingerprint = fingerprintOf(key);
    if (this.target.hostKeySha256 === null) {
      this.target.onFirstHostKey(fingerprint);
      return true;
    }
    this.#mismatch = fingerprint !== this.target.hostKeySha256;
    return !this.#mismatch;
  }

  #openLoop(client: Client): Promise<Connection> {
    const script = shellQuote(this.target.remoteScript);
    const loop = `while read -r a b c d; do sh ${script} "$a" "$b" "$c" "$d" </dev/null 2>/dev/null; echo ${DONE_MARKER}; done`;
    return new Promise<Connection>((resolve, reject) => {
      client.exec(loop, (error, channel) => {
        if (error !== undefined) {
          reject(new RouterShellError(error.message));
          return;
        }
        resolve({ client, loop: channel });
      });
    });
  }
}

function readUntilMarker(channel: ClientChannel, line: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let text = '';
    const finish = (error: Error | null): void => {
      clearTimeout(timer);
      channel.stdout.off('data', onData);
      channel.off('close', onClose);
      if (error === null) {
        resolve(text.slice(0, text.lastIndexOf(DONE_MARKER)));
      } else {
        reject(error);
      }
    };
    const onData = (chunk: Buffer): void => {
      text += chunk.toString('utf8');
      if (text.trimEnd().endsWith(DONE_MARKER)) {
        finish(null);
      }
    };
    const onClose = (): void => {
      finish(new RouterShellError('The router closed the connection'));
    };
    const timer = setTimeout(() => {
      finish(new RouterShellError('The router did not answer in time'));
    }, COLLECT_TIMEOUT_MS);
    channel.stdout.on('data', onData);
    channel.once('close', onClose);
    channel.write(`${line}\n`);
  });
}

function readChannel(channel: ClientChannel, timeoutMs: number): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      channel.close();
      reject(new RouterShellError('The router did not finish the command in time'));
    }, timeoutMs);
    channel.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    channel.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    let exitCode: number | null = null;
    channel.once('exit', (code: number | null) => {
      exitCode = code;
    });
    channel.once('close', () => {
      clearTimeout(timer);
      resolve({ code: exitCode, stdout, stderr: stderr.trim() });
    });
  });
}
