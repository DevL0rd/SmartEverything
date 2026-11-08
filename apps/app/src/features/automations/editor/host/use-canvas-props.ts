import { useMemo, useState } from 'react';
import type { Layout, NodeRegistry, ProgramV4, RefNames } from '@smarteverything/domain';
import { useAnimationGate } from '../../../../design/animation-gate';
import { useColourResolver } from '../../../../design/colour';
import { usePausable } from '../../../../design/external-store';
import { useIdiom } from '../../../../design/platform';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { Size } from '@smarteverything/flow/graph/metrics';
import type { DocumentStore } from '../../model/editor/document-store';
import type { GraphRunOverlay } from '../../model/graph/run-overlay';
import { projectGraphScene } from '../../model/graph/project-graph-scene';
import { mergeMeasured } from '../../model/graph/scene-sizes';
import type { GraphScene, SceneProblemEntry } from '../../model/graph/scene-contract';
import type {
  GraphCanvasProps,
  GraphDropGhost,
  GraphMeasuredSize,
} from '../canvas/graph-canvas-types';
import type { MeasureSizes } from './canvas-intents';
import type { GraphFraming, ViewportCommand } from '../canvas/viewport';
import { buildCanvasTheme } from './theme-map';
import { useDensity } from './use-intent-runtime';

export interface FunctionInfo {
  readonly name: string;
  readonly latest: number;
}

export interface SceneOptions {
  readonly registry: NodeRegistry;
  readonly names: RefNames;
  readonly functions: ReadonlyMap<string, FunctionInfo>;
}

export type RunSource = (scene: GraphScene) => GraphRunOverlay;

export interface CanvasInput {
  readonly store: DocumentStore;
  readonly options: SceneOptions;
  readonly problems: readonly SceneProblemEntry[];
  readonly run: RunSource | null;
  readonly focusNode: string | null;
  readonly viewportCommand: ViewportCommand | null;
  readonly onScreen: boolean;
  readonly ghost: GraphDropGhost | null;
}

export interface CanvasHandle {
  readonly props: Omit<GraphCanvasProps, 'onIntent'>;
  readonly scene: GraphScene;
  readonly measure: MeasureSizes;
  readonly measured: ReadonlyMap<string, Size>;
}

function useGraphScene(
  input: CanvasInput,
  program: ProgramV4,
  layout: Layout,
  measured: ReadonlyMap<string, Size>,
): GraphScene {
  const { options, problems } = input;
  const density = useDensity();
  return useMemo(
    () =>
      projectGraphScene(program, {
        direction: 'ltr',
        density,
        layout,
        names: options.names,
        kinds: options.registry,
        problems,
        functions: options.functions,
        measured,
      }),
    [
      program,
      layout,
      options.names,
      options.registry,
      options.functions,
      density,
      problems,
      measured,
    ],
  );
}

export interface CanvasMode {
  readonly readOnly: boolean;
  readonly framing: GraphFraming;
}

export function useCanvasProps(input: CanvasInput, mode: CanvasMode): CanvasHandle {
  const { store } = input;
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const layout = usePausable(store.state.subscribe, () => store.state.get().layout);
  const selection = usePausable(store.state.subscribe, () => store.state.get().selection.ids);
  const idiom = useIdiom();
  const [measured, setMeasured] = useState<ReadonlyMap<string, Size>>(() => new Map());
  const measure: MeasureSizes = useStableCallback((sizes: readonly GraphMeasuredSize[]): void => {
    setMeasured((known) => mergeMeasured(known, sizes));
  });
  const scene = useGraphScene(input, program, layout, measured);
  const { run: source } = input;
  const run = useMemo(() => (source === null ? null : source(scene)), [source, scene]);
  const theme = buildCanvasTheme(useColourResolver());
  const { moving } = useAnimationGate(true, input.onScreen);
  const props: Omit<GraphCanvasProps, 'onIntent'> = {
    scene,
    theme,
    run,
    selection: [...selection],
    focusNode: input.focusNode,
    viewportCommand: input.viewportCommand,
    ghost: input.ghost,
    active: moving,
    readOnly: mode.readOnly,
    framing: mode.framing,
    idiom,
  };
  return { props, scene, measure, measured };
}
