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
import type { FlowNode, Scope } from './node';
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

function wholeOutput(node: Labelled, ctx: DescribeContext): (name: string) => boolean {
  const outputs = ctx.kinds(node.kind)?.outputs ?? [];
  return (name) => name === 'value' || (outputs.length === 1 && outputs[0]?.name === name);
}

export function describedStep(node: Labelled, ctx: DescribeContext): WireStep {
  return plainStep(nodeLabel(node, ctx.kinds), wholeOutput(node, ctx));
}

function triggerStep(program: ProgramV3, ctx: DescribeContext): WireStep {
  if (program.kind !== 'automation') return plainStep('Trigger');
  const [only, ...others] = program.triggers;
  return only === undefined || others.length > 0 ? plainStep('Trigger') : describedStep(only, ctx);
}

export function wireScopeOf(program: ProgramV3, ctx: DescribeContext): WireScope {
  const steps = new Map(programNodes(program).map((node) => [node.key, node]));
  return {
    step: (key): WireStep | undefined => {
      const node = steps.get(key);
      return node === undefined ? undefined : describedStep(node, ctx);
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

function valueWords(value: PortValue, ctx: DescribeContext, scope: WireScope): string {
  return 'wire' in value
    ? plainWire(value.wire, scope)
    : portText(value, undefined, ctx.names, scope);
}

interface SentenceParts {
  readonly ctx: DescribeContext;
  readonly scope: WireScope;
}

function admitText(program: AutomationV3, parts: SentenceParts): string {
  const admit = program.admit;
  return admit !== undefined && 'wire' in admit
    ? `, if ${valueWords(admit, parts.ctx, parts.scope)}`
    : '';
}

function described(node: FlowNode, parts: SentenceParts): boolean {
  if (node.enabled === false) return false;
  const kind = parts.ctx.kinds(node.kind);
  return kind?.structural !== true && (kind?.class === 'effect' || kind?.class === 'control');
}

function scopeText(scope: Scope | undefined, parts: SentenceParts): string {
  const nodes = (scope?.nodes ?? []).filter((node) => described(node, parts));
  return nodes.map((node) => stepText(node, parts)).join(', then ');
}

function inBrackets(text: string): string {
  return text === '' ? '' : ` (${text})`;
}

function ifText(node: FlowNode, parts: SentenceParts): string {
  const rows = (node.branches ?? []).map((row) => {
    const when = valueWords(row.when, parts.ctx, parts.scope);
    return `if ${when}${inBrackets(scopeText(row.scope, parts))}`;
  });
  const otherwise = scopeText(node.scopes?.['else'], parts);
  return [...rows, ...(otherwise === '' ? [] : [`otherwise ${otherwise}`])].join(', ');
}

function tryText(node: FlowNode, parts: SentenceParts): string {
  const attempt = scopeText(node.scopes?.['try'], parts);
  const failed = (node.catches ?? [])
    .map((row) => scopeText(row.scope, parts))
    .filter((text) => text !== '')
    .map((text) => `if that fails ${text}`);
  const always = scopeText(node.scopes?.['finally'], parts);
  return [
    `try ${attempt === '' ? 'nothing' : attempt}`,
    ...failed,
    ...(always === '' ? [] : [`and always ${always}`]),
  ].join(', ');
}

function lanesText(node: FlowNode, parts: SentenceParts): readonly string[] {
  return Object.values(node.scopes ?? {})
    .map((scope) => scopeText(scope, parts))
    .filter((text) => text !== '');
}

function stepText(node: FlowNode, parts: SentenceParts): string {
  if ((node.branches ?? []).length > 0) return ifText(node, parts);
  if (node.catches !== undefined || node.scopes?.['try'] !== undefined) return tryText(node, parts);
  const lanes = lanesText(node, parts);
  if (parts.ctx.kinds(node.kind)?.scopes?.minimum !== undefined) {
    return `at the same time${inBrackets(lanes.join(' and '))}`;
  }
  return `${lowerFirst(nodeSummaryText(node, parts.ctx, parts.scope))}${inBrackets(lanes.join(', then '))}`;
}

export function automationSentence(program: AutomationV3, ctx: DescribeContext): string | null {
  const scope: WireScope = { ...wireScopeOf(program, ctx), spoken: true };
  const when = program.triggers
    .filter((trigger) => trigger.enabled !== false)
    .map((trigger) => lowerFirst(nodeSummaryText(trigger, ctx, scope)));
  const parts: SentenceParts = {
    ctx,
    scope,
  };
  const then = scopeText(program.body, parts);
  if (when.length === 0 || then === '') return null;
  return upperFirst(`${when.join(' or ')}${admitText(program, parts)}, ${then}.`);
}
