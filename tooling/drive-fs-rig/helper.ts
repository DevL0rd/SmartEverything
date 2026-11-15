import { spawn, type StdioOptions } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import { isMissing } from './errors.ts';
import { REPO, TMP, files, type ComputerName, type ComputerState, type RigState } from './paths.ts';
import { alive, descendantRunning, run, sleep, waitFor } from './processes.ts';

const LOOPBACK = 'https://127.0.0.1';
const START_TIMEOUT_MS = 10_000;
const MOUNT_TIMEOUT_MS = 30_000;
const KILL_TIMEOUT_MS = 10_000;

const STATUS_LINE = z.looseObject({
  type: z.string(),
  mount: z.string().optional(),
  state: z.string().optional(),
});

const NAMESPACE = [
  '--user',
  '--map-auto',
  '--map-root-user',
  '--mount',
  '--pid',
  '--fork',
  '--kill-child=SIGKILL',
];

const ENTRY_SCRIPT =
  'mount --bind "$1" /etc/passwd && mount --bind "$2" /etc/group && exec env SE_DRIVE_MOUNT_RIG=allow_other,direct_mount "$3" -cache "$4" 3<"$5" <>"$6" >"$7" 2>"$8"';

export async function buildBinaries(): Promise<void> {
  await mkdir(files.bin, { recursive: true });
  const build = { CGO_ENABLED: '0', TMPDIR: TMP };
  await run('go', ['build', '-trimpath', '-o', files.helperBinary, '.'], {
    cwd: join(REPO, 'tooling', 'drive-mount'),
    env: build,
  });
  await run('go', ['build', '-trimpath', '-o', files.netcutBinary, '.'], {
    cwd: join(REPO, 'tooling', 'drive-fs-rig', 'netcut'),
    env: build,
  });
}

export function routeUrl(computer: ComputerState, route: 'lan' | 'public'): string {
  return `${LOOPBACK}:${String(route === 'lan' ? computer.listenLan : computer.listenPublic)}`;
}

export async function writeEnvironment(state: RigState): Promise<void> {
  const lines = [
    `SE_RIG_RUN=${files.run}`,
    `SE_RIG_HELPER=${files.helperBinary}`,
    `SE_RIG_TOKEN_FILE=${state.computers.A.tokenFile}`,
    `SE_RIG_ROUTE_URL=${routeUrl(state.computers.A, 'lan')}`,
    `SE_RIG_SERVER=${state.serverName}`,
    `SE_RIG_PIN=${state.pin}`,
    `SE_RIG_ROOT_TEST=${state.ownerRoot}`,
    `SE_RIG_ROOT_SCRATCH=${state.homeRoot}`,
    `SE_RIG_PLACEMENT_TEST=${state.computers.A.placements.owner}`,
    `SE_RIG_PLACEMENT_SCRATCH=${state.computers.A.placements.home}`,
  ];
  await writeFile(files.env, `${lines.join('\n')}\n`, { mode: 0o600 });
}

export async function sendControl(name: ComputerName, line: object): Promise<void> {
  await writeFile(files.control(name), `${JSON.stringify(line)}\n`, { flag: 'a' });
}

async function statusLines(name: ComputerName): Promise<readonly z.infer<typeof STATUS_LINE>[]> {
  let text: string;
  try {
    text = await readFile(files.status(name), 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
  const whole = text.slice(0, text.lastIndexOf('\n') + 1);
  return whole
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => STATUS_LINE.parse(JSON.parse(line)));
}

async function mountSettled(name: ComputerName, id: string): Promise<true | undefined> {
  const lines = await statusLines(name);
  const mine = lines.filter((line) => line.type === 'status' && line.mount === id).at(-1);
  if (mine?.state === 'mounted') return true;
  const failure = lines.find(
    (line) => line.type === 'error' || (line.type === 'status' && line.state === 'failed'),
  );
  if (failure !== undefined)
    throw new Error(`The helper of ${name} could not mount: ${JSON.stringify(failure)}`);
  return undefined;
}

export async function awaitMounted(name: ComputerName, id: string): Promise<void> {
  await waitFor(
    `${name} to report mount ${id} as mounted`,
    () => mountSettled(name, id),
    MOUNT_TIMEOUT_MS,
  );
}

async function findHelper(holderPid: number, name: ComputerName): Promise<number | undefined> {
  const found = await descendantRunning(holderPid, files.helperBinary);
  if (found === undefined && !alive(holderPid))
    throw new Error(`The helper of ${name} exited at start; see ${files.helperLog(name)}`);
  return found;
}

function namespaceCommand(state: RigState, name: ComputerName, directory: string): string[] {
  return [
    ...NAMESPACE,
    '--',
    'sh',
    '-c',
    ENTRY_SCRIPT,
    'sh',
    files.passwd,
    files.group,
    files.helperBinary,
    join(directory, 'cache'),
    state.computers[name].tokenFile,
    files.control(name),
    files.status(name),
    files.helperLog(name),
  ];
}

export async function startHelper(
  state: RigState,
  name: ComputerName,
): Promise<{ readonly holderPid: number; readonly helperPid: number }> {
  const directory = files.computer(name);
  await rm(directory, { recursive: true, force: true });
  await mkdir(join(directory, 'cache'), { recursive: true, mode: 0o700 });
  await run('mkfifo', ['-m', '600', files.control(name)]);
  await writeFile(files.status(name), '');
  const log = openSync(files.helperLog(name), 'a');
  try {
    const child = spawn('unshare', namespaceCommand(state, name, directory), {
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...env, TMPDIR: TMP },
    });
    child.unref();
    if (child.pid === undefined) throw new Error('unshare did not start');
    const holderPid = child.pid;
    const helperPid = await waitFor(
      `the helper of ${name} to start inside its namespace`,
      () => findHelper(holderPid, name),
      START_TIMEOUT_MS,
      50,
    );
    return { holderPid, helperPid };
  } finally {
    closeSync(log);
  }
}

export async function killHelper(computer: ComputerState, signal: string): Promise<void> {
  const pid = computer.helperPid;
  if (pid === null || !alive(pid)) throw new Error('The helper is not running.');
  process.kill(pid, signal);
  const deadline = Date.now() + KILL_TIMEOUT_MS;
  while (alive(pid) && Date.now() < deadline) await sleep(50);
}

export async function execIn(
  computer: ComputerState,
  command: readonly string[],
  stdio: StdioOptions = 'inherit',
): Promise<number> {
  const pid = computer.helperPid;
  if (pid === null || !alive(pid))
    throw new Error(
      'The helper is not running, so there is no namespace to enter. Run "rig mount" first.',
    );
  const variables = (await readFile(files.env, 'utf8'))
    .split('\n')
    .filter((line) => line !== '')
    .concat([`SE_RIG_ENV=${files.env}`, `PATH=${files.bin}:${env['PATH'] ?? ''}`]);
  return new Promise((resolve, reject) => {
    const child = spawn(
      'nsenter',
      [
        '--target',
        String(pid),
        '--user',
        '--mount',
        '--pid',
        '--',
        'env',
        ...variables,
        ...command,
      ],
      { stdio },
    );
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 128));
    });
  });
}

export function netcutCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(files.netcutSocket);
    let reply = '';
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      reply += chunk.toString('utf8');
      if (reply.includes('\n')) {
        socket.end();
        resolve(reply.trim());
      }
    });
    socket.write(`${command}\n`);
  });
}
