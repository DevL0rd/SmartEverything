import { renderSummary } from '../automation-nodes/summary-template';
import {
  lowerFirst,
  nodeLabel,
  upperFirst,
  type DescribeContext,
  type Labelled,
} from './describe-context';
import { plainStep, plainWire, type WireScope, type WireStep } from './describe-wire';
import { portText } from './describe-values';
import type { FlowNode } from './node';
import type { PortValue } from './port-value';
import type { AutomationV3, ProgramV3 } from './program';
import { visitNodes } from './scope';
import { humanizeKey } from '../presentation/humanize';

export * from './describe-context';
export * from './describe-wire';
export { durationText, literalText, portText } from './describe-values';

export interface Describable extends Labelled {
  readonly ports?: Readonly<Record<string, PortValue>> | undefined;
}

export function programNodes(program: ProgramV3): readonly FlowNode[] {
  const roots =
    program.kind === 'automation' && program.onFailure !== undefined
      ? [program.body, program.onFailure]
      : [program.body];
  return roots.flatMap((scope) => visitNodes(scope, []).map((visited) => visited.node));
}

function triggerStep(program: ProgramV3, ctx: DescribeContext): WireStep {
  if (program.kind !== 'automation') return plainStep('Trigger');
  const [only, ...others] = program.triggers;
  return plainStep(
    only === undefined || others.length > 0 ? 'Trigger' : nodeLabel(only, ctx.kinds),
  );
}

export function wireScopeOf(program: ProgramV3, ctx: DescribeContext): WireScope {
  const steps = new Map(programNodes(program).map((node) => [node.key, node]));
  return {
    step: (key): WireStep | undefined => {
      const node = steps.get(key);
      return node === undefined ? undefined : plainStep(nodeLabel(node, ctx.kinds));
    },
    variable: (name): string | undefined => {
      const found = program.variables.find((variable) => variable.name === name);
      return found === undefined ? undefined : humanizeKey(found.name);
    },
    input: (name): string | undefined => {
      const found = program.inputs.find((input) => input.name === name);
      return found === undefined ? undefined : (found.label ?? humanizeKey(found.name));
    },
    trigger: triggerStep(program, ctx),
  };
}

export function nodeSummaryText(node: Describable, ctx: DescribeContext, scope: WireScope): string {
  const kind = ctx.kinds(node.kind);
  if (kind === undefined) return nodeLabel(node, ctx.kinds);
  const chip = (port: string): string => {
    const decl = kind.inputs.find((input) => input.name === port);
    const given = node.ports?.[port];
    const fallback = decl?.default === undefined ? undefined : { lit: decl.default };
    return portText(given ?? fallback, decl, ctx.names, scope);
  };
  return renderSummary(kind.summary, node.ports ?? {})
    .map((part) => (part.kind === 'text' ? part.text : chip(part.port)))
    .join('');
}

function admitText(program: AutomationV3, scope: WireScope): string {
  const admit = program.admit;
  return admit !== undefined && 'wire' in admit ? `, if ${plainWire(admit.wire, scope)}` : '';
}

function stepSentences(
  program: AutomationV3,
  ctx: DescribeContext,
  scope: WireScope,
): readonly string[] {
  return program.body.nodes
    .filter((node) => node.enabled !== false)
    .filter((node) => {
      const kindClass = ctx.kinds(node.kind)?.class;
      return kindClass === 'effect' || kindClass === 'control';
    })
    .map((node) => lowerFirst(nodeSummaryText(node, ctx, scope)));
}

export function automationSentence(program: AutomationV3, ctx: DescribeContext): string | null {
  const scope = wireScopeOf(program, ctx);
  const when = program.triggers
    .filter((trigger) => trigger.enabled !== false)
    .map((trigger) => lowerFirst(nodeSummaryText(trigger, ctx, scope)));
  const then = stepSentences(program, ctx, scope);
  if (when.length === 0 || then.length === 0) return null;
  return upperFirst(`${when.join(' or ')}${admitText(program, scope)}, ${then.join(', then ')}.`);
}
