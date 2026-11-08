import type { ReactNode } from 'react';
import type { GraphSceneNode, SceneExecRow } from '../../../model/graph/scene-contract';
import { useGraphEmit } from '../graph-context';

export const ADD_TRIGGER = '+ Add what starts it';
export const ADD_FIRST_STEP = '+ Add the first step';
export const EMPTY_HINT =
  'Choose what starts it, then add steps. Pick a pin, then the step that runs next.';

export interface EmptySides {
  readonly trigger: boolean;
  readonly step: boolean;
}

export function emptySidesOf(
  scene: GraphSceneNode,
  incoming: readonly string[],
  then: SceneExecRow | undefined,
): EmptySides {
  return {
    trigger: scene.inputs.length > 0 && incoming.length === 0,
    step: then !== undefined && !then.wired,
  };
}

export function EmptyPlaceholders({
  scene,
  then,
  sides,
}: {
  readonly scene: GraphSceneNode;
  readonly then: SceneExecRow | undefined;
  readonly sides: EmptySides;
}): ReactNode {
  const emit = useGraphEmit();
  if (!sides.trigger && !sides.step) return null;
  return (
    <>
      {sides.trigger ? (
        <button
          type="button"
          className="gc-ph gc-ph-trigger nodrag nopan"
          onClick={(): void => {
            emit({ type: 'addTrigger' });
          }}
        >
          {ADD_TRIGGER}
        </button>
      ) : null}
      {sides.step && then !== undefined ? (
        <button
          type="button"
          className="gc-ph gc-ph-step nodrag nopan"
          onClick={(): void => {
            emit({ type: 'insertOnWire', from: { nodeId: scene.id, handle: then.handle } });
          }}
        >
          {ADD_FIRST_STEP}
        </button>
      ) : null}
      {sides.trigger && sides.step ? <p className="gc-ph-hint">{EMPTY_HINT}</p> : null}
    </>
  );
}
