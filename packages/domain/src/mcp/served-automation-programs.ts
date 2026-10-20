import type { McpToolAccess, McpToolArea } from './areas';

export interface ProgramRoute {
  readonly key: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly says: Readonly<Record<string, string>>;
}

export type ServedProgramRow =
  | readonly [
      name: string,
      area: McpToolArea,
      access: McpToolAccess,
      title: string,
      description: string,
      route: ProgramRoute,
    ]
  | readonly [
      name: string,
      area: McpToolArea,
      access: McpToolAccess,
      title: string,
      description: string,
      route: { readonly part: string },
    ];

export const AUTOMATION_PROGRAM_PART_ENDPOINTS = [
  ['read_automation', 'getAutomationProgram'],
  ['read_automation_outline', 'getAutomationProgramOutline'],
  ['list_automation_catalog', 'listAutomationCatalog'],
  ['create_automation', 'createAutomationProgram'],
  ['update_automation', 'updateAutomationProgram'],
  ['patch_automation', 'patchAutomationProgram'],
  ['check_automation', 'checkAutomationProgram'],
  ['remove_automation', 'removeAutomationProgram'],
  ['list_automation_functions', 'listAutomationFunctions'],
  ['list_automation_secrets', 'listAutomationSecrets'],
  ['set_automation_secret', 'setAutomationSecret'],
  ['remove_automation_secret', 'removeAutomationSecret'],
  ['run_automation', 'startProgramRun'],
  ['list_automation_runs', 'listProgramRuns'],
  ['read_automation_run', 'readProgramRun'],
  ['read_automation_run_nodes', 'readProgramRunNodes'],
  ['list_automation_decisions', 'listProgramDecisions'],
  ['stop_automation_run', 'stopProgramRun'],
  ['stop_automation_runs', 'stopProgramRuns'],
  ['list_automation_questions', 'listAutomationQuestions'],
  ['answer_automation_question', 'answerAutomationQuestion'],
] as const;

export const SERVED_AUTOMATION_PROGRAMS = [
  [
    'list_automations',
    'automations',
    'read',
    'List automations',
    'Reads automations and Custom Nodes. view summary (default) lists id, name, on/off, revision, trigger summary, node count, Custom Nodes used, last run and last error; full returns one program without layout; outline returns one program as keyed lines; functions lists Custom Nodes with interface, revision and users; catalog lists node kinds with ports, types, one-line meaning and example (filter by query, group or kind; includes Custom Nodes); secrets lists secret names, dates and the automations using them, never values (owner only). Read the catalog before writing a program.',
    {
      key: 'view',
      parts: {
        summary: 'list_automations',
        full: 'read_automation',
        outline: 'read_automation_outline',
        functions: 'list_automation_functions',
        catalog: 'list_automation_catalog',
        secrets: 'list_automation_secrets',
      },
      says: {
        summary: 'Automations with revision, trigger summary, node count, last run and last error',
        full: 'One program as stored, without layout',
        outline: 'One program as one keyed line per node, indented by scope',
        functions: 'Custom Nodes with interface, revision and how many places use them',
        catalog:
          'Node kinds with ports, types and examples, and Custom Nodes; filter by query, group or kind',
        secrets: 'Secret names, dates and the automations using them; never values; owner only',
      },
    },
  ],
  [
    'edit_automation',
    'automations',
    'control',
    'Edit automations',
    'Changes an automation or Custom Node program, built only from nodes and wires. Every port holds a constant {"lit": value} or a wire {"wire": {"from": node key or trigger, inputs, vars, home, run, "port": output name}}; there are no formulas, so every calculation (compare, and, or, not, math, text, lists, Choose, Get field, Has a value) is its own node wired in. create and update save a whole program as the next revision; patch applies ordered operations with expectedRevision as one change; check validates a program or a patch preview and saves nothing; remove deletes one nothing else runs. Every reply is ok, summary, id, revision and problems naming node, port, code, expected, received and a fix. A breaking Custom Node save lists the affected callers and needs confirmBreaking true. set_secret stores a write-only secret value by name and remove_secret deletes one; programs hold only its id (owner only). Loops and runs have no limit unless a node sets limit or the program sets budgets; a Custom Node that acts can keep data between runs with persist variables; Custom Nodes may call themselves. Check, then run_automation mode dry, before enabling.',
    {
      key: 'action',
      parts: {
        create: 'create_automation',
        update: 'update_automation',
        patch: 'patch_automation',
        remove: 'remove_automation',
        check: 'check_automation',
        set_secret: 'set_automation_secret',
        remove_secret: 'remove_automation_secret',
      },
      says: {
        create: 'Add an automation or Custom Node from a full program',
        update:
          'Replace a program as the next revision; expectedRevision refuses the save if it moved; confirmBreaking accepts a breaking Custom Node change',
        patch: 'Apply ordered operations to a stored program as one revision',
        remove: 'Delete an automation or Custom Node that nothing else runs',
        check: 'Validate a program or a patch preview; nothing is saved',
        set_secret: 'Create or replace a secret by name; the value is write-only; owner only',
        remove_secret: 'Remove a secret that no automation uses; owner only',
      },
    },
  ],
  [
    'run_automation',
    'automations',
    'control',
    'Run an automation',
    'Starts an automation now. mode live (default) really performs its steps; dry records the commands it would send and the value of every node without sending; simulate runs a scenario (fixtures, start time, timeline of signals, button answers and time advances) on a virtual clock; timeline signals wake waits, not triggers. dry and simulate start as a manual run unless trigger gives the key of one trigger (and optionally its signal) to start as if it fired. automationId comes from list_automations; pass inputs for one that declares them and wait to get its outputs.',
    { part: 'run_automation' },
  ],
  [
    'stop_automation',
    'automations',
    'control',
    'Stop automation runs',
    'Stops one run (runId from read_automation_runs) or every active and queued run of an automation, optionally only those with one key. Commands already sent may still finish.',
    {
      key: 'action',
      parts: { run: 'stop_automation_run', automation: 'stop_automation_runs' },
      says: {
        run: 'Cancel one run so its later steps do not happen',
        automation:
          'Stop every active and queued run of an automation, optionally only those with one key',
      },
    },
  ],
  [
    'read_automation_runs',
    'automations',
    'read',
    'Read automation runs',
    'Run history. list: the newest runs, optionally of one automation; run: one run with status, node outcomes, value previews, loop counts, errors and command ids; nodes: node records of one run, paged, optionally one node or loop iteration; decisions: why an automation did not run, counted per minute and reason; questions: what automations are waiting for someone to answer, with the buttons.',
    {
      key: 'view',
      parts: {
        list: 'list_automation_runs',
        run: 'read_automation_run',
        nodes: 'read_automation_run_nodes',
        decisions: 'list_automation_decisions',
        questions: 'list_automation_questions',
      },
      says: {
        list: 'The newest runs, optionally of one automation',
        run: 'One run with its status and what each node did',
        nodes: 'Node records of one run, paged; filter by node or loop iteration',
        decisions: 'Why an automation did not run, per minute and reason',
        questions: 'Questions automations are waiting on, with their buttons and who was asked',
      },
    },
  ],
  [
    'answer_automation_question',
    'automations',
    'control',
    'Answer an automation question',
    'Presses one answer button for a question an automation asked and is waiting on (questionId and the buttons come from read_automation_runs view questions). Only the person asked, or the owner, can answer. The waiting run continues with that answer. Answer only when the person told you which button, never guess.',
    { part: 'answer_automation_question' },
  ],
  [
    'list_values',
    'automations',
    'read',
    'List Values',
    'The home’s Values (on/off, number, duration or choice) that automations read and change, with their revisions. Variables owned by one automation are listed under it, not here.',
    { part: 'list_automation_values' },
  ],
  [
    'edit_value',
    'automations',
    'control',
    'Edit a Value',
    'Creates, replaces or removes a Value, or applies one atomic operation to it (set, toggle, add, subtract, next, previous). valueId and revision come from list_values.',
    {
      key: 'action',
      parts: {
        create: 'create_automation_value',
        update: 'update_automation_value',
        remove: 'remove_automation_value',
        apply: 'apply_automation_value_operation',
      },
      says: {
        create: 'Create a Value (on/off, number, duration or choice) with its limits',
        update:
          'Replace a Value’s definition and current value; send expectedRevision to refuse the save if it changed since you read it',
        remove: 'Delete a Value that no automation uses',
        apply: 'Set, toggle, add, subtract or step a Value in one atomic operation',
      },
    },
  ],
] as const satisfies readonly ServedProgramRow[];
