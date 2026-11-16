import { stdout } from 'node:process';
import { constants } from 'node:os';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { execIn, killHelper, netcutCommand, sendControl } from './helper.ts';
import { ensureFolder } from './hub-api.ts';
import { ownerToken } from './hub-setup.ts';
import { replaceComputer } from './lifecycle.ts';
import { isId, mountComputer, routeLine, unmountComputer } from './mounting.ts';
import {
  PLACEMENTS,
  computerName,
  loadState,
  routeChoice,
  routeName,
  type RigState,
} from './paths.ts';
import { alive } from './processes.ts';

const PLACEMENT = z.enum(PLACEMENTS);
const FOLDER_NAME = z.string().regex(/^[A-Za-z0-9._-]+$/u);
const NET_VERB = z.enum(['cut', 'cutreply', 'stall', 'reset', 'restore']);

async function folderOf(
  state: RigState,
  placement: (typeof PLACEMENTS)[number],
  name: string,
): Promise<string> {
  return ensureFolder(
    state.http,
    await ownerToken(),
    {
      rootId: placement === 'test' ? state.ownerRoot : state.scratch.root,
      directory: state.driveFolders[placement],
    },
    name,
  );
}

async function resolveFolder(
  state: RigState,
  placement: string,
  folder: string | undefined,
): Promise<string | null> {
  if (folder === undefined) return null;
  if (isId(folder)) return folder;
  const place = PLACEMENT.safeParse(placement);
  if (!place.success) throw new Error('A folder given by name needs --placement test or scratch.');
  return folderOf(state, place.data, folder);
}

export async function mount(args: readonly string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      placement: { type: 'string' },
      folder: { type: 'string' },
      route: { type: 'string' },
    },
  });
  const name = computerName(positionals[0]);
  const state = await loadState();
  const placement = values.placement ?? 'test';
  const started = await mountComputer(state, name, {
    placement,
    folder: await resolveFolder(state, placement, values.folder),
    route: routeChoice(values.route ?? 'lan'),
  });
  await replaceComputer(state, name, started);
  stdout.write(`${started.mount?.point ?? ''}\n`);
}

export async function unmount(args: readonly string[]): Promise<void> {
  const name = computerName(args[0]);
  const state = await loadState();
  await replaceComputer(state, name, await unmountComputer(state.computers[name]));
}

export async function route(args: readonly string[]): Promise<void> {
  const name = computerName(args[0]);
  const target = routeChoice(args[1]);
  const state = await loadState();
  const mounted = state.computers[name].mount;
  if (mounted === null) throw new Error(`${name} has no mount; run "rig mount ${name}" first.`);
  await sendControl(name, routeLine(state, name, target));
  await replaceComputer(state, name, {
    ...state.computers[name],
    mount: { ...mounted, route: target },
  });
}

export async function net(args: readonly string[]): Promise<void> {
  if (args[0] === 'status') {
    stdout.write(`${await netcutCommand('status')}\n`);
    return;
  }
  const subject = args[0] === 'all' ? 'all' : computerName(args[0]);
  const verb = NET_VERB.parse(args[1]);
  const which = args[2] === undefined ? '' : `-${routeName(args[2])}`;
  const reply = await netcutCommand(`${verb} ${subject}${which}`);
  if (reply !== 'ok') throw new Error(reply);
}

function signalName(value: string): string {
  const name = `SIG${value.replace(/^SIG/u, '')}`;
  if (!(name in constants.signals)) throw new Error(`${value} is not a signal name.`);
  return name;
}

export async function kill(args: readonly string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: { signal: { type: 'string' } },
  });
  const state = await loadState();
  await killHelper(
    state.computers[computerName(positionals[0])],
    signalName(values.signal ?? 'KILL'),
  );
}

export async function exec(args: readonly string[]): Promise<number> {
  const name = computerName(args[0]);
  const separator = args.indexOf('--');
  const command = separator === -1 ? args.slice(1) : args.slice(separator + 1);
  if (command.length === 0) throw new Error('Name a command after "--".');
  const state = await loadState();
  return execIn(state.computers[name], command);
}

export async function folder(args: readonly string[]): Promise<void> {
  const placement = PLACEMENT.parse(args[0]);
  const name = FOLDER_NAME.parse(args[1]);
  stdout.write(`${await folderOf(await loadState(), placement, name)}\n`);
}

export async function status(): Promise<void> {
  const state = await loadState();
  const running = (pid: number | null): boolean => pid !== null && alive(pid);
  const shown = {
    ...state,
    alive: {
      hub: alive(state.hubPid),
      netcut: alive(state.netcutPid),
      A: running(state.computers.A.helperPid),
      B: running(state.computers.B.helperPid),
    },
  };
  stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
}
