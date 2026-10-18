import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { format, lint, spell } from './checks.ts';
import { changesDependencies } from './dependencies.ts';
import {
  agentInput,
  bashInput,
  editInput,
  HookError,
  parseInput,
  snapshotInput,
  type AgentInput,
} from './input.ts';
import { report, skippedNotice, timedOut, type Section } from './output.ts';
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
  hashManifests,
  readManifests,
  readSnapshot,
  removeSession,
  writeAtomic,
} from './state.ts';
import { scopeOf } from './projects.ts';
import { ALL, ensureSnapshot } from './snapshot.ts';
import { affectsTypes, judge, owningProject } from './types.ts';

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

async function typecheck(rel: string, input: AgentInput): Promise<readonly Section[]> {
  if (!affectsTypes(rel)) return [];
  const project = owningProject(rel);
  const check = project === null ? 'tsc -b' : `tsc -b ${project}`;
  const limit = project === null ? WORKSPACE_TSC_MS : PROJECT_TSC_MS;
  const result =
    project === null
      ? await workspaceTsc()
      : await runTool('tsc', ['-b', project, '--pretty', 'false'], limit);
  if (skippedNotice(check, result)) return [];
  if (result.timedOut) return [timedOut(check, limit)];
  const snapshot = await readSnapshot(input.session_id, agentName(input));
  return judge(check, result, { files: [rel], snapshot });
}

export async function onEdit(raw: unknown): Promise<number> {
  const input = parseInput('edit', editInput, raw);
  const rel = await repoPath(input.tool_input.file_path, false);
  if (rel === null) return 0;
  await addLines(agentFile(input.session_id, agentName(input), 'edited'), [rel]);
  const present = existsSync(join(ROOT, rel));
  const [linted, formatted, spelled, typed] = await Promise.all([
    present ? lint(rel) : null,
    present ? format(rel) : null,
    present ? spell(rel) : null,
    typecheck(rel, input),
  ]);
  return report(`Checks failed for ${rel}:`, [linted, formatted, spelled, ...typed]);
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
    if (rel !== null && affectsTypes(rel)) await ensureSnapshot(input, scopeOf([rel]));
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
  await writeAtomic(
    agentFile(input.session_id, agentName(input), 'manifests.json'),
    JSON.stringify(await hashManifests()),
  );
  await ensureSnapshot(input, ALL);
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
  await addLines(agentFile(input.session_id, agent, 'edited'), changed);
  return 0;
}

export async function onEnd(raw: unknown): Promise<number> {
  const input = parseInput('end', agentInput, raw);
  await removeSession(input.session_id);
  return 0;
}
