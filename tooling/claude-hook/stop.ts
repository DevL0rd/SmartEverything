import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { loadGraph, type Graph } from './graph.ts';
import { parseInput, stopInput } from './input.ts';
import { report, timedOut, warnUser, type Section } from './output.ts';
import { workspaceTsc, WORKSPACE_TSC_MS, type Run } from './process.ts';
import {
  addHandover,
  addLines,
  agentFile,
  agentName,
  closeWindow,
  handedAgents,
  openWindows,
  readBlocks,
  readOriginals,
  readSnapshot,
  takeHandover,
  takeLines,
  writeAtomic,
  type Handover,
  type Window,
} from './state.ts';
import { relatedTests, type TestOutcome } from './tests.ts';
import { affectsTypes, judge, type Judgement } from './types.ts';

const MAX_BLOCKS = 3;

type StopInput = ReturnType<typeof stopInput.parse>;

interface Taken {
  readonly files: readonly string[];
  readonly handed: readonly Handover[];
  readonly notes: readonly string[];
}

interface Checked {
  readonly result: Run;
  readonly graph: Graph;
  readonly tests: TestOutcome;
}

interface Outcome {
  readonly own: readonly Section[];
  readonly paused: boolean;
  readonly handed: readonly Section[];
  readonly notes: readonly string[];
  readonly keep: readonly string[];
}

function workerLabel(agent: string, type: string | undefined): string {
  return type === undefined ? `worker ${agent}` : `worker ${agent} · ${type}`;
}

function ownLabel(input: StopInput): string {
  return input.agent_id === undefined
    ? 'the main agent'
    : workerLabel(input.agent_id, input.agent_type);
}

async function closeIfIdle(session: string, agent: string): Promise<void> {
  if (existsSync(agentFile(session, agent, 'edited'))) return;
  if ((await handedAgents(session)).has(agent)) return;
  await closeWindow(session, agent);
}

interface Context {
  readonly session: string;
  readonly result: Run;
  readonly graph: Graph;
  readonly windows: readonly Window[];
}

async function judgeAs(
  context: Context,
  agent: string,
  files: readonly string[],
  label: string,
): Promise<Judgement> {
  const { session, result, graph, windows } = context;
  const snapshot = await readSnapshot(session, agent);
  const originals = await readOriginals(session, agent);
  const peers = windows.filter((window) => window.agent !== agent);
  return judge('tsc -b', result, graph, { files, snapshot, originals, peers, label });
}

function pauseNotes(judgement: Judgement, who: string): string[] {
  if (judgement.paused === null) return [];
  return [`${who}: changes not type checked yet, waiting on ${judgement.paused.by.join(', ')}`];
}

async function judgeHandover(
  context: Context,
  handed: readonly Handover[],
): Promise<{ sections: Section[]; notes: string[]; unexplained: string[] }> {
  const session = context.session;
  const agents = [...new Set(handed.map((entry) => entry.agent))];
  const groups = await Promise.all(
    agents.map(async (agent) => {
      const entries = handed.filter((entry) => entry.agent === agent);
      const who = workerLabel(agent, entries[0]?.type);
      const label = `handed over by ${who}, still failing`;
      const files = entries.map((entry) => entry.file);
      const judgement = await judgeAs(context, agent, files, label);
      const open = judgement.sections.length > 0 || judgement.paused !== null;
      if (open) await addHandover(session, entries);
      else await closeIfIdle(session, agent);
      return { judgement, notes: pauseNotes(judgement, who) };
    }),
  );
  return {
    sections: groups.flatMap((group) => group.judgement.sections),
    notes: groups.flatMap((group) => group.notes),
    unexplained: groups.flatMap((group) => group.judgement.unexplained),
  };
}

async function evaluate(input: StopInput, taken: Taken, checked: Checked): Promise<Outcome> {
  const { result, graph, tests } = checked;
  const session = input.session_id;
  const agent = agentName(input);
  const windows = await openWindows(session, '');
  const context = { session, result, graph, windows };
  const own = await judgeAs(context, agent, taken.files, 'caused by your edits');
  const handed = await judgeHandover(context, taken.handed);
  const unexplained = [...new Set([...own.unexplained, ...handed.unexplained])];
  const found = unexplained.map((file) => `new errors no agent edit explains: ${file}`);
  const pauses = [...pauseNotes(own, ownLabel(input)), ...handed.notes];
  const sections = [...own.sections, ...tests.sections];
  if (sections.length === 0 && own.paused === null) await closeIfIdle(session, agent);
  if (input.agent_id !== undefined) {
    await addLines(agentFile(session, 'main', 'notes'), [...found, ...tests.notes]);
    return { own: sections, paused: own.paused !== null, handed: [], notes: [], keep: [] };
  }
  return {
    own: sections,
    paused: own.paused !== null,
    handed: handed.sections,
    notes: [...new Set([...taken.notes, ...found, ...tests.notes, ...pauses])],
    keep: [...new Set([...taken.notes, ...found, ...tests.notes])],
  };
}

async function handTo(input: StopInput, files: readonly string[], why: string): Promise<number> {
  if (input.agent_id === undefined) {
    await addLines(agentFile(input.session_id, 'main', 'edited'), files);
    return warnUser(`${why}; ${String(files.length)} file(s) kept for your next turn`);
  }
  const agent = input.agent_id;
  const type = input.agent_type;
  await addHandover(
    input.session_id,
    files.map((file) => ({ agent, type, file })),
  );
  return warnUser(
    `${workerLabel(agent, type)} ${why}; handed to the main agent: ${files.join(', ')}`,
  );
}

async function decide(input: StopInput, taken: Taken, outcome: Outcome): Promise<number> {
  const session = input.session_id;
  const blocksPath = agentFile(session, agentName(input), 'blocks');
  const active = input.stop_hook_active === true;
  if (active) await addLines(agentFile(session, 'main', 'notes'), outcome.keep);
  const notes =
    outcome.notes.length > 0
      ? [{ check: 'warning for the coordinator', lines: outcome.notes }]
      : [];
  const turnOnce = active ? [] : [...outcome.handed, ...notes];
  if (outcome.own.length === 0) {
    await rm(blocksPath, { force: true });
    if (outcome.paused && input.agent_id !== undefined) {
      return handTo(input, taken.files, 'has changes that cannot be type checked yet');
    }
    if (outcome.paused) await addLines(agentFile(session, 'main', 'edited'), taken.files);
    return report('Type check failed:', turnOnce);
  }
  const blocks = active ? await readBlocks(blocksPath) : 0;
  if (blocks >= MAX_BLOCKS) {
    await rm(blocksPath, { force: true });
    return handTo(input, taken.files, `still fails after ${String(MAX_BLOCKS)} blocks`);
  }
  await addLines(agentFile(session, agentName(input), 'edited'), taken.files);
  await writeAtomic(blocksPath, String(blocks + 1));
  return report('Type check failed:', [...outcome.own, ...turnOnce]);
}

async function check(input: StopInput, taken: Taken): Promise<number> {
  const empty = { own: [], paused: false, handed: [], notes: taken.notes, keep: taken.notes };
  if (taken.files.length === 0 && taken.handed.length === 0) {
    await closeIfIdle(input.session_id, agentName(input));
    return decide(input, taken, empty);
  }
  const testing = relatedTests(input.session_id, agentName(input), taken.files);
  const [result, tests] = await Promise.all([workspaceTsc(), testing]);
  const own = tests.sections;
  if (result.timedOut) {
    const slow = timedOut('tsc -b', WORKSPACE_TSC_MS);
    return decide(input, taken, {
      ...empty,
      own: [slow, ...own],
      notes: [...taken.notes, ...tests.notes],
    });
  }
  const graph = await loadGraph();
  if (!graph.ok) {
    const setup = { check: 'tsc -b (project setup)', lines: [graph.reason] };
    return decide(input, taken, { ...empty, own: [setup, ...own] });
  }
  return decide(input, taken, await evaluate(input, taken, { result, graph: graph.graph, tests }));
}

export async function onStop(raw: unknown): Promise<number> {
  const input = parseInput('stop', stopInput, raw);
  const session = input.session_id;
  const main = input.agent_id === undefined;
  const editedPath = agentFile(session, agentName(input), 'edited');
  const notesPath = agentFile(session, 'main', 'notes');
  const files = await takeLines(editedPath);
  let handed: readonly Handover[] = [];
  let notes: readonly string[] = [];
  try {
    handed = main ? await takeHandover(session) : [];
    notes = main ? await takeLines(notesPath) : [];
    return await check(input, { files: files.filter(affectsTypes), handed, notes });
  } catch (error) {
    await addLines(editedPath, files);
    await addHandover(session, handed);
    await addLines(notesPath, notes);
    throw error;
  }
}
