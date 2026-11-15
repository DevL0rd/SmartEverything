import { stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { loadState, type RigState } from '../paths.ts';
import {
  passed,
  totals,
  writeResults,
  type CaseResult,
  type SuiteResult,
} from './recovery-results.ts';

const DEFAULT_REPEAT = 3;

export interface Context {
  readonly suite: string;
  readonly name: string;
  readonly run: number;
  readonly token: string;
  readonly notes: string[];
  readonly state: () => Promise<RigState>;
}

export interface SuiteCase {
  readonly name: string;
  readonly run: (context: Context) => Promise<void>;
}

export interface Selection {
  readonly filters: readonly string[];
  readonly repeat: number;
  readonly list: boolean;
}

export function parseSelection(args: readonly string[]): Selection {
  const { values } = parseArgs({
    args: [...args],
    options: {
      case: { type: 'string', multiple: true },
      repeat: { type: 'string' },
      list: { type: 'boolean' },
    },
  });
  const repeat = values.repeat === undefined ? DEFAULT_REPEAT : Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1)
    throw new Error('--repeat needs a whole number of 1 or more.');
  return { filters: values.case ?? [], repeat, list: values.list === true };
}

export function choose<T extends { readonly name: string }>(
  cases: readonly T[],
  filters: readonly string[],
): readonly T[] {
  if (filters.length === 0) return cases;
  return cases.filter((item) => filters.some((filter) => item.name.includes(filter)));
}

function failureText(cause: unknown): string {
  return cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
}

async function runCase(suite: string, item: SuiteCase, repeat: number): Promise<CaseResult> {
  const started = Date.now();
  const notes: string[] = [];
  let passes = 0;
  let failure: string | null = null;
  for (let run = 1; run <= repeat; run += 1) {
    const context: Context = {
      suite,
      name: item.name,
      run,
      token: `${Date.now().toString(36)}${String(run)}`,
      notes,
      state: loadState,
    };
    stdout.write(`${item.name} run ${String(run)} of ${String(repeat)}\n`);
    try {
      await item.run(context);
      passes += 1;
    } catch (cause) {
      failure = `run ${String(run)}: ${failureText(cause)}`;
      break;
    }
  }
  return {
    name: item.name,
    runs: repeat,
    passes,
    failure,
    seconds: (Date.now() - started) / 1000,
    notes,
  };
}

export async function runSuite(
  suite: string,
  cases: readonly SuiteCase[],
  args: readonly string[],
): Promise<number> {
  const selection = parseSelection(args);
  const chosen = choose(cases, selection.filters);
  if (selection.list) {
    stdout.write(`${chosen.map((item) => item.name).join('\n')}\n`);
    return 0;
  }
  if (chosen.length === 0) throw new Error('No case matches the given --case filters.');
  await loadState();
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  for (const item of chosen) {
    const result = await runCase(suite, item, selection.repeat);
    results.push(result);
    stdout.write(`${item.name}: ${passed(result) ? 'pass' : 'FAIL'}\n`);
  }
  const result: SuiteResult = {
    suite,
    command: `rig ${suite} ${args.join(' ')}`.trim(),
    startedAt,
    cases: results,
  };
  const file = await writeResults(result);
  const { pass, fail } = totals(results);
  stdout.write(`${String(pass)} passed, ${String(fail)} failed; results in ${file}\n`);
  return fail === 0 ? 0 : 1;
}
