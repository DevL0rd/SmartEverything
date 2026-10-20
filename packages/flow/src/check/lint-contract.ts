import { CONVERT_UNITS, STATEFUL_KIND_IDS, TRIGGER_KIND_PREFIX } from '@smarteverything/domain';
import { PROGRAM_SUBJECT } from './problems';
import type { Finding, LintInput, LintRule } from './lint-types';
import { finding, fixText } from './lint-types';
import { subjectOf, textOf } from './lint-scan';

const FIX_REUSABLE = 'move it to the automation and pass a value in through an input';

function contentFindings({ program, index, ctx }: LintInput): readonly Finding[] {
  if (program.kind !== 'function') return [];
  return index.nodes.flatMap((entry) => {
    const kind = ctx.kinds(entry.node.kind);
    const subject = subjectOf(entry.node);
    const found: Finding[] = [];
    if (entry.node.kind.startsWith(TRIGGER_KIND_PREFIX) || kind?.class === 'trigger') {
      found.push(
        finding('trigger_in_reusable', subject, 'A Custom Node cannot hold a trigger.', {
          fix: fixText(FIX_REUSABLE),
        }),
      );
    }
    if (STATEFUL_KIND_IDS.has(entry.node.kind) || kind?.stateful === true) {
      found.push(
        finding(
          'stateful_in_reusable',
          subject,
          `${entry.node.kind} keeps memory, which a Custom Node cannot.`,
          {
            fix: fixText(FIX_REUSABLE),
          },
        ),
      );
    }
    if (program.flavour === 'pure' && kind?.class === 'read') {
      found.push(
        finding('read_in_function', subject, 'A function cannot read live state.', {
          fix: fixText(
            'make it an action instead of a function, or pass the value in through an input',
          ),
        }),
      );
    }
    return found;
  });
}

function persistentFindings({ program }: LintInput): readonly Finding[] {
  if (program.kind !== 'function' || program.flavour === 'action') return [];
  return program.variables
    .filter((variable) => variable.persist === true)
    .map((variable) =>
      finding(
        'kept_data_in_function',
        PROGRAM_SUBJECT,
        `The data ${variable.name} would be kept between runs, which only an action Custom Node can do.`,
        {
          port: `variables.${variable.name}`,
          received: variable.name,
          fix: fixText('make this Custom Node an action, or make it a normal variable'),
        },
      ),
    );
}

function inputFindings({ program }: LintInput): readonly Finding[] {
  if (program.kind !== 'automation' || program.triggers.length === 0) return [];
  return program.inputs
    .filter((port) => port.required && port.default === undefined)
    .map((port) =>
      finding(
        'input_needs_default',
        PROGRAM_SUBJECT,
        `The input ${port.name} is required, but triggers start this automation without one.`,
        {
          port: `inputs.${port.name}`,
          received: port.name,
          fix: fixText('give the input a default or make it optional'),
        },
      ),
    );
}

function exitFindings({ program, index }: LintInput): readonly Finding[] {
  if (program.kind !== 'function' || program.flavour !== 'action') return [];
  const ports = index.nodes
    .filter((entry) => entry.node.kind === 'flow.return')
    .map((entry) => entry.node.ports?.['exit']);
  if (ports.some((port) => port !== undefined && !('lit' in port))) return [];
  const reached = new Set<unknown>([
    ...program.exits.slice(0, 1),
    ...ports.flatMap((port) => (port !== undefined && 'lit' in port ? [port.lit] : [])),
  ]);
  return program.exits
    .filter((name) => !reached.has(name))
    .map((name) =>
      finding('unreachable_exit', PROGRAM_SUBJECT, `No Return leaves by the exit ${name}.`, {
        port: `exits.${name}`,
        received: name,
        fix: fixText('add a Return for it or remove the exit'),
      }),
    );
}

const UNIT_DIMENSIONS: ReadonlyMap<string, string> = new Map(
  CONVERT_UNITS.map((unit) => [unit.id, unit.dimension]),
);

function unitFindings({ index }: LintInput): readonly Finding[] {
  return index.nodes.flatMap((entry) => {
    if (entry.node.kind !== 'math.convert_unit') return [];
    const from = textOf(entry.node, 'from');
    const to = textOf(entry.node, 'to');
    if (from === undefined || to === undefined) return [];
    const fromDimension = UNIT_DIMENSIONS.get(from);
    const toDimension = UNIT_DIMENSIONS.get(to);
    if (fromDimension === undefined || toDimension === undefined) {
      const unknown = fromDimension === undefined ? from : to;
      return [
        finding('unit_mismatch', subjectOf(entry.node), `${unknown} is not a known unit.`, {
          port: fromDimension === undefined ? 'from' : 'to',
          received: unknown,
          fix: fixText('pick a unit from the list'),
        }),
      ];
    }
    if (fromDimension === toDimension) return [];
    return [
      finding(
        'unit_mismatch',
        subjectOf(entry.node),
        `${fromDimension} cannot be converted to ${toDimension}.`,
        {
          port: 'to',
          expected: fromDimension,
          received: toDimension,
          fix: fixText(`pick a ${fromDimension} unit for both From and To`),
        },
      ),
    ];
  });
}

export const contractRules: readonly LintRule[] = [
  contentFindings,
  persistentFindings,
  inputFindings,
  exitFindings,
  unitFindings,
];
