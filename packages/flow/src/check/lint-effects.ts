import type { Entry, NodeEntry } from '../program/lookup';
import { entryReferences, programLevelReferences } from './references';
import { entriesOf } from './shapes';
import type { Finding, LintInput, LintRule } from './lint-types';
import { finding, fixText } from './lint-types';
import {
  VARIABLE_WRITE_KINDS,
  entriesOfKind,
  literalOf,
  subjectOf,
  textOf,
  writtenVariable,
} from './lint-scan';
import { siteName } from './problems';

function isInsideParallel(input: LintInput, entry: NodeEntry): boolean {
  return entry.ancestors.some((key) => input.index.byKey.get(key)?.node.kind === 'flow.parallel');
}

function parallelWriteFindings(input: LintInput): readonly Finding[] {
  return input.index.nodes.flatMap((entry) => {
    if (!VARIABLE_WRITE_KINDS.has(entry.node.kind) || !isInsideParallel(input, entry)) return [];
    const source = literalOf(entry.node, 'source');
    if (source !== undefined && source !== 'run') return [];
    const name = textOf(entry.node, 'name');
    return [
      finding(
        'parallel_variable_write',
        subjectOf(entry.node),
        `A branch of Do together cannot write the run variable${name === undefined ? '' : ` ${name}`}.`,
        {
          port: 'name',
          received: name,
          fix: fixText(
            'give the value out of the branch with an output and set the variable after Do together',
          ),
        },
      ),
    ];
  });
}

function retryFindings(input: LintInput): readonly Finding[] {
  return input.index.nodes.flatMap((entry) => {
    const retry = input.ctx.kinds(entry.node.kind)?.effect?.retry;
    const policy = entry.node.policy;
    if (retry === undefined || retry === 'idempotent') return [];
    if (policy?.retry === undefined || policy.acknowledgeRepeat === true) return [];
    return [
      finding(
        'retry_not_idempotent',
        subjectOf(entry.node),
        `${entry.node.kind} can do harm when repeated, so it cannot be retried by itself.`,
        {
          received: retry,
          fix: fixText(
            'remove the retry, or confirm that repeating it is safe with acknowledgeRepeat',
          ),
        },
      ),
    ];
  });
}

function consumers(input: LintInput): readonly {
  readonly entry: Entry | undefined;
  readonly reference: ReturnType<typeof entryReferences>[number];
}[] {
  return [
    ...entriesOf(input.index)
      .filter((entry) => entry.node.enabled !== false)
      .flatMap((entry) => entryReferences(entry).map((reference) => ({ entry, reference }))),
    ...programLevelReferences(input.program).map((reference) => ({
      entry: undefined,
      reference,
    })),
  ];
}

function disabledFindings(input: LintInput): readonly Finding[] {
  const off = new Map(
    input.index.nodes
      .filter((entry) => entry.node.enabled === false)
      .map((entry) => [entry.node.key, entry] as const),
  );
  if (off.size === 0) return [];
  return consumers(input).flatMap(({ entry, reference }) => {
    const source = off.get(reference.from);
    if (source === undefined) return [];
    const declared = input.ctx
      .kinds(source.node.kind)
      ?.outputs.find((out) => out.name === reference.port);
    if (declared?.optional === true) return [];
    const subject = entry === undefined ? {} : subjectOf(entry.node);
    return [
      finding(
        'disabled_node_consumed',
        subject,
        `${reference.from} is switched off, but its value is used here.`,
        {
          port: siteName(reference.site),
          received: `${reference.from}.${reference.port}`,
          fix: fixText(`switch ${reference.from} back on or stop using its value`),
        },
      ),
    ];
  });
}

function readNames(input: LintInput): ReadonlySet<string> | 'all' {
  const names = new Set<string>();
  for (const { reference } of consumers(input)) {
    if (reference.from === 'vars') names.add(reference.port);
  }
  for (const entry of entriesOfKind(input.index, 'var.get')) {
    const source = literalOf(entry.node, 'source');
    if (source === 'home') continue;
    const name = textOf(entry.node, 'name');
    if (name === undefined) return 'all';
    names.add(name);
  }
  return names;
}

function neverReadFindings(input: LintInput): readonly Finding[] {
  const read = readNames(input);
  if (read === 'all') return [];
  const declared = new Set(input.program.variables.map((variable) => variable.name));
  const written = new Set(
    input.index.nodes.flatMap((entry) => {
      const name = writtenVariable(entry.node, true);
      return name !== undefined && declared.has(name) ? [name] : [];
    }),
  );
  return [...written]
    .filter((name) => !read.has(name))
    .map((name) =>
      finding(
        'variable_never_read',
        {},
        `The variable ${name} is set but its value is never used.`,
        {
          port: `variables.${name}`,
          received: name,
          fix: fixText('use the variable somewhere or remove it'),
        },
      ),
    );
}

export const effectRules: readonly LintRule[] = [
  parallelWriteFindings,
  retryFindings,
  disabledFindings,
  neverReadFindings,
];
