import { parseInput, stopInput } from './input.ts';
import { report, skippedNotice, timedOut, warnUser, type Section } from './output.ts';
import { projectsTsc, WORKSPACE_TSC_MS, type Run } from './process.ts';
import { addLines, agentFile, agentName, readSnapshot, takeLines } from './state.ts';
import { scopeOf, type Scope } from './projects.ts';
import { relatedTests } from './tests.ts';
import { affectsTypes, judge, type Claim } from './types.ts';

type StopInput = ReturnType<typeof stopInput.parse>;

interface Checked {
  readonly sections: readonly Section[];
  readonly skipped: boolean;
}

function labelOf(scope: Scope): string {
  return scope.all ? 'tsc -b' : `tsc -b ${scope.tops.join(' ')}`;
}

function typeSections(result: Run, claim: Claim, label: string): readonly Section[] {
  if (skippedNotice(label, result)) return [];
  if (result.timedOut) return [timedOut(label, WORKSPACE_TSC_MS)];
  return judge(label, result, claim);
}

async function check(input: StopInput, files: readonly string[]): Promise<Checked> {
  const agent = agentName(input);
  const scope = scopeOf(files);
  const [result, tests] = await Promise.all([
    projectsTsc(scope.all ? [] : scope.tops),
    relatedTests(input.session_id, agent, files),
  ]);
  const snapshot = await readSnapshot(input.session_id, agent);
  const types = typeSections(result, { files, snapshot }, labelOf(scope));
  return {
    sections: tests === null ? types : [...types, tests],
    skipped: result.skipped !== undefined,
  };
}

export async function onStop(raw: unknown): Promise<number> {
  const input = parseInput('stop', stopInput, raw);
  const editedPath = agentFile(input.session_id, agentName(input), 'edited');
  const files = (await takeLines(editedPath)).filter(affectsTypes);
  if (files.length === 0) return 0;
  const { sections, skipped } = await check(input, files).catch(async (error: unknown) => {
    await addLines(editedPath, files);
    throw error;
  });
  if (skipped) await addLines(editedPath, files);
  if (sections.length === 0) return 0;
  if (input.stop_hook_active === true) {
    const names = sections.map((section) => section.check).join(', ');
    return warnUser(`still failing after a retry: ${names}`);
  }
  await addLines(editedPath, files);
  return report('Checks failed:', sections);
}
