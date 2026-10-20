import { useCallback, useMemo, useState } from 'react';
import { Dimensions } from 'react-native';
import type { Layout } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { useAnimationGate } from '../../../../design/animation-gate';
import { useColourResolver } from '../../../../design/colour';
import { usePausable } from '../../../../design/external-store';
import { useIdiom } from '../../../../design/platform';
import type {
  CanvasProps,
  RunOverlay,
  Scene,
  SceneMode,
  ViewportCommand,
} from '../../model/canvas/contract';
import { projectScene } from '../../model/canvas/project-scene';
import type { ProjectOptions } from '../../model/canvas/tree-env';
import type { DocumentStore } from '../../model/editor/document-store';
import { sizeClassFor } from '../canvas/viewport';
import type { CanvasMetrics } from './intent-env';
import { buildCanvasTheme } from './theme-map';

export type SceneOptions = Omit<ProjectOptions, 'layout' | 'run'>;

export interface CanvasInput {
  readonly store: DocumentStore;
  readonly options: SceneOptions;
  readonly run: RunOverlay | null;
  readonly focusNode: string | null;
  readonly viewportCommand: ViewportCommand | null;
  readonly onScreen: boolean;
}

export interface CanvasHandle {
  readonly props: CanvasProps;
  readonly scene: Scene;
  readonly ready: (metrics: CanvasMetrics) => void;
}

interface Basis {
  readonly mode: SceneMode;
  readonly compactWidth: number | null;
}

function basisFor(width: number): Basis {
  const mode = sizeClassFor(width);
  return { mode, compactWidth: mode === 'compact' ? width : null };
}

function sameBasis(left: Basis, right: Basis): boolean {
  return left.mode === right.mode && left.compactWidth === right.compactWidth;
}

function useBasis(): { readonly basis: Basis; readonly ready: (metrics: CanvasMetrics) => void } {
  const [basis, setBasis] = useState(() => basisFor(Dimensions.get('window').width));
  const ready = useCallback((metrics: CanvasMetrics): void => {
    const next = basisFor(metrics.width);
    setBasis((current) => (sameBasis(current, next) ? current : next));
  }, []);
  return { basis, ready };
}

function useScene(program: Program, layout: Layout, options: SceneOptions, basis: Basis): Scene {
  return useMemo(
    () =>
      projectScene(program, {
        ...options,
        layout,
        mode: basis.mode,
        ...(basis.compactWidth === null ? {} : { canvasWidth: basis.compactWidth }),
      }),
    [program, layout, options, basis],
  );
}

export function useCanvasProps(input: CanvasInput): CanvasHandle {
  const { store } = input;
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const layout = usePausable(store.state.subscribe, () => store.state.get().layout);
  const selection = usePausable(store.state.subscribe, () => store.state.get().selection.ids);
  const { basis, ready } = useBasis();
  const scene = useScene(program, layout, input.options, basis);
  const theme = buildCanvasTheme(useColourResolver());
  const idiom = useIdiom();
  const { moving } = useAnimationGate(true, input.onScreen);
  const props: CanvasProps = {
    scene,
    theme,
    run: input.run,
    selection: [...selection],
    focusNode: input.focusNode,
    viewportCommand: input.viewportCommand,
    active: moving,
    idiom,
  };
  return { props, scene, ready };
}
