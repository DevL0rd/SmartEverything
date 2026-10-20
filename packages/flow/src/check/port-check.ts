import type { FlowNode, FlowType, PortValue, RefKind } from '@smarteverything/domain';
import {
  forbiddenHeaderNames,
  hasUnresolvedGenerics,
  typeDisplayName,
} from '@smarteverything/domain';
import { functionIdOf, pinOf } from '../functions/calls';
import type { Entry } from '../program/lookup';
import type { Program } from '../program/walk';
import { literalFits, literalRefs } from './literals';
import type { Problem, Subject } from './problems';
import { PROGRAM_SUBJECT, problem } from './problems';
import { conversionFix, own } from './scope-types';
import type { CheckContext, NodeShape, TypedProgram } from './shapes';
import { shapeOf } from './shapes';
import type { ResolvedTyping } from './types';
import { missesPort, typeOfValue, typingAccepts } from './types';

interface Site {
  readonly port: string;
  readonly value: PortValue;
  readonly type: FlowType;
  readonly isStatic: boolean;
}

type NodeRule = (subject: Subject, node: FlowNode, ctx: CheckContext) => readonly Problem[];

const FLAG: FlowType = { t: 'boolean' };
const LITERAL_PREVIEW = 60;

function describeLiteral(value: unknown): string {
  return JSON.stringify(value).slice(0, LITERAL_PREVIEW);
}

function referenceExists(
  ref: { readonly of: RefKind; readonly id: string },
  ctx: CheckContext,
): boolean {
  if (ref.of === 'secret') return ctx.secrets.has(ref.id);
  if (ref.of === 'function') return ctx.functions(ref.id, undefined) !== undefined;
  return ctx.references(ref.of, ref.id);
}

function missingReference(
  subject: Subject,
  port: string,
  ref: { readonly of: RefKind; readonly id: string },
): Problem {
  if (ref.of === 'secret') {
    return problem(subject, 'unknown_secret', `The secret ${ref.id} is not stored.`, {
      port,
      received: ref.id,
      fix: 'pick a stored secret or add it on the Secrets page',
    });
  }
  const code = ref.of === 'function' ? 'unknown_function' : 'unknown_target';
  return problem(subject, code, `The ${ref.of} ${ref.id} does not exist.`, {
    port,
    received: ref.id,
    fix: `pick a ${ref.of} that exists`,
  });
}

function literalProblems(
  subject: Subject,
  site: Site,
  value: ResolvedTyping & { readonly kind: 'lit' },
  ctx: CheckContext,
): readonly Problem[] {
  if (!literalFits(site.type, value.value)) {
    const expected = typeDisplayName(site.type);
    return [
      problem(subject, 'invalid_literal', `${site.port} must be ${expected.toLowerCase()}.`, {
        port: site.port,
        expected,
        received: describeLiteral(value.value),
      }),
    ];
  }
  return literalRefs(site.type, value.value)
    .filter((ref) => !referenceExists(ref, ctx))
    .map((ref) => missingReference(subject, site.port, ref));
}

function typedProblems(
  subject: Subject,
  site: Site,
  typing: ResolvedTyping & { readonly kind: 'type' },
): readonly Problem[] {
  if (hasUnresolvedGenerics(site.type) || typingAccepts(typing, site.type)) return [];
  const expected = typeDisplayName(site.type);
  const received = typeDisplayName(typing.type);
  return [
    problem(
      subject,
      'type_mismatch',
      `${site.port} needs ${expected.toLowerCase()} but gets ${received.toLowerCase()}.`,
      {
        port: site.port,
        expected,
        received,
        fix: conversionFix(typing.type, site.type),
      },
    ),
  ];
}

function missingSource(subject: Subject, site: Site, typed: TypedProgram): readonly Problem[] {
  if (!('wire' in site.value) || !missesPort(site.value.wire, typed)) return [];
  const { from, port } = site.value.wire;
  return [
    problem(subject, 'unknown_reference', `${from} gives no value named ${port}.`, {
      port: site.port,
      received: `${from}.${port}`,
      fix: 'wire it from an output the catalog lists for that step',
    }),
  ];
}

function siteProblems(
  subject: Subject,
  site: Site,
  typed: TypedProgram,
  ctx: CheckContext,
): readonly Problem[] {
  if (site.isStatic && !('lit' in site.value)) {
    return [
      problem(subject, 'static_not_literal', `${site.port} must be a fixed value, not a wire.`, {
        port: site.port,
        fix: 'type the value in directly',
      }),
    ];
  }
  const typing = typeOfValue(site.value, typed);
  if (typing.kind === 'opaque') return missingSource(subject, site, typed);
  return typing.kind === 'lit'
    ? literalProblems(subject, site, typing, ctx)
    : typedProblems(subject, site, typing);
}

function entrySites(entry: Entry, shape: NodeShape): readonly Site[] {
  const ports = Object.entries(entry.node.ports ?? {}).flatMap(([port, value]) => {
    const decl = shape.inputs.find((input) => input.name === port);
    return decl === undefined
      ? []
      : [{ port, value, type: decl.type, isStatic: decl.static === true }];
  });
  if (entry.kind === 'trigger') return ports;
  const rows = [
    ...(entry.node.branches ?? []).map((row) => ({ port: `branch:${row.id}`, value: row.when })),
    ...(entry.node.cases ?? []).flatMap((row) =>
      'when' in row.match ? [{ port: `case:${row.id}`, value: row.match.when }] : [],
    ),
  ];
  return [...ports, ...rows.map((row) => ({ ...row, type: FLAG, isStatic: false }))];
}

function shapeProblems(subject: Subject, entry: Entry, shape: NodeShape): readonly Problem[] {
  const given = Object.keys(entry.node.ports ?? {});
  const known = shape.inputs.map((input) => input.name);
  const unknown = shape.open ? [] : given.filter((name) => !known.includes(name));
  const missing = shape.inputs.filter((input) => input.required && !given.includes(input.name));
  return [
    ...unknown.map((name) =>
      problem(subject, 'unknown_port', `${entry.node.kind} has no input named ${name}.`, {
        port: name,
        received: name,
        fix: known.length === 0 ? 'remove it' : `use one of ${known.join(', ')}`,
      }),
    ),
    ...missing.map((input) =>
      problem(subject, 'missing_port', `${input.name} is needed and has no value.`, {
        port: input.name,
        expected: typeDisplayName(input.type),
        fix: `fill in ${input.name}`,
      }),
    ),
  ];
}

function httpRule(subject: Subject, node: FlowNode): readonly Problem[] {
  const headers = node.ports?.['headers'];
  if (headers === undefined || !('lit' in headers)) return [];
  const names = Object.keys(
    typeof headers.lit === 'object' && headers.lit !== null ? headers.lit : {},
  );
  return forbiddenHeaderNames(names).map((name) =>
    problem(subject, 'forbidden_header', `The ${name} header cannot be set by hand.`, {
      port: 'headers',
      received: name,
      fix: 'use the auth port with a stored secret',
    }),
  );
}

function callRule(subject: Subject, node: FlowNode, ctx: CheckContext): readonly Problem[] {
  const id = functionIdOf(node);
  const pin = pinOf(node);
  if (id === undefined || pin === undefined) return [];
  if (ctx.functions(id, undefined) === undefined || ctx.functions(id, pin) !== undefined) return [];
  return [
    problem(subject, 'unknown_function', `The Custom Node has no revision ${String(pin)}.`, {
      port: 'pin',
      received: String(pin),
      fix: 'pick a revision that exists or leave the pin empty',
    }),
  ];
}

const NODE_RULES: Readonly<Record<string, NodeRule>> = {
  'http.request': httpRule,
  'fn.call': callRule,
};

export function checkEntry(
  entry: Entry,
  program: Program,
  typed: TypedProgram,
  ctx: CheckContext,
): readonly Problem[] {
  const subject = { nodeId: entry.node.id, key: entry.node.key };
  const kind = ctx.kinds(entry.node.kind);
  const shape = shapeOf(entry, program, ctx);
  if (kind === undefined || shape === undefined) {
    return [
      problem(subject, 'unknown_kind', `${entry.node.kind} is not a step kind this home knows.`, {
        received: entry.node.kind,
        fix: 'pick a kind from the catalogue',
      }),
    ];
  }
  const classProblems =
    (kind.class === 'trigger') === (entry.kind === 'trigger')
      ? []
      : [
          problem(subject, 'wrong_node_class', `${entry.node.kind} is not allowed here.`, {
            received: entry.node.kind,
            fix: entry.kind === 'trigger' ? 'use a trigger kind' : 'use a step kind',
          }),
        ];
  const rule = entry.kind === 'node' ? own(NODE_RULES, entry.node.kind) : undefined;
  return [
    ...classProblems,
    ...shapeProblems(subject, entry, shape),
    ...entrySites(entry, shape).flatMap((site) => siteProblems(subject, site, typed, ctx)),
    ...(rule !== undefined && entry.kind === 'node' ? rule(subject, entry.node, ctx) : []),
  ];
}

export function checkProgramValues(
  program: Program,
  typed: TypedProgram,
  ctx: CheckContext,
): readonly Problem[] {
  const admit =
    'admit' in program && program.admit !== undefined
      ? [{ port: 'admit', value: program.admit, type: FLAG, isStatic: false }]
      : [];
  const variables = program.variables.map((variable) => ({
    port: `variables.${variable.name}`,
    value: variable.initial,
    type: variable.type,
    isStatic: false,
  }));
  return [...admit, ...variables].flatMap((site) =>
    siteProblems(PROGRAM_SUBJECT, site, typed, ctx),
  );
}
