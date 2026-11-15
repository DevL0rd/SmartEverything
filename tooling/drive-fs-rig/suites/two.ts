import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sleep } from '../processes.ts';
import type { ComputerName, RigState } from '../paths.ts';
import { inside, walkMounted, withTimeout, type Running } from './recovery-inside.ts';
import { runSuite, type Context, type SuiteCase } from './recovery-runner.ts';
import { parseWriterLog, renamedFolderEntries } from './two-checks.ts';
import { lockCase } from './two-locks.ts';
import { EDIT_TOOL, INSERT_TOOL, WRITER_TOOL } from './two-scripts.ts';
import {
  HUB_LIMIT_MS,
  OFFLINE_SETTLE_MS,
  PEERS,
  ROWS_PER_COMPUTER,
  SCRIPT_LIMIT_MS,
  VISIBLE_LIMIT_MS,
  expectConflict,
  finished,
  hubHas,
  netcut,
  script,
  seedShared,
  setup,
  sees,
  source,
  teardown,
  touch,
  waitFile,
} from './two-support.ts';
import {
  CACHE,
  awaitHub,
  awaitView,
  capture,
  entryOf,
  hubPath,
  mountPath,
  mustRun,
  pollUntil,
  withDefaultRepeat,
} from './workloads-shared.ts';

async function writeThenRead(context: Context): Promise<void> {
  const prepared = await setup(context, 'write-read');
  const { state, relative } = prepared;
  const directory = mountPath('B', relative);
  await mustRun(state.computers.B, 'listing before', ['ls', '-A', directory]);
  if (
    (await inside(state.computers.B, ['test', '-e', join(directory, 'note.bin')]).done).code === 0
  )
    throw new Error('B shows the file before A wrote it.');
  const versions = [randomBytes(3 << 20), randomBytes(700 << 10), randomBytes(12)];
  for (const [index, content] of versions.entries()) {
    const reference = await source(prepared, `v${String(index)}`, content);
    await mustRun(state.computers.A, `A writes version ${String(index + 1)}`, [
      'cp',
      reference,
      mountPath('A', relative, 'note.bin'),
    ]);
    const latency = await sees(state, 'B', mountPath('B', relative, 'note.bin'), reference);
    context.notes.push(`B saw version ${String(index + 1)} after ${String(latency)} ms`);
  }
  const last = versions.at(-1);
  if (last === undefined) throw new Error('No versions.');
  await awaitHub(state, relative, [entryOf('note.bin', last)]);
  await teardown(prepared);
}

async function sameFileConflict(context: Context): Promise<void> {
  const prepared = await setup(context, 'conflict');
  const { state, relative, signals } = prepared;
  await seedShared(prepared, 'doc.txt', Buffer.from('base\n'));
  const contentA = randomBytes(300 << 10);
  const contentB = randomBytes(200 << 10);
  const edits = new Map<ComputerName, Running>();
  const gates = new Map<ComputerName, { go: string; done: string }>();
  for (const [name, content] of [
    ['A', contentA],
    ['B', contentB],
  ] as const) {
    const ready = join(signals, `ready-${name}`);
    const go = join(signals, `go-${name}`);
    const done = join(signals, `done-${name}`);
    gates.set(name, { go, done });
    edits.set(
      name,
      script(state, name, EDIT_TOOL, [
        mountPath(name, relative, 'doc.txt'),
        await source(prepared, `content-${name}`, content),
        ready,
        go,
        done,
      ]),
    );
    await waitFile(ready);
  }
  const first = gates.get('A');
  const second = gates.get('B');
  const editA = edits.get('A');
  const editB = edits.get('B');
  if (first === undefined || second === undefined || editA === undefined || editB === undefined)
    throw new Error('The edits did not start.');
  await touch(first.go);
  await finished('the edit on A', editA);
  await pollUntil(
    'the Hub to hold the edit of A',
    () => hubHas(join(hubPath(state, relative), 'doc.txt'), contentA),
    HUB_LIMIT_MS,
  );
  await touch(second.go);
  await finished('the edit on B', editB);
  await expectConflict(prepared, 'doc.txt', contentA, contentB);
  await teardown(prepared);
}

async function offlineEditConflict(context: Context): Promise<void> {
  const prepared = await setup(context, 'offline');
  const { state, relative } = prepared;
  await seedShared(prepared, 'plan.txt', randomBytes(200 << 10));
  const contentA = randomBytes(150 << 10);
  const contentB = randomBytes(120 << 10);
  const sourceA = await source(prepared, 'content-A', contentA);
  const sourceB = await source(prepared, 'content-B', contentB);
  await netcut('cut B');
  try {
    const offlineEdit = inside(state.computers.B, [
      'cp',
      sourceB,
      mountPath('B', relative, 'plan.txt'),
    ]);
    await sleep(OFFLINE_SETTLE_MS);
    await mustRun(state.computers.A, 'A edits plan.txt', [
      'cp',
      sourceA,
      mountPath('A', relative, 'plan.txt'),
    ]);
    await pollUntil(
      'the Hub to hold the edit of A',
      () => hubHas(join(hubPath(state, relative), 'plan.txt'), contentA),
      HUB_LIMIT_MS,
    );
    await netcut('restore B');
    const outcome = await withTimeout('the offline edit on B', offlineEdit.done, SCRIPT_LIMIT_MS);
    if (outcome.code !== 0)
      throw new Error(`The offline edit on B failed: ${outcome.stderr.trim()}`);
  } finally {
    await netcut('restore B');
  }
  await expectConflict(prepared, 'plan.txt', contentA, contentB);
  await teardown(prepared);
}

const CHANGES = [
  'for i in $(seq 1 30); do printf "new %s\\n" "$i" > "n$i.txt"; done',
  'printf "changed\\n" > existing.txt',
  'rm gone.txt',
  'mv moved.txt moved-now.txt',
  'mkdir sub',
  'printf "inside\\n" > sub/inner.txt',
].join(' && ');

async function missedPush(context: Context): Promise<void> {
  const prepared = await setup(context, 'missed-push');
  const { state, relative } = prepared;
  for (const name of ['existing.txt', 'gone.txt', 'moved.txt'])
    await seedShared(prepared, name, Buffer.from(`${name}\n`));
  await netcut('cut B');
  try {
    await mustRun(state.computers.A, 'A changes the folder', ['sh', '-c', CHANGES], {
      cwd: mountPath('A', relative),
    });
    const isolated = await inside(state.computers.B, [
      'test',
      '-e',
      mountPath('B', relative, 'n1.txt'),
    ]).done;
    if (isolated.code === 0)
      throw new Error('netcut did not isolate B: it already shows the change.');
    const expected = await walkMounted(state.computers.A, mountPath('A', relative));
    await awaitHub(state, relative, expected);
    await netcut('restore B');
    await awaitView(state, 'B', relative, expected);
  } finally {
    await netcut('restore B');
  }
  await teardown(prepared);
}

const INTEGRITY =
  'pragma integrity_check; select count(*), count(distinct who || ":" || number) from rows';

async function sqliteReport(state: RigState, name: ComputerName, file: string): Promise<string> {
  return (
    await capture(state.computers[name], `sqlite3 on ${name}`, ['sqlite3', file, INTEGRITY])
  ).trim();
}

async function sqliteConcurrent(context: Context): Promise<void> {
  const prepared = await setup(context, 'sqlite');
  const { state, relative } = prepared;
  const file = (name: ComputerName): string => mountPath(name, relative, 'shared.db');
  await mustRun(state.computers.A, 'creating the database', [
    'sqlite3',
    file('A'),
    'create table rows(who text, number integer)',
  ]);
  await pollUntil(
    'B to see the database',
    async () => (await inside(state.computers.B, ['test', '-s', file('B')]).done).code === 0,
    VISIBLE_LIMIT_MS,
  );
  const writers = PEERS.map((name) =>
    finished(
      `the inserts on ${name}`,
      script(state, name, INSERT_TOOL, [file(name), name, String(ROWS_PER_COMPUTER)]),
    ),
  );
  await Promise.all(writers);
  const expected = `ok\n${String(ROWS_PER_COMPUTER * PEERS.length)}|${String(ROWS_PER_COMPUTER * PEERS.length)}`;
  for (const name of PEERS) {
    await pollUntil(
      `${name} to read every row`,
      async () => (await sqliteReport(state, name, file(name))) === expected,
      VISIBLE_LIMIT_MS,
    );
  }
  const view = await walkMounted(state.computers.A, mountPath('A', relative));
  await awaitHub(state, relative, view);
  const hubReport = (
    await capture(state.computers.A, 'sqlite3 on the Hub copy', [
      'sqlite3',
      join(hubPath(state, relative), 'shared.db'),
      INTEGRITY,
    ])
  ).trim();
  if (hubReport !== expected)
    throw new Error(`The database on the Hub reports "${hubReport}", expected "${expected}".`);
  await teardown(prepared);
}

async function renameWhileWriting(context: Context): Promise<void> {
  const prepared = await setup(context, 'rename');
  const { state, relative, signals } = prepared;
  await mustRun(state.computers.A, 'creating dir1', ['mkdir', mountPath('A', relative, 'dir1')]);
  await pollUntil(
    'B to see dir1',
    async () =>
      (await inside(state.computers.B, ['test', '-d', mountPath('B', relative, 'dir1')]).done)
        .code === 0,
    VISIBLE_LIMIT_MS,
  );
  const big = randomBytes(8 << 20);
  const bigSource = await source(prepared, 'big', big);
  const ready = join(signals, 'ready');
  const go = join(signals, 'go');
  const stop = join(signals, 'stop');
  const log = join(signals, 'log');
  const writer = script(state, 'B', WRITER_TOOL, [
    mountPath('B', relative, 'dir1'),
    bigSource,
    ready,
    go,
    stop,
    log,
  ]);
  await waitFile(ready);
  await mustRun(state.computers.A, 'A renames the folder', [
    'mv',
    mountPath('A', relative, 'dir1'),
    mountPath('A', relative, 'dir2'),
  ]);
  await sleep(OFFLINE_SETTLE_MS);
  await touch(go);
  await sleep(OFFLINE_SETTLE_MS);
  await touch(stop);
  await finished('the writer on B', writer);
  const parsed = parseWriterLog(await readFile(log, 'utf8'));
  const expected = renamedFolderEntries('dir2', parsed, big);
  await awaitHub(state, relative, expected);
  for (const name of PEERS) await awaitView(state, name, relative, expected);
  context.notes.push(
    `B created ${String(parsed.created.length)} files, ${String(parsed.refused.length)} refused after the rename`,
  );
  await teardown(prepared);
}

export const CASES: readonly SuiteCase[] = [
  { name: 'a-writes-b-reads', run: writeThenRead },
  { name: 'both-edit-same-file-conflict-copy', run: sameFileConflict },
  { name: 'fcntl-lock-exclusive', run: (context) => lockCase('posix', 'ex', context) },
  { name: 'fcntl-lock-shared', run: (context) => lockCase('posix', 'sh', context) },
  { name: 'flock-exclusive', run: (context) => lockCase('flock', 'ex', context) },
  { name: 'flock-shared', run: (context) => lockCase('flock', 'sh', context) },
  { name: 'sqlite-concurrent-inserts', run: sqliteConcurrent },
  { name: 'rename-folder-while-other-writes-inside', run: renameWhileWriting },
  { name: 'offline-edit-conflict-copy-kept', run: offlineEditConflict },
  { name: 'cut-socket-missed-push-resync', run: missedPush },
];

export async function two(args: readonly string[]): Promise<number> {
  await mkdir(CACHE, { recursive: true, mode: 0o700 });
  return runSuite('two', CASES, withDefaultRepeat(args));
}
