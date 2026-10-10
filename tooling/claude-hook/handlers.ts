import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { format, lint, spell } from './checks.ts';
import { loadGraph } from './graph.ts';
import {
  agentInput,
  bashInput,
  editInput,
  HookError,
  parseInput,
  snapshotInput,
  type AgentInput,
} from './input.ts';
import { report, timedOut, type Section } from './output.ts';
import {
  GIT_MS,
  INSTALL_LOCK,
  INSTALL_TURNSTILE,
  nonEmptyLines,
  PROJECT_TSC_MS,
  ROOT,
  run,
  runTool,
  workspaceTsc,
  WORKSPACE_TSC_MS,
} from './process.ts';
import {
  addLines,
  agentFile,
  agentName,
  closeWindow,
  hashManifests,
  readManifests,
  openWindows,
  readOriginals,
  readSnapshot,
  removeSession,
  saveOriginal,
  writeAtomic,
} from './state.ts';
import { affectsTypes, countErrors, judge, owningProject } from './types.ts';

const PNPM_CHANGES = new Set([
  'add',
  'remove',
  'rm',
  'uninstall',
  'un',
  'up',
  'update',
  'upgrade',
  'install',
  'i',
  'dedupe',
  'pkg',
  'patch-commit',
  'patch-remove',
  'import',
  'link',
  'ln',
  'unlink',
  'prune',
  'approve-builds',
]);
const CONFIG_WRITES = new Set(['set', 'delete']);
const PNPM_READ_ONLY = new Set([
  'run',
  'exec',
  'test',
  't',
  'ls',
  'list',
  'll',
  'why',
  'outdated',
  'view',
  'info',
  'show',
  'store',
  'help',
  'bin',
  'root',
  'dlx',
  'create',
  'licenses',
  'config',
  'audit',
  'patch',
]);

async function repoPath(filePath: string, mustExist: boolean): Promise<string | null> {
  const rel = relative(ROOT, resolve(ROOT, filePath));
  const outside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (outside || (mustExist && !existsSync(join(ROOT, rel)))) return null;
  const result = await run('git', ['check-ignore', '-q', rel], GIT_MS);
  if (result.code === 0) return null;
  if (result.code === 1) return rel;
  const reason = nonEmptyLines(result.stderr)[0] ?? result.detail;
  throw new HookError('GitCheckError', `git check-ignore ${rel}: ${reason}`);
}

function changesInSegment(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  const start = words.indexOf('pnpm');
  if (start === -1) return false;
  const rest = words.slice(start + 1).filter((word) => !word.startsWith('-'));
  const command = rest.find((word) => PNPM_CHANGES.has(word) || PNPM_READ_ONLY.has(word));
  if (command === 'audit') return words.includes('--fix');
  if (command === 'config') return CONFIG_WRITES.has(rest[rest.indexOf('config') + 1] ?? '');
  return command !== undefined && PNPM_CHANGES.has(command);
}

function changesDependencies(command: string): boolean {
  return command.split(/&&|\|\||[;|\n]/).some(changesInSegment);
}

async function typecheck(rel: string, input: AgentInput): Promise<readonly Section[]> {
  const project = affectsTypes(rel) ? owningProject(rel) : null;
  if (project === null) return [];
  const check = `tsc -b ${project}`;
  const result = await runTool('tsc', ['-b', project, '--pretty', 'false'], PROJECT_TSC_MS);
  if (result.timedOut) return [timedOut(check, PROJECT_TSC_MS)];
  const graph = await loadGraph();
  if (!graph.ok) return [{ check: `${check} (project setup)`, lines: [graph.reason] }];
  const agent = agentName(input);
  const snapshot = await readSnapshot(input.session_id, agent);
  const originals = await readOriginals(input.session_id, agent);
  const windows = await openWindows(input.session_id, agent);
  const claim = { files: [rel], snapshot, originals, peers: windows, label: 'caused by this edit' };
  const judgement = judge(check, result, graph.graph, claim);
  return [...judgement.sections, ...(judgement.paused === null ? [] : [judgement.paused.section])];
}

export async function onEdit(raw: unknown): Promise<number> {
  const input = parseInput('edit', editInput, raw);
  const rel = await repoPath(input.tool_input.file_path, true);
  if (rel === null) return 0;
  await addLines(agentFile(input.session_id, agentName(input), 'edited'), [rel]);
  await addLines(agentFile(input.session_id, agentName(input), 'window'), [rel]);
  const [linted, formatted, spelled, typed] = await Promise.all([
    lint(rel),
    format(rel),
    spell(rel),
    typecheck(rel, input),
  ]);
  return report(`Checks failed for ${rel}:`, [linted, formatted, spelled, ...typed]);
}

async function ensureSnapshot(input: AgentInput): Promise<boolean> {
  const path = agentFile(input.session_id, agentName(input), 'snapshot.json');
  if (existsSync(path)) return false;
  const result = await workspaceTsc();
  const counts = countErrors(result.stdout);
  const broken = result.code !== 0 && Object.keys(counts).length === 0;
  const reason = nonEmptyLines(`${result.stdout}\n${result.stderr}`)[0] ?? result.detail;
  const failed = result.timedOut
    ? `the snapshot timed out after ${String(WORKSPACE_TSC_MS / 1000)} s`
    : `the snapshot failed: ${reason}`;
  await writeAtomic(path, JSON.stringify(result.timedOut || broken ? { failed } : { counts }));
  return true;
}

function lockedCommand(toolInput: Record<string, unknown>, command: string): number {
  const quoted = `'${command.replaceAll("'", `'\\''`)}'`;
  const locked = `flock -x ${INSTALL_TURNSTILE} flock -x ${INSTALL_LOCK} bash -c ${quoted}`;
  const updatedInput = { ...toolInput, command: locked };
  const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return 0;
}

export async function onSnapshot(raw: unknown): Promise<number> {
  const input = parseInput('snapshot', snapshotInput, raw);
  if (input.tool_name !== 'Bash') {
    const rel = await repoPath(input.tool_input.file_path, false);
    if (rel === null || !affectsTypes(rel)) return 0;
    await ensureSnapshot(input);
    await saveOriginal(input.session_id, agentName(input), rel);
    return 0;
  }
  const { command, run_in_background: background } = input.tool_input;
  if (!changesDependencies(command)) return 0;
  if (background === true) {
    process.stderr.write(
      'claude-hook: run pnpm dependency changes in the foreground so they can be checked\n',
    );
    return 2;
  }
  const agent = agentName(input);
  await writeAtomic(
    agentFile(input.session_id, agent, 'manifests.json'),
    JSON.stringify(await hashManifests()),
  );
  if (await ensureSnapshot(input)) {
    await writeAtomic(agentFile(input.session_id, agent, 'snapshot-by-pnpm'), '1');
  }
  return lockedCommand(input.tool_input, command);
}

export async function onBashDone(raw: unknown): Promise<number> {
  const input = parseInput('bash-done', bashInput, raw);
  const agent = agentName(input);
  const path = agentFile(input.session_id, agent, 'manifests.json');
  const before = await readManifests(path);
  if (before === null) return 0;
  const after = await hashManifests();
  await rm(path, { force: true });
  const files = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...files].filter((file) => before[file] !== after[file]);
  const marker = agentFile(input.session_id, agent, 'snapshot-by-pnpm');
  if (changed.length === 0 && existsSync(marker)) await closeWindow(input.session_id, agent);
  await rm(marker, { force: true });
  await addLines(agentFile(input.session_id, agent, 'edited'), changed);
  await addLines(agentFile(input.session_id, agent, 'window'), changed);
  return 0;
}

export async function onEnd(raw: unknown): Promise<number> {
  const input = parseInput('end', agentInput, raw);
  await removeSession(input.session_id);
  return 0;
}
