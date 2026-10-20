import type {
  AutomationV3,
  FlowNode,
  Layout,
  NodeClass,
  NodeKind,
  NodeRegistry,
  PortValue,
  DescribeContext,
  WireScope,
  RefNames,
} from '@smarteverything/domain';
import { appendTo, categoryName, portText } from '@smarteverything/domain';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { ScopePath } from '@smarteverything/flow/program/paths';
import type { ProblemInput, RunOverlay, SceneEdge, SceneNode } from './contract';

export interface FunctionInfo {
  readonly name: string;
  readonly latest: number;
}

export interface ProjectOptions {
  readonly registry: NodeRegistry;
  readonly layout: Layout;
  readonly problems?: readonly ProblemInput[];
  readonly run?: RunOverlay | null;
  readonly functions?: ReadonlyMap<string, FunctionInfo>;
  readonly failureOpen?: boolean;
  readonly names?: RefNames;
}

export type Draft = Omit<SceneNode, 'x' | 'y' | 'w' | 'h' | 'parentId'>;

export interface Lane {
  readonly id: string;
  readonly draft: Draft | null;
  readonly path: ScopePath;
  readonly length: number;
  readonly items: readonly Item[];
  readonly slot: Draft | null;
  readonly loopLabel: string | null;
}

export interface Item {
  readonly draft: Draft;
  readonly at: number;
  readonly exec: boolean;
  readonly values: readonly Item[];
  readonly lanes: readonly Lane[];
}

export interface KindView {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly category: string;
  readonly icon: string;
  readonly cls: NodeClass;
  readonly inputs: NodeKind['inputs'];
  readonly outputs: NodeKind['outputs'];
  readonly scopes: NodeKind['scopes'];
  readonly summary: string;
  readonly known: boolean;
}

export interface Env {
  readonly options: ProjectOptions;
  readonly describe: DescribeContext;
  readonly scope: WireScope;
  readonly kinds: (id: string) => KindView;
  readonly program: Program;
  readonly index: ProgramIndex;
  readonly problems: ReadonlyMap<string, readonly ProblemInput[]>;
  readonly values: ReadonlyMap<string, FlowNode>;
  readonly claimed: Set<string>;
  readonly ordinals: ReadonlyMap<string, number>;
  readonly total: number;
  readonly inputsId: string | null;
  readonly keys: ReadonlySet<string>;
  readonly referenced: ReadonlySet<string>;
  readonly titles: ReadonlyMap<string, string>;
  readonly edges: SceneEdge[];
  readonly edgeIds: Set<string>;
}

const UNKNOWN_KIND: KindView = {
  id: 'unknown',
  name: 'Unknown step',
  categoryId: 'utilities',
  category: 'Unknown',
  icon: 'circle-help',
  cls: 'effect',
  inputs: [],
  outputs: [],
  scopes: undefined,
  summary: 'Unknown step',
  known: false,
};

export function kindView(registry: NodeRegistry, id: string): KindView {
  const kind = registry.get(id);
  if (kind === undefined) return { ...UNKNOWN_KIND, id };
  return {
    id: kind.id,
    name: kind.name,
    categoryId: kind.category,
    category: categoryName(kind.category),
    icon: kind.icon,
    cls: kind.class,
    inputs: kind.inputs,
    outputs: kind.outputs,
    scopes: kind.scopes,
    summary: kind.summary,
    known: true,
  };
}

export function isValueClass(cls: NodeClass): boolean {
  return cls === 'pure' || cls === 'read';
}

export function groupProblems(
  problems: readonly ProblemInput[],
): ReadonlyMap<string, readonly ProblemInput[]> {
  const grouped = new Map<string, ProblemInput[]>();
  for (const problem of problems) {
    appendTo(grouped, problem.nodeId, problem);
  }
  return grouped;
}

export function isAutomation(program: Program): program is AutomationV3 {
  return program.kind === 'automation';
}

export interface Titled {
  readonly kind: string;
  readonly label?: string | undefined;
  readonly ports?: Readonly<Record<string, PortValue>> | undefined;
}

export const FUNCTION_CALL_KIND = 'fn.call';

export const CUSTOM_NODE_OVERLINE = 'Custom Node';

export function calledFunction(options: ProjectOptions, node: Titled): FunctionInfo | undefined {
  const fn = node.ports?.['fn'];
  const id = fn !== undefined && 'lit' in fn && typeof fn.lit === 'string' ? fn.lit : null;
  return id === null ? undefined : options.functions?.get(id);
}

export function titleOf(options: ProjectOptions, node: Titled): string {
  if (node.label !== undefined) return node.label;
  const info = node.kind === FUNCTION_CALL_KIND ? calledFunction(options, node) : undefined;
  return info?.name ?? kindView(options.registry, node.kind).name;
}

export function valueWords(env: Env, value: PortValue): string {
  return portText(value, undefined, env.describe.names, env.scope);
}
