import { type AgentInput } from './input.ts';
import { nonEmptyLines, projectsTsc, WORKSPACE_TSC_MS, type Run } from './process.ts';
import { buildGraph, topsOf, type Scope } from './projects.ts';
import { agentFile, agentName, readSnapshot, writeAtomic } from './state.ts';
import { countErrors, owningProject, parseTsc, type Snapshot } from './types.ts';

export const ALL: Scope = { all: true, projects: [], tops: [] };

function knownProjects(snapshot: Snapshot | null): readonly string[] {
  return snapshot !== null && 'counts' in snapshot ? (snapshot.projects ?? []) : [];
}

function covers(snapshot: Snapshot, scope: Scope): boolean {
  if ('failed' in snapshot || snapshot.projects === undefined) return true;
  const known = snapshot.projects;
  return !scope.all && scope.projects.every((project) => known.includes(project));
}

function failure(result: Run): string {
  if (result.skipped !== undefined) return `the snapshot was skipped, ${result.skipped}`;
  if (result.timedOut) return `the snapshot timed out after ${String(WORKSPACE_TSC_MS / 1000)} s`;
  const reason = nonEmptyLines(`${result.stdout}\n${result.stderr}`)[0] ?? result.detail;
  return `the snapshot failed: ${reason}`;
}

function inside(file: string | null, gap: ReadonlySet<string>): boolean {
  const owner = file === null ? null : owningProject(file);
  return file === null || (owner !== null && gap.has(owner));
}

function merged(
  before: Snapshot | null,
  result: Run,
  scope: Scope,
  gap: ReadonlySet<string>,
): Snapshot {
  if (scope.all) return { counts: countErrors(result.stdout) };
  const counts: Record<string, number> =
    before !== null && 'counts' in before ? { ...before.counts } : {};
  for (const error of parseTsc(result.stdout)) {
    if (inside(error.file, gap)) counts[error.key] = (counts[error.key] ?? 0) + 1;
  }
  return { counts, projects: [...knownProjects(before), ...gap].sort() };
}

export async function ensureSnapshot(input: AgentInput, scope: Scope): Promise<void> {
  const agent = agentName(input);
  const before = await readSnapshot(input.session_id, agent);
  if (before !== null && covers(before, scope)) return;
  const known = knownProjects(before);
  const gap = new Set(scope.projects.filter((project) => !known.includes(project)));
  const result = await projectsTsc(scope.all ? [] : topsOf(buildGraph(), gap));
  const broken = result.code !== 0 && Object.keys(countErrors(result.stdout)).length === 0;
  const usable = !result.timedOut && result.skipped === undefined && !broken;
  const content = usable ? merged(before, result, scope, gap) : { failed: failure(result) };
  await writeAtomic(agentFile(input.session_id, agent, 'snapshot.json'), JSON.stringify(content));
}
