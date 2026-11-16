import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execPath, stdout } from 'node:process';
import { parseArgs, promisify } from 'node:util';
import { z } from 'zod';
import {
  ENTRY,
  MANIFEST,
  compare,
  ok,
  summary,
  walk,
  type Entry,
  type Manifest,
} from './manifest.ts';
import {
  PLACEMENTS,
  REPO,
  RIG,
  computerName,
  files,
  loadState,
  type ComputerState,
} from './paths.ts';
import { alive } from './processes.ts';

const execute = promisify(execFile);

const MARKER_DIRECTORY = '.smarteverything';
const MANIFEST_NAME = /^[A-Za-z0-9._-]+$/u;
const WALK_BUFFER_BYTES = 256 << 20;

async function manifestFile(name: string): Promise<string> {
  if (!MANIFEST_NAME.test(name))
    throw new Error(
      `The manifest name ${name} may use letters, digits, dot, dash and underscore only.`,
    );
  await mkdir(files.manifests, { recursive: true, mode: 0o700 });
  return join(files.manifests, `${name}.json`);
}

async function walkInside(computer: ComputerState, folder: string): Promise<readonly Entry[]> {
  const pid = computer.helperPid;
  if (pid === null || !alive(pid))
    throw new Error('The helper is not running, so its namespace cannot be entered.');
  const { stdout: out } = await execute(
    'nsenter',
    [
      '--target',
      String(pid),
      '--user',
      '--mount',
      '--pid',
      `--wd=${REPO}`,
      '--',
      execPath,
      '--import',
      'tsx',
      join(RIG, 'rig.ts'),
      'walk',
      folder,
    ],
    { cwd: REPO, maxBuffer: WALK_BUFFER_BYTES },
  );
  return z.array(ENTRY).parse(JSON.parse(out));
}

const OPTIONS = {
  in: { type: 'string' },
  placement: { type: 'string' },
  prefix: { type: 'string' },
  modes: { type: 'boolean' },
} as const;

async function write(
  name: string,
  folder: string | undefined,
  from: string | undefined,
): Promise<number> {
  if (folder === undefined) throw new Error('Name the folder to record.');
  const file = await manifestFile(name);
  const entries =
    from === undefined
      ? await walk(folder)
      : await walkInside((await loadState()).computers[computerName(from)], folder);
  const written: Manifest = {
    name,
    createdAt: new Date().toISOString(),
    entries: [...entries],
  };
  await writeFile(file, `${JSON.stringify(written)}\n`);
  stdout.write(`recorded ${String(entries.length)} entries in ${file}\n`);
  return 0;
}

async function check(
  name: string,
  placement: string | undefined,
  prefix: string | undefined,
  modes: boolean,
): Promise<number> {
  const state = await loadState();
  const wanted = MANIFEST.parse(JSON.parse(await readFile(await manifestFile(name), 'utf8')));
  const where = z.enum(PLACEMENTS).parse(placement ?? 'test');
  const actual = (await walk(join(state.driveFolders[where], prefix ?? ''))).filter(
    (entry) => prefix !== undefined || entry.path.split('/')[0] !== MARKER_DIRECTORY,
  );
  const report = compare(wanted.entries, actual, { modes });
  stdout.write(`${summary(report)}\n`);
  return ok(report) ? 0 : 1;
}

export async function manifest(args: readonly string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: args.slice(1),
    allowPositionals: true,
    options: OPTIONS,
  });
  const name = positionals[0] ?? '';
  if (args[0] === 'write') return write(name, positionals[1], values.in);
  if (args[0] === 'check')
    return check(name, values.placement, values.prefix, values.modes === true);
  throw new Error('Use "manifest write" or "manifest check".');
}

export async function printWalk(folder: string | undefined): Promise<void> {
  const text = `${JSON.stringify(await walk(folder ?? ''))}\n`;
  await new Promise<void>((resolve, reject) => {
    stdout.write(text, (cause) => {
      if (cause === undefined || cause === null) resolve();
      else reject(cause);
    });
  });
}
