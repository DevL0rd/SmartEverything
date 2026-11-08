import type { StartDrag } from './pointer';
import { HandleDragUnavailableError } from './sessions-factory';
import {
  ShapeSession,
  grabOf,
  type ShapeGrab,
  type ShapeHooks,
  type ShapeStep,
} from './sessions-shape-base';
import { coneStep, openingSlideStep, scanStep } from './sessions-shape-pose';
import {
  lineEndStep,
  rectCornerStep,
  roomCornerStep,
  roomSideStep,
  shapeCornerStep,
  wallEndStep,
  wallMiddleStep,
} from './sessions-shape-ring';

export class BodyDragUnavailableError extends Error {
  constructor(readonly id: string) {
    super(`Shape drags start on edit handles, not on the body of ${id}`);
    this.name = 'BodyDragUnavailableError';
  }
}

type HandleTarget = ShapeGrab['handle']['target'];

type DraftTarget = Extract<
  HandleTarget,
  { readonly kind: 'rect-corner' | 'shape-corner' | 'line-end' }
>;

type FixedTarget = Exclude<HandleTarget, DraftTarget>;

function isDraft(target: HandleTarget): target is DraftTarget {
  return (
    target.kind === 'rect-corner' || target.kind === 'shape-corner' || target.kind === 'line-end'
  );
}

function draftStepOf(grab: ShapeGrab, target: DraftTarget): ShapeStep {
  switch (target.kind) {
    case 'rect-corner':
      return rectCornerStep(grab, target);
    case 'shape-corner':
      return shapeCornerStep(grab, target);
    case 'line-end':
      return lineEndStep(grab, target);
  }
}

function fixedStepOf(grab: ShapeGrab, target: FixedTarget): ShapeStep {
  switch (target.kind) {
    case 'room-corner':
      return roomCornerStep(grab, target);
    case 'room-side':
      return roomSideStep(grab, target);
    case 'wall-end':
      return wallEndStep(grab, target);
    case 'wall-middle':
      return wallMiddleStep(grab, target);
    case 'opening':
      return openingSlideStep(grab, target);
    case 'scan':
      return scanStep(grab);
    case 'cone':
      return coneStep(grab, target);
    case 'gizmo':
      throw new HandleDragUnavailableError(grab.handle.id);
  }
}

function stepOf(grab: ShapeGrab): ShapeStep {
  const { target } = grab.handle;
  return isDraft(target) ? draftStepOf(grab, target) : fixedStepOf(grab, target);
}

export function shapeDrags(hooks: ShapeHooks): StartDrag {
  return (start) => {
    if (start.grab.kind === 'body') throw new BodyDragUnavailableError(start.grab.id);
    const { handleId } = start.grab;
    const view = hooks.view();
    const handle = view.overlay.handles.find((each) => each.id === handleId);
    if (handle === undefined) throw new HandleDragUnavailableError(handleId);
    return new ShapeSession(hooks, start, stepOf(grabOf(view, handle, start.from)));
  };
}
