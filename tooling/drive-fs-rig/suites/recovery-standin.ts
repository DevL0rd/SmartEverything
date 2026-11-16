import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { awaitMounted, killHelper, sendControl } from '../helper.ts';
import { replaceComputer } from '../lifecycle.ts';
import { routeLine } from '../mounting.ts';
import {
  TMP,
  files,
  loadState,
  type ComputerName,
  type RigState,
  type RouteChoice,
} from '../paths.ts';
import { alive, descendantRunning, run, sleep, stopProcess, waitFor } from '../processes.ts';

const START_TIMEOUT_MS = 10_000;
const HELPER_STOP_MS = 15_000;
const STANDIN_STOP_MS = 3000;
const EXIT_AFTER_EOF_MS = 60_000;

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
  'mount --bind "$1" /etc/passwd && mount --bind "$2" /etc/group && exec env SE_DRIVE_MOUNT_RIG=allow_other,direct_mount "$3" -cache "$4" 3<"$5" >"$6" 2>"$7"';

const PIPELINE = 'fifo=$1; copy=$2; shift 2; tee -a -- "$copy" <>"$fifo" | "$@"';

export interface StartOptions {
  readonly keepCache: boolean;
  readonly route: RouteChoice;
}

async function teeBinary(): Promise<string> {
  return realpath('/usr/bin/tee');
}

async function standinOf(state: RigState, name: ComputerName): Promise<number | undefined> {
  const holder = state.computers[name].holderPid;
  if (holder === null) return undefined;
  return descendantRunning(holder, await teeBinary());
}

async function launchPipeline(state: RigState, name: ComputerName): Promise<number> {
  const directory = files.computer(name);
  await mkdir(join(directory, 'cache'), { recursive: true, mode: 0o700 });
  await rm(files.control(name), { force: true });
  await run('mkfifo', ['-m', '600', files.control(name)]);
  await writeFile(files.status(name), '');
  const log = openSync(files.helperLog(name), 'a');
  try {
    const child = spawn(
      'sh',
      [
        '-c',
        PIPELINE,
        'sh',
        files.control(name),
        join(directory, 'control.log'),
        'unshare',
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
        files.status(name),
        files.helperLog(name),
      ],
      { detached: true, stdio: ['ignore', log, log], env: { ...env, TMPDIR: TMP } },
    );
    child.unref();
    if (child.pid === undefined) throw new Error('The stand-in pipeline did not start');
    return child.pid;
  } finally {
    closeSync(log);
  }
}

export async function startStandin(
  state: RigState,
  name: ComputerName,
  options: StartOptions,
): Promise<RigState> {
  const computer = state.computers[name];
  if (!options.keepCache) await rm(files.computer(name), { recursive: true, force: true });
  const holderPid = await launchPipeline(state, name);
  const helperPid = await waitFor(
    `the helper of ${name} to start inside its namespace`,
    () => {
      if (!alive(holderPid)) throw new Error(`The stand-in of ${name} exited at start`);
      return descendantRunning(holderPid, files.helperBinary);
    },
    START_TIMEOUT_MS,
    50,
  );
  const started = await replaceComputer(state, name, {
    ...computer,
    holderPid,
    helperPid,
    mount: null,
  });
  await waitFor(
    `the stand-in of ${name} to hold the control pipe`,
    () => standinOf(started, name),
    START_TIMEOUT_MS,
    50,
  );
  await sendControl(name, routeLine(started, name, options.route));
  const point = files.mountPoint(name);
  await mkdir(point, { recursive: true, mode: 0o755 });
  const id = started.computers[name].placement;
  await sendControl(name, { op: 'mount', mount: id, root: started.ownerRoot, point });
  await awaitMounted(name, id);
  return replaceComputer(started, name, {
    ...started.computers[name],
    mount: {
      id,
      root: started.ownerRoot,
      folder: null,
      placement: 'test',
      point,
      route: options.route,
    },
  });
}

export async function reapStandin(state: RigState, name: ComputerName): Promise<RigState> {
  const computer = state.computers[name];
  const standin = await standinOf(state, name);
  if (computer.helperPid !== null) await stopProcess(computer.helperPid, HELPER_STOP_MS);
  if (standin !== undefined) await stopProcess(standin, STANDIN_STOP_MS);
  if (computer.holderPid !== null) await stopProcess(computer.holderPid, STANDIN_STOP_MS);
  return replaceComputer(state, name, {
    ...computer,
    helperPid: null,
    holderPid: null,
    mount: null,
  });
}

export async function killStandin(state: RigState, name: ComputerName): Promise<void> {
  const standin = await standinOf(state, name);
  if (standin === undefined) throw new Error(`The stand-in of ${name} is not running.`);
  process.kill(standin, 'SIGKILL');
}

export async function awaitHelperExit(state: RigState, name: ComputerName): Promise<boolean> {
  const pid = state.computers[name].helperPid;
  if (pid === null) return true;
  const deadline = Date.now() + EXIT_AFTER_EOF_MS;
  while (alive(pid) && Date.now() < deadline) await sleep(100);
  return !alive(pid);
}

export async function crashHelper(state: RigState, name: ComputerName): Promise<void> {
  await killHelper(state.computers[name], 'SIGKILL');
}

export async function ensureMounted(name: ComputerName): Promise<RigState> {
  const state = await loadState();
  const computer = state.computers[name];
  if (
    computer.helperPid !== null &&
    alive(computer.helperPid) &&
    computer.mount !== null &&
    (await standinOf(state, name)) !== undefined
  )
    return state;
  const cleared = await reapStandin(state, name);
  return startStandin(cleared, name, { keepCache: false, route: 'lan' });
}

export async function restartKeepingJournal(
  state: RigState,
  name: ComputerName,
  route: RouteChoice,
): Promise<RigState> {
  const reaped = await reapStandin(state, name);
  return startStandin(reaped, name, { keepCache: true, route });
}
