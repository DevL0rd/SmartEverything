import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execPath } from 'node:process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { REPO, RIG, type RigState } from '../paths.ts';
import { walk } from '../manifest.ts';
import { walkMounted } from './recovery-inside.ts';
import { ensureMounted } from './recovery-standin.ts';
import { runSuite, type Context, type SuiteCase } from './recovery-runner.ts';
import { ensureArchives, ensureMirror } from './workloads-fixtures.ts';
import {
  CACHE,
  capture,
  compareTrees,
  convergeOnHub,
  mountPath,
  mustRun,
  removeAndConfirm,
  sha256Of,
  withDefaultRepeat,
} from './workloads-shared.ts';

const execute = promisify(execFile);

const MAKE_FLAGS = ['NO_TCLTK=1'];
const MAKE_JOBS = '-j16';
const GIT_ENVIRONMENT = [
  'env',
  'GIT_CONFIG_COUNT=1',
  'GIT_CONFIG_KEY_0=safe.directory',
  'GIT_CONFIG_VALUE_0=*',
];
const SAVER = join(RIG, 'suites', 'workloads-saver.ts');
const LINES = 2000;
const SAVE_BYTES = 2 << 20;

function relativeFolder(context: Context, suffix: string): string {
  return join('workloads', `${context.token}-${suffix}`);
}

function gitCommand(...args: readonly string[]): readonly string[] {
  return [...GIT_ENVIRONMENT, 'git', ...args];
}

export function textLines(word: string): string {
  return (
    Array.from({ length: LINES }, (_, index) => `${word} line ${String(index)}`).join('\n') + '\n'
  );
}

async function ready(
  context: Context,
  suffix: string,
): Promise<{
  readonly state: RigState;
  readonly relative: string;
}> {
  const state = await ensureMounted('A');
  const relative = relativeFolder(context, suffix);
  await mustRun(state.computers.A, `creating ${relative}`, [
    'mkdir',
    '-p',
    mountPath('A', relative),
  ]);
  return { state, relative };
}

async function finish(state: RigState, relative: string): Promise<void> {
  await convergeOnHub(state, 'A', relative);
  await removeAndConfirm(state, 'A', relative);
}

async function listing(state: RigState, directory: string): Promise<readonly string[]> {
  const text = await capture(state.computers.A, `listing ${directory}`, ['ls', '-A', directory]);
  return text
    .split('\n')
    .filter((line) => line !== '')
    .sort();
}

function expectListing(what: string, actual: readonly string[], expected: readonly string[]): void {
  const wanted = [...expected].sort();
  if (actual.join('\n') !== wanted.join('\n'))
    throw new Error(
      `${what}: the folder holds [${actual.join(', ')}], expected [${wanted.join(', ')}].`,
    );
}

async function modeOf(state: RigState, file: string): Promise<string> {
  return (await capture(state.computers.A, `mode of ${file}`, ['stat', '-c', '%a', file])).trim();
}

async function contentOf(state: RigState, file: string): Promise<string> {
  return capture(state.computers.A, `reading ${file}`, ['cat', file]);
}

function expectEqual(what: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`${what}: the content differs from what was saved.`);
}

async function gitCloneBuild(context: Context): Promise<void> {
  const { state, relative } = await ready(context, 'git');
  const mirror = await ensureMirror();
  const computer = state.computers.A;
  const tree = mountPath('A', relative, 'git');
  await mustRun(computer, 'git clone', gitCommand('clone', '--quiet', mirror, tree));
  const dirty = await capture(
    computer,
    'git status after clone',
    gitCommand('-C', tree, 'status', '--porcelain'),
  );
  if (dirty.trim() !== '') throw new Error(`The fresh clone is not clean:\n${dirty}`);
  await mustRun(computer, 'make', [
    'nice',
    '-n',
    '10',
    'make',
    '-C',
    tree,
    MAKE_JOBS,
    ...MAKE_FLAGS,
  ]);
  await mustRun(computer, 'make test T=t0000-basic.sh', [
    'make',
    '-C',
    tree,
    'test',
    'T=t0000-basic.sh',
    ...MAKE_FLAGS,
  ]);
  await mustRun(computer, 'git status', gitCommand('-C', tree, 'status'));
  await mustRun(computer, 'git diff', gitCommand('-C', tree, 'diff', '--quiet'));
  await mustRun(computer, 'git gc', gitCommand('-C', tree, 'gc', '--quiet'));
  await mustRun(computer, 'git fsck', gitCommand('-C', tree, 'fsck', '--no-dangling'));
  await mustRun(computer, 'git status after gc', gitCommand('-C', tree, 'status', '--porcelain'));
  await finish(state, relative);
}

interface Unpacker {
  readonly name: string;
  readonly archive: 'tarball' | 'zipfile';
  readonly reference: 'tarReference' | 'zipReference';
  readonly command: (archive: string, target: string) => readonly string[];
}

const UNPACKERS: readonly Unpacker[] = [
  {
    name: 'tar',
    archive: 'tarball',
    reference: 'tarReference',
    command: (a, t) => ['tar', 'xzf', a, '-C', t],
  },
  {
    name: 'bsdtar',
    archive: 'tarball',
    reference: 'tarReference',
    command: (a, t) => ['bsdtar', 'xf', a, '-C', t],
  },
  {
    name: 'unzip',
    archive: 'zipfile',
    reference: 'zipReference',
    command: (a, t) => ['unzip', '-q', a, '-d', t],
  },
];

async function unpackCase(unpacker: Unpacker, context: Context): Promise<void> {
  const { state, relative } = await ready(context, unpacker.name);
  const computer = state.computers.A;
  const archives = await ensureArchives();
  const target = mountPath('A', relative, 'out');
  await mustRun(computer, 'mkdir', ['mkdir', '-p', target]);
  await mustRun(computer, unpacker.name, unpacker.command(archives[unpacker.archive], target));
  const reference = archives[unpacker.reference];
  await mustRun(computer, 'diff -r', ['diff', '-r', reference, target]);
  compareTrees(
    `${unpacker.name} extraction differs from the same extraction on the real disk`,
    await walk(reference),
    await walkMounted(computer, target),
    true,
  );
  await finish(state, relative);
}

const VIM_METHODS = [
  ['copy.txt', 'yes'],
  ['rename.txt', 'no'],
] as const;

async function vimEdit(state: RigState, file: string, method: 'yes' | 'no'): Promise<void> {
  await mustRun(state.computers.A, `vim ${file}`, [
    'vim',
    '-es',
    '-u',
    'NONE',
    '-N',
    '-c',
    `set backup writebackup swapfile updatecount=1 backupskip= backupcopy=${method}`,
    '-c',
    '%s/alpha/omega/g',
    '-c',
    'wq',
    file,
  ]);
}

async function vimCase(context: Context): Promise<void> {
  const { state, relative } = await ready(context, 'vim');
  for (const [name] of VIM_METHODS) {
    const seed = join(CACHE, `${context.token}-${name}`);
    await writeFile(seed, textLines('alpha'));
    await mustRun(state.computers.A, `seeding ${name}`, [
      'cp',
      seed,
      mountPath('A', relative, name),
    ]);
  }
  for (const [name, method] of VIM_METHODS)
    await vimEdit(state, mountPath('A', relative, name), method);
  for (const [name] of VIM_METHODS) {
    const file = mountPath('A', relative, name);
    expectEqual(`vim ${name}`, await contentOf(state, file), textLines('omega'));
    expectEqual(`vim backup of ${name}`, await contentOf(state, `${file}~`), textLines('alpha'));
  }
  expectListing('after the vim saves', await listing(state, mountPath('A', relative)), [
    'copy.txt',
    'copy.txt~',
    'rename.txt',
    'rename.txt~',
  ]);
  await finish(state, relative);
}

async function sedCase(context: Context): Promise<void> {
  const { state, relative } = await ready(context, 'sed');
  const computer = state.computers.A;
  const first = mountPath('A', relative, 'one.txt');
  const second = mountPath('A', relative, 'two.txt');
  const seed = join(CACHE, `${context.token}-sed.txt`);
  await writeFile(seed, textLines('alpha'));
  await mustRun(computer, 'seeding', ['cp', seed, first]);
  await mustRun(computer, 'seeding', ['cp', seed, second]);
  await mustRun(computer, 'chmod', ['chmod', '640', first]);
  await mustRun(computer, 'chmod', ['chmod', '755', second]);
  await mustRun(computer, 'sed -i', ['sed', '-i', 's/alpha/omega/g', first, second]);
  for (const file of [first, second])
    expectEqual('sed -i', await contentOf(state, file), textLines('omega'));
  if ((await modeOf(state, first)) !== '640')
    throw new Error('sed -i lost the mode 640 of the first file.');
  if ((await modeOf(state, second)) !== '755')
    throw new Error('sed -i lost the executable bit of the second file.');
  await mustRun(computer, 'sed -i.bak', ['sed', '-i.bak', 's/omega/alpha/g', first]);
  expectEqual('sed -i.bak backup', await contentOf(state, `${first}.bak`), textLines('omega'));
  expectListing('after sed -i', await listing(state, mountPath('A', relative)), [
    'one.txt',
    'one.txt.bak',
    'two.txt',
  ]);
  await finish(state, relative);
}

async function saveCase(kind: 'qt' | 'libreoffice', context: Context): Promise<void> {
  const { state, relative } = await ready(context, kind);
  const computer = state.computers.A;
  const target = mountPath('A', relative, 'document.odt');
  const seed = join(CACHE, `${context.token}-${kind}-seed`);
  await writeFile(seed, 'first version\n');
  await mustRun(computer, 'seeding', ['cp', seed, target]);
  await mustRun(computer, 'chmod', ['chmod', '640', target]);
  const versions = [randomBytes(SAVE_BYTES), randomBytes(17), randomBytes(SAVE_BYTES >> 1)];
  for (const [index, content] of versions.entries()) {
    const source = join(CACHE, `${context.token}-${kind}-${String(index)}`);
    await writeFile(source, content);
    await mustRun(
      computer,
      `${kind} save ${String(index + 1)}`,
      [execPath, '--import', 'tsx', SAVER, kind, target, source],
      { cwd: REPO },
    );
    const sum = (await capture(computer, 'sha256sum', ['sha256sum', target])).split(' ')[0];
    if (sum !== sha256Of(content))
      throw new Error(`After ${kind} save ${String(index + 1)} the mount holds different content.`);
    if ((await modeOf(state, target)) !== '640')
      throw new Error(`After ${kind} save ${String(index + 1)} the mode is no longer 640.`);
  }
  expectListing(`after the ${kind} saves`, await listing(state, mountPath('A', relative)), [
    'document.odt',
  ]);
  await finish(state, relative);
}

async function soffice(): Promise<string | null> {
  try {
    return (
      await execute('sh', ['-c', 'command -v soffice || command -v libreoffice'])
    ).stdout.trim();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 1) return null;
    throw cause;
  }
}

interface Converter {
  readonly state: RigState;
  readonly binary: string;
  readonly profile: string;
}

function convert(
  converter: Converter,
  format: string,
  input: string,
  directory: string,
): Promise<unknown> {
  return mustRun(converter.state.computers.A, `soffice --convert-to ${format}`, [
    converter.binary,
    '--headless',
    `-env:UserInstallation=file://${converter.profile}`,
    '--convert-to',
    format,
    '--outdir',
    directory,
    input,
  ]);
}

async function realLibreOfficeCase(context: Context): Promise<void> {
  const binary = await soffice();
  if (binary === null)
    throw new Error(
      'Not run: LibreOffice is not installed on this PC (sudo pacman -S libreoffice-fresh); the libreoffice-save-sequence case reproduces its save sequence meanwhile.',
    );
  const { state, relative } = await ready(context, 'soffice');
  const computer = state.computers.A;
  const directory = mountPath('A', relative);
  const input = join(directory, 'input.txt');
  const seed = join(CACHE, `${context.token}-soffice.txt`);
  await writeFile(seed, textLines('alpha'));
  await mustRun(computer, 'seeding', ['cp', seed, input]);
  const profile = join(CACHE, 'soffice-profile');
  await mkdir(profile, { recursive: true });
  const converter = { state, binary, profile };
  await convert(converter, 'odt', input, directory);
  await convert(converter, 'pdf', input, directory);
  await convert(converter, 'docx', join(directory, 'input.odt'), directory);
  const header = await capture(computer, 'pdf header', [
    'head',
    '-c',
    '5',
    join(directory, 'input.pdf'),
  ]);
  if (header !== '%PDF-')
    throw new Error('The converted PDF on the mount does not start with %PDF-.');
  for (const name of ['input.odt', 'input.docx'])
    await mustRun(computer, `unzip -t ${name}`, ['unzip', '-tq', join(directory, name)]);
  expectListing('after the LibreOffice conversions', await listing(state, directory), [
    'input.docx',
    'input.odt',
    'input.pdf',
    'input.txt',
  ]);
  await finish(state, relative);
  await rm(profile, { recursive: true, force: true });
}

export const CASES: readonly SuiteCase[] = [
  { name: 'git-clone-build-test-gc', run: gitCloneBuild },
  ...UNPACKERS.map((unpacker) => ({
    name: `unpack-${unpacker.name}`,
    run: (context: Context) => unpackCase(unpacker, context),
  })),
  { name: 'vim-edit-with-backup-and-swap', run: vimCase },
  { name: 'sed-in-place', run: sedCase },
  { name: 'qt-save-kate-kwrite', run: (context) => saveCase('qt', context) },
  { name: 'libreoffice-save-sequence', run: (context) => saveCase('libreoffice', context) },
  { name: 'libreoffice-real-convert', run: realLibreOfficeCase },
];

export async function workloads(args: readonly string[]): Promise<number> {
  await mkdir(CACHE, { recursive: true, mode: 0o700 });
  return runSuite('workloads', CASES, withDefaultRepeat(args));
}
