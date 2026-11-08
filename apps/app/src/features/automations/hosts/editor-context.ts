import { useMemo } from 'react';
import {
  buildRegistry,
  wireScopeOf,
  type AutomationFunctionSummary,
  type DescribeContext,
  type NodeRegistry,
  type RefNames,
} from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { useAutomationsSource } from '../data/source';
import { useFunctions } from '../data/use-functions';
import type { InspectorModel } from '../editor/inspector/inspector';
import type { FunctionChoice, GraphEnv } from '../editor/inspector/sections/section-types';
import { renderPortValue } from '../editor/inspector/values/render-port-value';
import type { SceneOptions } from '../editor/host/use-canvas-props';
import { structuredFor } from '../model/editor/structured';
import { interfaceLine } from '../editor/palette/palette-categories';
import type { InspectorEnvInput } from '../editor/screen/editor-panes';
import { useLintContext, useRefNames } from './use-environment';

const NO_FUNCTIONS: readonly AutomationFunctionSummary[] = [];

export interface EditorContext {
  readonly registry: NodeRegistry;
  readonly describe: DescribeContext;
  readonly names: RefNames;
  readonly lint: LintContext;
  readonly functions: ReadonlyMap<string, FunctionChoice>;
  readonly options: SceneOptions;
}

export function inspectorEnvOf(input: InspectorEnvInput, context: EditorContext): InspectorModel {
  const kinds = context.registry;
  const { program, layout, target, findings } = input;
  const graph: GraphEnv = {
    graph: program,
    registry: context.registry,
    findings,
    subjectChoices: undefined,
    renderValue: renderPortValue,
    locked: false,
  };
  const structured = structuredFor(program, kinds);
  if (structured.kind === 'unstructured') return { graph, steps: null };
  const tree = structured.tree;
  return {
    graph,
    steps: {
      ...graph,
      program: tree,
      index: indexProgram(tree),
      describe: context.describe,
      scope: wireScopeOf(tree, context.describe),
      functions: context.functions,
      exits: tree.kind === 'function' ? tree.exits : [],
      breakpoint: false,
      freePosition: target !== null && layout.nodes[target] !== undefined,
      run: null,
    },
  };
}

function choiceOf(summary: AutomationFunctionSummary): FunctionChoice {
  return {
    id: summary.id,
    name: summary.name,
    interfaceLine: interfaceLine(summary),
    latest: summary.revision,
    inputs: summary.interface.inputs,
  };
}

export function editorContextOf(input: {
  readonly registry: NodeRegistry;
  readonly names: RefNames;
  readonly lint: LintContext;
  readonly summaries: readonly AutomationFunctionSummary[];
}): EditorContext {
  const { registry, names, lint, summaries } = input;
  const functions = new Map(summaries.map((summary) => [summary.id, choiceOf(summary)] as const));
  const infos = new Map(
    summaries.map((summary) => [summary.id, { name: summary.name, latest: summary.revision }]),
  );
  return {
    registry,
    describe: { kinds: (id) => registry.get(id), names },
    names,
    lint,
    functions,
    options: { registry, names, functions: infos },
  };
}

export function useEditorContext(): EditorContext {
  const { kinds } = useAutomationsSource();
  const registry = useMemo(() => buildRegistry(kinds), [kinds]);
  const names = useRefNames();
  const lint = useLintContext();
  const summaries = useFunctions().data ?? NO_FUNCTIONS;
  return useMemo(
    () => editorContextOf({ registry, names, lint, summaries }),
    [registry, names, lint, summaries],
  );
}
