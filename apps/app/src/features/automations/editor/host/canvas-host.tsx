import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { useStableCallback } from '../../../../design/use-stable-callback';
import GraphCanvas from '../canvas/graph-canvas';
import type { GraphIntentFeedback, GraphPoint } from '../canvas/graph-canvas-types';
import { applyCanvasIntent, applyViewIntent, type ViewActions } from './canvas-intents';
import { useCanvasFrame } from './canvas-frame';
import { deviceClipboard } from './clipboard-port';
import type { HostActions } from './host-actions';
import type { EditorEnv } from './intent-env';
import type { GraphFraming } from '../canvas/viewport';
import type { GraphScene } from '../../model/graph/scene-contract';
import { useCanvasProps, type CanvasInput } from './use-canvas-props';
import { useIntentRuntime } from './use-intent-runtime';

const EDITING = { readOnly: false, framing: 'opening' } as const;

export interface CanvasHostProps extends CanvasInput {
  readonly actions: HostActions;
  readonly check: CheckContext;
}

function useWindowDrop(frame: RefObject<View | null>, actions: HostActions): HostActions {
  const { dropEmpty } = actions;
  return useMemo(
    (): HostActions => ({
      ...actions,
      dropEmpty: (from, point, screen: GraphPoint): void => {
        frame.current?.measureInWindow((x, y) => {
          dropEmpty(from, point, { x: x + screen.x, y: y + screen.y });
        });
      },
    }),
    [frame, actions, dropEmpty],
  );
}

export function CanvasHost(props: CanvasHostProps): ReactNode {
  const { store, check } = props;
  const frame = useCanvasFrame();
  const box = useRef<View>(null);
  const actions = useWindowDrop(box, props.actions);
  const canvas = useCanvasProps(props, EDITING);
  const runtime = useIntentRuntime(check, props.options.registry, canvas.measured);
  const intent = useMemo(
    (): EditorEnv => ({ store, clipboard: deviceClipboard, runtime }),
    [store, runtime],
  );
  const onIntent = useStableCallback((raw: unknown): Promise<GraphIntentFeedback | null> =>
    applyCanvasIntent(raw, { intent, actions, measure: canvas.measure }),
  );
  return (
    <View ref={box} className="min-h-0 flex-1">
      <GraphCanvas key={frame.generation} {...canvas.props} onIntent={onIntent} dom={frame.dom} />
    </View>
  );
}

export interface ViewCanvasProps extends CanvasInput {
  readonly actions: ViewActions;
  readonly framing: GraphFraming;
}

export interface ViewCanvasHandle {
  readonly element: ReactNode;
  readonly scene: GraphScene;
}

export function useViewCanvas(props: ViewCanvasProps): ViewCanvasHandle {
  const { store, actions, framing } = props;
  const frame = useCanvasFrame();
  const canvas = useCanvasProps(props, { readOnly: true, framing });
  const onIntent = useStableCallback((raw: unknown): Promise<GraphIntentFeedback | null> =>
    Promise.resolve(applyViewIntent(raw, { store, actions, measure: canvas.measure })),
  );
  const element = (
    <GraphCanvas key={frame.generation} {...canvas.props} onIntent={onIntent} dom={frame.dom} />
  );
  return { element, scene: canvas.scene };
}

export function ViewCanvas(props: ViewCanvasProps): ReactNode {
  return useViewCanvas(props).element;
}
