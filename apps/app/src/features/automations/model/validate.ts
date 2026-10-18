import {
  appendTo,
  AUTOMATION_V2,
  walkSteps,
  type AutomationV2,
  type StepV2,
} from '@smarteverything/domain';
import type { Draft } from './editor-state';
import {
  conditionProblems,
  stepProblems,
  triggerProblem,
  type ValidationChoices,
} from './validate-steps';

export type { ValidationChoices } from './validate-steps';

export const NAME_LIMIT = 80;

type ListBlock = 'when' | 'only' | 'then' | 'inputs' | 'run';

export interface Problems {
  readonly name: readonly string[];
  readonly when: readonly string[];
  readonly only: readonly string[];
  readonly then: readonly string[];
  readonly inputs: readonly string[];
  readonly run: readonly string[];
  readonly nodes: Readonly<Record<string, readonly string[]>>;
}

export type Validation =
  | { readonly valid: true; readonly name: string; readonly automation: AutomationV2 }
  | { readonly valid: false; readonly problems: Problems };

export interface Mode {
  readonly reusable: boolean;
}

const EMPTY: Readonly<Record<'name' | 'when' | 'then', string>> = {
  name: 'Give it a name.',
  when: 'Add when it runs.',
  then: 'Add what it does.',
};

const FIELD_TEXT: Readonly<Record<string, string>> = {
  instruction: 'Write what the AI should do.',
  message: 'Write the message to send.',
  phrase: 'Write the words to listen for.',
};

const BLOCK_OF: Readonly<Record<string, ListBlock>> = {
  when: 'when',
  onlyIf: 'only',
  steps: 'then',
  inputs: 'inputs',
  mode: 'run',
  max: 'run',
  key: 'run',
};

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

class Found {
  readonly blocks: Record<ListBlock, string[]> = {
    when: [],
    only: [],
    then: [],
    inputs: [],
    run: [],
  };
  readonly nodes = new Map<string, string[]>();

  add(block: ListBlock, text: string): void {
    this.blocks[block].push(text);
  }

  addNode(id: string, text: string): void {
    appendTo(this.nodes, id, text);
  }

  get empty(): boolean {
    return Object.values(this.blocks).every((list) => list.length === 0) && this.nodes.size === 0;
  }
}

interface Cursor {
  readonly block: readonly StepV2[];
  readonly at: number;
}

function descend(step: StepV2, path: readonly PropertyKey[], at: number): Cursor | null {
  const key = path[at];
  if (step.do === 'repeat' && key === 'steps') return { block: step.steps, at: at + 1 };
  if (step.do !== 'if') return null;
  if (key === 'else') return { block: step.else ?? [], at: at + 1 };
  const branch = key === 'branches' ? step.branches[Number(path[at + 1])] : undefined;
  return branch !== undefined && path[at + 2] === 'then'
    ? { block: branch.then, at: at + 3 }
    : null;
}

function nodeAt(steps: readonly StepV2[], path: readonly PropertyKey[]): string | undefined {
  let cursor: Cursor | null = { block: steps, at: 0 };
  let id: string | undefined;
  while (cursor !== null) {
    const index = path[cursor.at];
    const step: StepV2 | undefined = typeof index === 'number' ? cursor.block[index] : undefined;
    if (step === undefined) break;
    id = step.id;
    cursor = descend(step, path, cursor.at + 1);
  }
  return id;
}

function fieldText(issue: Issue): string {
  const field = issue.path[issue.path.length - 1];
  const text = typeof field === 'string' ? FIELD_TEXT[field] : undefined;
  return text ?? issue.message;
}

function schemaProblems(found: Found, automation: AutomationV2, issues: readonly Issue[]): void {
  for (const issue of issues) {
    const [first, ...rest] = issue.path;
    const block = typeof first === 'string' ? (BLOCK_OF[first] ?? 'then') : 'then';
    const id = first === 'steps' ? nodeAt(automation.steps, rest) : undefined;
    if (id !== undefined) found.addNode(id, fieldText(issue));
    else found.add(block, fieldText(issue));
  }
}

function semanticProblems(
  found: Found,
  automation: AutomationV2,
  choices: ValidationChoices,
): void {
  automation.when.forEach((trigger, index) => {
    const problem = triggerProblem(choices, trigger);
    if (problem !== null) found.add('when', `${String(index + 1)}. ${problem}`);
  });
  if (automation.onlyIf !== undefined)
    conditionProblems(choices, automation.onlyIf).forEach((problem) => {
      found.add('only', problem);
    });
  for (const step of walkSteps(automation.steps)) {
    for (const problem of stepProblems(choices, step)) {
      if (step.id === undefined) found.add('then', problem);
      else found.addNode(step.id, problem);
    }
  }
}

function structureProblems(found: Found, automation: AutomationV2, mode: Mode): void {
  if (!mode.reusable && automation.when.length === 0) found.add('when', EMPTY.when);
  if (automation.steps.length === 0) found.add('then', EMPTY.then);
}

function nameProblems(name: string): string[] {
  if (name === '') return [EMPTY.name];
  return name.length > NAME_LIMIT ? [`Use at most ${String(NAME_LIMIT)} characters.`] : [];
}

function problemsOf(name: string, found: Found): Problems {
  return {
    name: nameProblems(name),
    ...found.blocks,
    nodes: Object.fromEntries(found.nodes),
  };
}

export function validateDraft(draft: Draft, choices: ValidationChoices, mode: Mode): Validation {
  const name = draft.name.trim();
  const found = new Found();
  const { automation } = draft;
  structureProblems(found, automation, mode);
  semanticProblems(found, automation, choices);
  const parsed = AUTOMATION_V2.safeParse(automation);
  if (!parsed.success && found.empty) schemaProblems(found, automation, parsed.error.issues);
  const problems = problemsOf(name, found);
  return parsed.success && found.empty && problems.name.length === 0
    ? { valid: true, name, automation }
    : { valid: false, problems };
}
