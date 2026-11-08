import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SshRouterShell } from '../../../src/plugins/builtin/router/ssh-shell';

const HOST_KEY = vi.hoisted(() => Buffer.from('router-host-key'));
const UNANSWERING_ROUTER = vi.hoisted(() => '192.168.50.9');

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeChannel extends EventEmitter {
    readonly stdout = new EventEmitter();
    readonly stderr = new EventEmitter();
    write(line: string): void {
      queueMicrotask(() => {
        this.stdout.emit('data', Buffer.from(`reply to ${line.trim()}\n__LRM_DONE__\n`));
      });
    }
  }
  class Client extends EventEmitter {
    connect(options: {
      readonly host: string;
      readonly hostVerifier: (key: Buffer) => boolean;
    }): void {
      if (options.host === UNANSWERING_ROUTER) {
        queueMicrotask(() => {
          this.emit('error', new Error('Timed out while waiting for handshake'));
          this.emit('error', new Error('Connection lost before handshake'));
        });
        return;
      }
      const accepted = options.hostVerifier(HOST_KEY);
      queueMicrotask(() => {
        if (accepted) {
          this.emit('ready');
        } else {
          this.emit('error', new Error('Handshake failed'));
        }
      });
    }
    exec(_command: string, callback: (error: undefined, channel: FakeChannel) => void): void {
      callback(undefined, new FakeChannel());
    }
    end(): void {
      this.emit('close');
    }
  }
  return { Client };
});

const FINGERPRINT = `SHA256:${createHash('sha256').update(HOST_KEY).digest('base64').replace(/=+$/, '')}`;

function shellPinnedTo(
  hostKeySha256: string | null,
  onFirstHostKey: (fingerprint: string) => void,
  host = '192.168.50.1',
): InstanceType<typeof SshRouterShell> {
  return new SshRouterShell({
    host,
    user: 'admin',
    privateKey: 'test-only',
    hostKeySha256,
    remoteScript: '/jffs/collect.sh',
    onFirstHostKey,
  });
}

describe('router SSH host key', () => {
  it('reports the fingerprint of an unpinned router and connects', async () => {
    const seen: string[] = [];
    const shell = shellPinnedTo(null, (fingerprint) => seen.push(fingerprint));
    await expect(shell.collect('1 2 3 4')).resolves.toContain('reply to 1 2 3 4');
    expect(seen).toEqual([FINGERPRINT]);
    shell.close();
  });

  it('connects without reporting when the pinned fingerprint matches', async () => {
    const seen: string[] = [];
    const shell = shellPinnedTo(FINGERPRINT, (fingerprint) => seen.push(fingerprint));
    await expect(shell.collect('1 2 3 4')).resolves.toContain('reply to');
    expect(seen).toEqual([]);
    shell.close();
  });

  it('refuses a different key and names the Use Router Monitor settings action', async () => {
    const seen: string[] = [];
    const shell = shellPinnedTo('SHA256:other', (fingerprint) => seen.push(fingerprint));
    await expect(shell.collect('1 2 3 4')).rejects.toThrow('run Use Router Monitor settings again');
    expect(seen).toEqual([]);
  });
});

describe('router SSH connection failures', () => {
  it('fails the request once and survives the second error ssh2 emits after a handshake timeout', async () => {
    const shell = shellPinnedTo(FINGERPRINT, () => undefined, UNANSWERING_ROUTER);
    await expect(shell.collect('1 2 3 4')).rejects.toThrow('Timed out while waiting for handshake');
    await new Promise((resolve) => setImmediate(resolve));
  });
});
