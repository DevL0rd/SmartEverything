import type { EditOverlay } from '../map-3d-edit-protocol';
import type { GizmoView } from './gizmo';
import { gizmoDrags } from './gizmo-drags';
import type { GizmoPreview } from './gizmo-scale';
import type { DragGrab, DragSession, EditEventDraft, StartDrag } from './pointer';
import { moveDrags, type MovePreview } from './sessions-factory';
import { roomDrags, roomOfGrab } from './sessions-room';
import { shapeDrags } from './sessions-shape';
import type { ShapePreview, ShapeView } from './sessions-shape-base';

export type EditDragView = GizmoView & ShapeView;

export type DragFamily = 'move' | 'gizmo' | 'shape' | 'room';

export type EditPreview =
  | { readonly family: 'move'; readonly preview: MovePreview }
  | { readonly family: 'gizmo'; readonly preview: GizmoPreview }
  | { readonly family: 'shape'; readonly preview: ShapePreview };

export interface EditDragHooks {
  readonly view: () => EditDragView;
  readonly preview: (preview: EditPreview | null) => void;
  readonly active: (grab: DragGrab | null) => void;
}

function shapeSink(hooks: EditDragHooks): (preview: ShapePreview | null) => void {
  return (preview) => {
    hooks.preview(preview === null ? null : { family: 'shape', preview });
  };
}

export function dragFamilyOf(overlay: EditOverlay, grab: DragGrab): DragFamily {
  if (grab.kind === 'body') return 'move';
  const handle = overlay.handles.find((each) => each.id === grab.handleId);
  if (handle === undefined || handle.target.kind === 'gizmo') return 'gizmo';
  return 'shape';
}

function tracked(session: DragSession, grab: DragGrab, hooks: EditDragHooks): DragSession {
  hooks.active(grab);
  return {
    move: (at, modifiers): void => {
      session.move(at, modifiers);
    },
    twist: (motion, modifiers, pair): void => {
      session.twist(motion, modifiers, pair);
    },
    end: (): EditEventDraft | null => {
      hooks.active(null);
      return session.end();
    },
    cancel: (): void => {
      hooks.active(null);
      session.cancel();
    },
  };
}

export function editDrags(hooks: EditDragHooks): StartDrag {
  const families: Readonly<Record<DragFamily, StartDrag>> = {
    move: moveDrags({
      view: hooks.view,
      preview: (preview) => {
        hooks.preview(preview === null ? null : { family: 'move', preview });
      },
    }),
    gizmo: gizmoDrags({
      view: hooks.view,
      preview: (preview) => {
        hooks.preview(preview === null ? null : { family: 'gizmo', preview });
      },
    }),
    shape: shapeDrags({ view: hooks.view, preview: shapeSink(hooks) }),
    room: roomDrags({ view: hooks.view, preview: shapeSink(hooks) }),
  };
  return (start) => {
    const view = hooks.view();
    const room = roomOfGrab(view, start.grab) !== null;
    const family = room ? 'room' : dragFamilyOf(view.overlay, start.grab);
    return tracked(families[family](start), start.grab, hooks);
  };
}
