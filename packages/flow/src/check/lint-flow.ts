import type { Branch, FlowNode, JsonValue, PortValue, SwitchMatch } from '@smarteverything/domain';
import { formatScopePath } from '../program/paths';
import type { Finding, LintInput, LintRule } from './lint-types';
import { finding, fixText } from './lint-types';
import { canonicalJson, entriesOfKind, subjectOf, writtenVariable } from './lint-scan';
import { typeOfValue } from './types';

const TERMINAL_KINDS: ReadonlySet<string> = new Set([
  'flow.return',
  'flow.stop',
  'flow.fail',
  'flow.break',
  'flow.continue',
]);
const IF_CHAIN_MINIMUM = 5;

function matchLiterals(match: SwitchMatch): readonly JsonValue[] {
  if ('eq' in match) return [match.eq];
  return 'in' in match ? match.in : [];
}

function duplicateFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.switch').flatMap((entry) => {
    const seen = new Set<string>();
    return (entry.node.cases ?? []).flatMap((row) =>
      matchLiterals(row.match).flatMap((literal) => {
        const text = canonicalJson(literal);
        if (!seen.has(text)) {
          seen.add(text);
          return [];
        }
        return [
          finding(
            'duplicate_switch_literal',
            subjectOf(entry.node),
            `${text} is matched by more than one case.`,
            {
              port: `case:${row.id}`,
              received: text,
              fix: fixText('merge the cases or remove the repeated value'),
            },
          ),
        ];
      }),
    );
  });
}

function coveredChoices(cases: readonly { readonly match: SwitchMatch }[]): ReadonlySet<JsonValue> {
  return new Set(cases.flatMap((row) => matchLiterals(row.match)));
}

function exhaustiveFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.switch').flatMap((entry) => {
    const subject = entry.node.ports?.['subject'];
    if (subject === undefined || entry.node.scopes?.['default'] !== undefined) return [];
    const typing = typeOfValue(subject, input.typed);
    if (typing.kind !== 'type') return [];
    const type = typing.type.t === 'optional' ? typing.type.of : typing.type;
    if (type.t !== 'choice') return [];
    const covered = coveredChoices(entry.node.cases ?? []);
    const missing = type.options.filter((option) => !covered.has(option.id));
    if (missing.length === 0) return [];
    const names = missing.map((option) => option.label).join(', ');
    return [
      finding(
        'switch_not_exhaustive',
        subjectOf(entry.node),
        `No case handles ${names}, and there is no default.`,
        {
          port: 'subject',
          received: names,
          fix: fixText('add a case for each missing choice or add a default'),
        },
      ),
    ];
  });
}

function isEquality(op: PortValue | undefined): boolean {
  return op === undefined || ('lit' in op && op.lit === 'eq');
}

function comparedVariable(node: FlowNode): string | undefined {
  const { a, b, op } = node.ports ?? {};
  if (node.kind !== 'logic.compare' || !isEquality(op) || b === undefined || !('lit' in b)) {
    return undefined;
  }
  return a !== undefined && 'wire' in a && a.wire.from === 'vars' ? a.wire.port : undefined;
}

function testedVariable(branch: Branch, input: LintInput): string | undefined {
  if (!('wire' in branch.when)) return undefined;
  const test = input.index.byKey.get(branch.when.wire.from);
  return test?.kind === 'node' ? comparedVariable(test.node) : undefined;
}

function setsOnlyVariable(branch: Branch, name: string): boolean {
  const [only, ...rest] = branch.scope.nodes;
  return rest.length === 0 && only?.kind === 'var.set' && writtenVariable(only, true) === name;
}

function chainFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.if').flatMap((entry) => {
    const branches = entry.node.branches ?? [];
    const [first] = branches;
    const name = first === undefined ? undefined : testedVariable(first, input);
    const chain =
      branches.length >= IF_CHAIN_MINIMUM &&
      name !== undefined &&
      branches.every((branch) => testedVariable(branch, input) === name);
    if (!chain) return [];
    const cycle = branches.every((branch) => setsOnlyVariable(branch, name));
    const fix = cycle
      ? {
          summary: `replace the If with Change variable set to Next on ${name}`,
          action: { action: 'cycle_variable', key: entry.node.key, variable: name } as const,
        }
      : {
          summary: `replace the If with a Lookup table keyed by ${name}`,
          action: { action: 'lookup_table', key: entry.node.key, variable: name } as const,
        };
    return [
      finding(
        'if_chain_over_variable',
        subjectOf(entry.node),
        `This If compares ${name} with ${String(branches.length)} fixed values one by one.`,
        {
          received: name,
          fix,
        },
      ),
    ];
  });
}

function unreachableFindings(input: LintInput): readonly Finding[] {
  const ended = new Map<string, string>();
  return input.index.nodes.flatMap((entry) => {
    const scope = formatScopePath(entry.scope);
    const ender = ended.get(scope);
    if (ender === undefined) {
      if (TERMINAL_KINDS.has(entry.node.kind)) ended.set(scope, entry.node.key);
      return [];
    }
    return [
      finding(
        'unreachable_node',
        subjectOf(entry.node),
        `This step can never run because ${ender} always ends the path before it.`,
        {
          received: ender,
          fix: fixText('move it above that step or remove it'),
        },
      ),
    ];
  });
}

export const flowRules: readonly LintRule[] = [
  duplicateFindings,
  exhaustiveFindings,
  chainFindings,
  unreachableFindings,
];
