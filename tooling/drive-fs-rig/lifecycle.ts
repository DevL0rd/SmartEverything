import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stdout } from 'node:process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { isDenied, isGone, isMissing } from './errors.ts';
import {
  COMPUTER_NAMES,
  SCRATCH,
  files,
  saveState,
  type ComputerName,
  type ComputerState,
  type RigState,
} from './paths.ts';
import { stopProcess } from './processes.ts';

const execute = promisify(execFile);

const HELPER_STOP_MS = 15_000;
const NETCUT_STOP_MS = 5_000;
const HUB_STOP_MS = 30_000;
const STRAY_STOP_MS = 5_000;

const PIDS_FILE = z.strictObject({
  hub: z.int().positive().nullable(),
  netcut: z.int().positive().nullable(),
  helpers: z.array(z.int().positive()),
});

type Pids = z.infer<typeof PIDS_FILE>;

const NO_PIDS: Pids = { hub: null, netcut: null, helpers: [] };

async function readPids(): Promise<Pids> {
  try {
    return PIDS_FILE.parse(JSON.parse(await readFile(files.pids, 'utf8')));
  } catch (cause) {
    if (isMissing(cause)) return NO_PIDS;
    throw cause;
  }
}

async function writePids(pids: Pids): Promise<void> {
  await mkdir(files.run, { recursive: true, mode: 0o700 });
  await writeFile(files.pids, `${JSON.stringify(pids)}\n`);
}

export async function resetPids(): Promise<void> {
  await writePids(NO_PIDS);
}

export async function rememberHub(pid: number): Promise<void> {
  await writePids({ ...(await readPids()), hub: pid });
}

export async function rememberNetcut(pid: number): Promise<void> {
  await writePids({ ...(await readPids()), netcut: pid });
}

export async function rememberHelpers(state: RigState): Promise<void> {
  const helpers = COMPUTER_NAMES.flatMap((name) => {
    const { helperPid, holderPid } = state.computers[name];
    return [helperPid, holderPid].flatMap((pid) => (pid === null ? [] : [pid]));
  });
  await writePids({ ...(await readPids()), helpers });
}

export async function scratchExists(): Promise<boolean> {
  try {
    await readdir(SCRATCH);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

export async function requireNoRig(): Promise<void> {
  if (await scratchExists()) throw new Error(`${SCRATCH} already exists. Run "rig down" first.`);
}

async function ancestors(): Promise<ReadonlySet<number>> {
  const found = new Set<number>([process.pid]);
  let pid = process.pid;
  while (pid > 1) {
    const stat = await readFile(`/proc/${String(pid)}/stat`, 'utf8');
    pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    found.add(pid);
  }
  return found;
}

async function mentionsScratch(entry: string): Promise<boolean> {
  try {
    const command = await readFile(`/proc/${entry}/cmdline`, 'utf8');
    return command.replaceAll('\0', ' ').includes(SCRATCH);
  } catch (cause) {
    if (isGone(cause)) return false;
    throw cause;
  }
}

async function strays(): Promise<readonly number[]> {
  const mine = await ancestors();
  const found: number[] = [];
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/u.test(entry) || mine.has(Number(entry))) continue;
    if (await mentionsScratch(entry)) found.push(Number(entry));
  }
  return found;
}

async function removeScratch(): Promise<void> {
  try {
    await rm(SCRATCH, { recursive: true, force: true });
  } catch (cause) {
    if (!isDenied(cause)) throw cause;
    await execute('unshare', ['--user', '--map-auto', '--map-root-user', 'rm', '-rf', SCRATCH]);
  }
  if (await scratchExists()) throw new Error(`${SCRATCH} could not be removed.`);
}

export async function down(): Promise<void> {
  const pids = await readPids();
  for (const pid of pids.helpers) await stopProcess(pid, HELPER_STOP_MS);
  if (pids.netcut !== null) await stopProcess(pids.netcut, NETCUT_STOP_MS);
  if (pids.hub !== null) await stopProcess(pids.hub, HUB_STOP_MS);
  for (const pid of await strays()) await stopProcess(pid, STRAY_STOP_MS);
  const left = await strays();
  if (left.length > 0)
    throw new Error(`Processes of the rig are still running: ${left.join(', ')}`);
  await removeScratch();
  stdout.write('The rig is down and its scratch folder is gone.\n');
}

export async function replaceComputer(
  state: RigState,
  name: ComputerName,
  computer: ComputerState,
): Promise<RigState> {
  const next: RigState = { ...state, computers: { ...state.computers, [name]: computer } };
  await saveState(next);
  await rememberHelpers(next);
  return next;
}
