import { access, chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { SCRATCH } from '../paths.ts';
import { alive, freePorts, run, startDetached, stopProcess, waitFor } from '../processes.ts';

export const serveFolder = join(SCRATCH, 'serve');
export const SERVICES = join(SCRATCH, 'services');
export const nfsMarker = join(SERVICES, 'nfs-started-by-the-bench');
export const START_TIMEOUT_MS = 30_000;
export const STOP_MS = 10_000;

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

export const shared = {
  sshPort: 0,
  sshPid: 0,
  davPort: 0,
  davPid: 0,
  smbPort: 0,
  smbPid: 0,
  keyFile: join(SERVICES, 'ssh', 'client_ed25519'),
  knownHosts: join(SERVICES, 'ssh', 'known_hosts'),
  nfsWasRunning: false,
};

export async function portOpen(port: number): Promise<true | undefined> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(undefined);
    });
  });
}

export async function ensureSsh(): Promise<void> {
  if (shared.sshPid !== 0) return;
  const folder = join(SERVICES, 'ssh');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const host = join(folder, 'host_ed25519');
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', host]);
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', shared.keyFile]);
  const publicKey = (await run('cat', [`${shared.keyFile}.pub`])).stdout;
  const hostKey = (await run('cat', [`${host}.pub`])).stdout.split(' ').slice(0, 2).join(' ');
  const [port] = await freePorts(1);
  if (port === undefined) throw new Error('No free port for sshd.');
  shared.sshPort = port;
  await writeFile(join(folder, 'authorized_keys'), publicKey, { mode: 0o600 });
  await writeFile(shared.knownHosts, `[127.0.0.1]:${String(port)} ${hostKey}\n`, { mode: 0o600 });
  const config = [
    `Port ${String(port)}`,
    'ListenAddress 127.0.0.1',
    `HostKey ${host}`,
    `PidFile ${join(folder, 'sshd.pid')}`,
    `AuthorizedKeysFile ${join(folder, 'authorized_keys')}`,
    'UsePAM no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    'PubkeyAuthentication yes',
    'StrictModes no',
    'LogLevel ERROR',
    'Subsystem sftp /usr/lib/ssh/sftp-server',
    '',
  ].join('\n');
  const configFile = join(folder, 'sshd_config');
  await writeFile(configFile, config);
  shared.sshPid = await startDetached({
    command: '/usr/bin/sshd',
    args: ['-D', '-e', '-f', configFile],
    log: join(folder, 'sshd.log'),
  });
  await waitFor('sshd to listen', () => portOpen(port), START_TIMEOUT_MS, 100);
}

export async function ensureDav(): Promise<void> {
  if (shared.davPid !== 0) return;
  const [port] = await freePorts(1);
  if (port === undefined) throw new Error('No free port for the WebDAV server.');
  shared.davPort = port;
  shared.davPid = await startDetached({
    command: 'rclone',
    args: ['serve', 'webdav', serveFolder, '--addr', `127.0.0.1:${String(port)}`],
    log: join(SERVICES, 'dav.log'),
  });
  await waitFor('the WebDAV server to listen', () => portOpen(port), START_TIMEOUT_MS, 100);
}

function smbConfig(folder: string, port: number): string {
  return [
    '[global]',
    'workgroup = BENCH',
    `ncalrpc dir = ${join(folder, 'ncalrpc')}`,
    'server services = smb',
    'rpc start on demand helpers = no',
    'server role = standalone server',
    'security = user',
    'map to guest = Bad User',
    `guest account = ${userInfo().username}`,
    `smb ports = ${String(port)}`,
    'bind interfaces only = yes',
    'interfaces = 127.0.0.1',
    `private dir = ${join(folder, 'private')}`,
    `lock directory = ${join(folder, 'lock')}`,
    `state directory = ${join(folder, 'state')}`,
    `cache directory = ${join(folder, 'cache')}`,
    `pid directory = ${join(folder, 'pid')}`,
    `log file = ${join(folder, 'log.%m')}`,
    'log level = 1',
    'load printers = no',
    'printing = bsd',
    'printcap name = /dev/null',
    'disable spoolss = yes',
    'server min protocol = SMB3',
    'unix extensions = no',
    'disable netbios = yes',
    '[bench]',
    `path = ${serveFolder}`,
    'guest ok = yes',
    'read only = no',
    'create mask = 0666',
    'directory mask = 0777',
    '',
  ].join('\n');
}

export async function ensureSmb(): Promise<void> {
  if (shared.smbPid !== 0) return;
  const folder = join(SERVICES, 'smb');
  for (const name of ['private', 'lock', 'state', 'cache', 'pid', 'ncalrpc'])
    await mkdir(join(folder, name), { recursive: true, mode: 0o700 });
  const [port] = await freePorts(1);
  if (port === undefined) throw new Error('No free port for Samba.');
  shared.smbPort = port;
  await chmod(serveFolder, 0o777);
  const configFile = join(folder, 'smb.conf');
  await writeFile(configFile, smbConfig(folder, port));
  shared.smbPid = await startDetached({
    command: 'smbd',
    args: ['--foreground', '--no-process-group', '--debug-stdout', '-l', folder, '-s', configFile],
    log: join(folder, 'smbd.out'),
  });
  await waitFor('Samba to listen', () => portOpen(port), START_TIMEOUT_MS, 100);
}

export async function stopShared(): Promise<void> {
  for (const pid of [shared.sshPid, shared.davPid, shared.smbPid])
    if (pid !== 0 && alive(pid)) await stopProcess(pid, STOP_MS);
  shared.sshPid = 0;
  shared.davPid = 0;
  shared.smbPid = 0;
  try {
    await run('sudo', ['-n', 'exportfs', '-u', `127.0.0.1:${serveFolder}`]);
  } catch (cause) {
    process.stderr.write(
      `exportfs -u: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
  }
  if (await exists(nfsMarker)) {
    await run('sudo', ['-n', 'systemctl', 'stop', 'nfs-server']);
    await rm(nfsMarker, { force: true });
  }
}
