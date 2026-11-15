import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { REPO, TMP } from '../paths.ts';
import { run, waitFor } from '../processes.ts';
import { BENCH, NAS, bench } from './paths.ts';
import { copyToNas, remote } from './ssh.ts';
import type { Target, Wrapped } from './target.ts';

const PORT_TIMEOUT_MS = 15_000;
const MOUNT_OPTIONS = [
  'vers=3',
  'proto=tcp',
  `port=${String(NAS.nfsPort)}`,
  `mountport=${String(NAS.nfsPort)}`,
  'nolock',
  'hard',
  'noresvport',
  'rsize=1048576',
  'wsize=1048576',
].join(',');

function toolPath(name: string): string {
  return `${NAS.toolFolder}/${name}`;
}

function reachable(): Promise<true | undefined> {
  return new Promise((resolve) => {
    const socket = connect({ host: NAS.address, port: NAS.nfsPort });
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

async function patchedModule(folder: string, environment: Record<string, string>): Promise<string> {
  const original = (
    await run('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/willscott/go-nfs'], {
      cwd: folder,
      env: environment,
    })
  ).stdout.trim();
  const patched = join(BENCH, 'go-nfs');
  await rm(patched, { recursive: true, force: true });
  await cp(original, patched, { recursive: true });
  await run('chmod', ['-R', 'u+w', patched]);
  await cp(join(folder, '_overlay'), patched, { recursive: true, force: true });
  return patched;
}

async function buildServer(): Promise<void> {
  await mkdir(bench.bin, { recursive: true });
  const folder = join(REPO, 'tooling', 'drive-fs-rig', 'bench', 'nfsd');
  const environment = { CGO_ENABLED: '0', TMPDIR: TMP };
  const patched = await patchedModule(folder, environment);
  const modfile = join(BENCH, 'nfsd.mod');
  const original = await readFile(join(folder, 'go.mod'), 'utf8');
  await writeFile(modfile, `${original}\nreplace github.com/willscott/go-nfs => ${patched}\n`);
  await cp(join(folder, 'go.sum'), join(BENCH, 'nfsd.sum'));
  await run('go', ['build', '-trimpath', '-modfile', modfile, '-o', bench.nfsdBinary, '.'], {
    cwd: folder,
    env: environment,
  });
}

export async function startNfsServer(): Promise<void> {
  await stopNfsServer();
  await buildServer();
  await remote(`mkdir -p ${NAS.toolFolder} ${NAS.exportFolder}`);
  await copyToNas(bench.nfsdBinary, toolPath(NAS.nfsdName));
  await remote(
    `chmod 755 ${toolPath(NAS.nfsdName)}; cd ${NAS.toolFolder}; ` +
      `setsid nohup ./${NAS.nfsdName} -addr ${NAS.address}:${String(NAS.nfsPort)} ${NAS.exportFolder} ` +
      `> nfsd.log 2>&1 < /dev/null &`,
  );
  await waitFor('the NFS server on the NAS to accept connections', reachable, PORT_TIMEOUT_MS, 200);
}

export async function nfsServerErrors(): Promise<string> {
  return remote(
    `grep -v -e 'No handler for' -e "lack of support for 'exclusive'" -e listening ${toolPath('nfsd.log')} 2>/dev/null | tail -40; true`,
  );
}

export async function stopNfsServer(): Promise<void> {
  await remote(
    `pkill -x ${NAS.nfsdName}; sleep 0.5; rm -rf ${NAS.toolFolder} ${NAS.exportFolder}; true`,
  );
}

export function nfsTarget(): Target {
  const point = bench.nfsMount;
  return {
    kind: 'nfs',
    root: point,
    async mount(): Promise<void> {
      await mkdir(point, { recursive: true });
      await run('sudo', [
        '-n',
        'mount',
        '-t',
        'nfs',
        '-o',
        MOUNT_OPTIONS,
        `${NAS.address}:/`,
        point,
      ]);
    },
    async unmount(): Promise<void> {
      await run('sudo', ['-n', 'umount', point]);
    },
    wrap(command: string, args: readonly string[]): Wrapped {
      return { command, args };
    },
    drain(): readonly string[] {
      return [];
    },
  };
}
