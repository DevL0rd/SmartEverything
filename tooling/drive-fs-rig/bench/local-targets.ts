import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { alive, freePorts, run, startDetached, stopProcess, waitFor } from '../processes.ts';
import {
  SERVICES,
  START_TIMEOUT_MS,
  STOP_MS,
  ensureDav,
  ensureSmb,
  ensureSsh,
  nfsMarker,
  serveFolder,
  shared,
} from './local-servers.ts';
import { isMounted } from './mounts.ts';
import { BENCH } from './paths.ts';
import type { Target, Wrapped } from './target.ts';

const MOUNTS = join(BENCH, 'mnt');

export interface LocalTarget extends Target {
  setup(): Promise<void>;
  teardown(): Promise<void>;
  roles(): { readonly client: readonly number[]; readonly server: readonly number[] };
}

async function nfsActive(): Promise<boolean> {
  try {
    return (await run('systemctl', ['is-active', 'nfs-server'])).stdout.trim() === 'active';
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 3) return false;
    throw cause;
  }
}

function plainWrap(command: string, args: readonly string[]): Wrapped {
  return { command, args };
}

function point(kind: string): string {
  return join(MOUNTS, kind);
}

async function unmountFuse(path: string): Promise<void> {
  if (await isMounted(path)) await run('fusermount3', ['-u', path]);
}

async function unmountKernel(path: string): Promise<void> {
  if (await isMounted(path)) await run('sudo', ['-n', 'umount', path]);
}

export function nfsTarget(): LocalTarget {
  const mountPoint = point('nfs');
  return {
    kind: 'nfs',
    root: mountPoint,
    async setup(): Promise<void> {
      shared.nfsWasRunning = await nfsActive();
      if (!shared.nfsWasRunning) {
        await mkdir(SERVICES, { recursive: true });
        await writeFile(nfsMarker, '');
        await run('sudo', ['-n', 'systemctl', 'start', 'nfs-server']);
      }
      await run('sudo', [
        '-n',
        'exportfs',
        '-o',
        'rw,sync,no_subtree_check,fsid=7311',
        `127.0.0.1:${serveFolder}`,
      ]);
    },
    async teardown(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      await run('sudo', [
        '-n',
        'mount',
        '-t',
        'nfs',
        '-o',
        'vers=4.2,proto=tcp,rsize=1048576,wsize=1048576,hard',
        `127.0.0.1:${serveFolder}`,
        mountPoint,
      ]);
    },
    async unmount(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    wrap: plainWrap,
    drain: () => [],
    roles: () => ({ client: [], server: [] }),
  };
}

export function smbTarget(): LocalTarget {
  const mountPoint = point('smb');
  return {
    kind: 'smb',
    root: mountPoint,
    async setup(): Promise<void> {
      await ensureSmb();
    },
    async teardown(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      await run('chmod', ['-R', 'a+rwX', serveFolder]);
      const { uid, gid } = userInfo();
      await run('sudo', [
        '-n',
        'mount',
        '-t',
        'cifs',
        '//127.0.0.1/bench',
        mountPoint,
        '-o',
        `port=${String(shared.smbPort)},vers=3.1.1,guest,uid=${String(uid)},gid=${String(gid)},file_mode=0644,dir_mode=0755`,
      ]);
    },
    async unmount(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    wrap: plainWrap,
    drain: () => [],
    roles: () => ({ client: [], server: [shared.smbPid] }),
  };
}

const PASSTHROUGH_SOURCE = join(import.meta.dirname, 'passthrough');

export function passthroughTarget(): LocalTarget {
  const mountPoint = point('passthrough');
  const binary = join(BENCH, 'passthrough');
  let pid: number | null = null;
  return {
    kind: 'passthrough',
    root: mountPoint,
    async setup(): Promise<void> {
      await run('go', ['build', '-o', binary, '.'], { cwd: PASSTHROUGH_SOURCE });
    },
    async teardown(): Promise<void> {
      await unmountFuse(mountPoint);
      await rm(binary, { force: true });
    },
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      pid = await startDetached({
        command: binary,
        args: [serveFolder, mountPoint],
        log: join(BENCH, 'logs', 'passthrough.log'),
      });
      await waitFor(
        'the passthrough mount',
        async () => ((await isMounted(mountPoint)) ? true : undefined),
        START_TIMEOUT_MS,
      );
    },
    async unmount(): Promise<void> {
      await unmountFuse(mountPoint);
      if (pid !== null) await stopProcess(pid, STOP_MS);
      pid = null;
    },
    wrap: plainWrap,
    drain: () => [],
    roles: () => ({ client: pid === null ? [] : [pid], server: [] }),
  };
}

export function sshfsTarget(): LocalTarget {
  const mountPoint = point('sshfs');
  return {
    kind: 'sshfs',
    root: mountPoint,
    async setup(): Promise<void> {
      await ensureSsh();
    },
    async teardown(): Promise<void> {
      await unmountFuse(mountPoint);
    },
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      await run('sshfs', [
        `127.0.0.1:${serveFolder}`,
        mountPoint,
        '-p',
        String(shared.sshPort),
        '-o',
        `IdentityFile=${shared.keyFile},UserKnownHostsFile=${shared.knownHosts},StrictHostKeyChecking=yes,BatchMode=yes,reconnect,ServerAliveInterval=15`,
      ]);
    },
    async unmount(): Promise<void> {
      await unmountFuse(mountPoint);
    },
    wrap: plainWrap,
    drain: () => [],
    roles: () => ({ client: [], server: [shared.sshPid] }),
  };
}

export type RcloneProtocol = 'sftp' | 'dav';
export type RcloneCache = 'off' | 'full';

function rcloneBackend(protocol: RcloneProtocol): string[] {
  if (protocol === 'dav')
    return [
      ':webdav:/',
      '--webdav-url',
      `http://127.0.0.1:${String(shared.davPort)}`,
      '--webdav-vendor',
      'other',
    ];
  return [
    `:sftp:${serveFolder}`,
    '--sftp-host',
    '127.0.0.1',
    '--sftp-port',
    String(shared.sshPort),
    '--sftp-user',
    userInfo().username,
    '--sftp-key-file',
    shared.keyFile,
    '--sftp-known-hosts-file',
    shared.knownHosts,
  ];
}

function rcloneCaching(cache: RcloneCache, cacheDirectory: string, rcPort: number): string[] {
  if (cache === 'off') return ['--vfs-cache-mode', 'off'];
  return [
    '--vfs-cache-mode',
    'full',
    '--vfs-write-back',
    '1s',
    '--vfs-cache-max-size',
    '8G',
    '--cache-dir',
    cacheDirectory,
    '--rc',
    '--rc-addr',
    `127.0.0.1:${String(rcPort)}`,
    '--rc-no-auth',
  ];
}

interface RcloneMount {
  readonly kind: string;
  readonly point: string;
  readonly protocol: RcloneProtocol;
  readonly cache: RcloneCache;
}

async function startRclone(
  mount: RcloneMount,
  cacheDirectory: string,
  rcPort: number,
): Promise<number> {
  const log = join(SERVICES, `${mount.kind}.log`);
  const pid = await startDetached({
    command: 'rclone',
    args: [
      'mount',
      ...rcloneBackend(mount.protocol),
      mount.point,
      ...rcloneCaching(mount.cache, cacheDirectory, rcPort),
      '--log-level',
      'ERROR',
    ],
    log,
  });
  await waitFor(
    `${mount.kind} to mount`,
    async () => {
      if (!alive(pid)) throw new Error(`rclone exited at start; see ${log}`);
      return (await isMounted(mount.point)) ? true : undefined;
    },
    START_TIMEOUT_MS,
    100,
  );
  return pid;
}

export function rcloneTarget(protocol: RcloneProtocol, cache: RcloneCache): LocalTarget {
  const kind = `rclone-${protocol}-${cache}`;
  const mountPoint = point(kind);
  const cacheDirectory = join(SERVICES, `cache-${kind}`);
  let pid = 0;
  let rcPort = 0;
  const stop = async (): Promise<void> => {
    await unmountFuse(mountPoint);
    if (pid !== 0 && alive(pid)) await stopProcess(pid, STOP_MS);
    pid = 0;
  };
  return {
    kind,
    root: mountPoint,
    async setup(): Promise<void> {
      if (protocol === 'sftp') await ensureSsh();
      else await ensureDav();
    },
    teardown: stop,
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      await rm(cacheDirectory, { recursive: true, force: true });
      rcPort = (await freePorts(1))[0] ?? 0;
      pid = await startRclone({ kind, point: mountPoint, protocol, cache }, cacheDirectory, rcPort);
    },
    unmount: stop,
    wrap: plainWrap,
    drain: () =>
      cache === 'full'
        ? [
            '-drain-exec',
            `curl -s -X POST http://127.0.0.1:${String(rcPort)}/vfs/queue | grep -Eq '"queue": ?\\[\\]'`,
          ]
        : [],
    roles: () => ({
      client: pid === 0 ? [] : [pid],
      server: [protocol === 'sftp' ? shared.sshPid : shared.davPid],
    }),
  };
}

const DAVFS_CONFIG = [
  'use_locks 0',
  'ask_auth 0',
  'delay_upload 0',
  'cache_size 4096',
  'file_refresh 1',
  'dir_refresh 60',
  '',
].join('\n');

function flushScriptText(mountPoint: string, mountArgs: readonly string[]): string {
  return `#!/bin/sh\nmountpoint -q ${mountPoint} && sudo -n umount ${mountPoint}\nsudo -n mount ${mountArgs.join(' ')}\n`;
}

export function davfsTarget(): LocalTarget {
  const mountPoint = point('davfs');
  const configFile = join(SERVICES, 'davfs2.conf');
  const flushScript = join(SERVICES, 'davfs-flush.sh');
  const mountArgs = (): string[] => {
    const { uid, gid } = userInfo();
    return [
      '-t',
      'davfs',
      '-o',
      `conf=${configFile},uid=${String(uid)},gid=${String(gid)},noexec`,
      `http://127.0.0.1:${String(shared.davPort)}/`,
      mountPoint,
    ];
  };
  return {
    kind: 'davfs',
    root: mountPoint,
    async setup(): Promise<void> {
      await ensureDav();
      await mkdir(SERVICES, { recursive: true });
      await writeFile(configFile, DAVFS_CONFIG);
      await writeFile(flushScript, flushScriptText(mountPoint, mountArgs()));
      await chmod(flushScript, 0o700);
    },
    async teardown(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    async mount(): Promise<void> {
      await mkdir(mountPoint, { recursive: true });
      await run('timeout', ['60', 'sudo', '-n', 'mount', ...mountArgs()]);
    },
    async unmount(): Promise<void> {
      await unmountKernel(mountPoint);
    },
    wrap: plainWrap,
    drain: () => ['-drain-exec', `sh ${flushScript}`],
    roles: () => ({ client: [], server: [shared.davPid] }),
  };
}
