import { z } from 'zod';

const ID = z.uuid();
const COORDINATE = z.number();

export const NODE_LAYOUT = z.strictObject({
  x: COORDINATE,
  y: COORDINATE,
  collapsed: z.boolean().optional(),
});

export const LAYOUT_FRAME = z.strictObject({
  id: ID,
  title: z.string(),
  color: z.string().min(1),
  nodeIds: z.array(ID),
  collapsed: z.boolean(),
});

export const LAYOUT_COMMENT = z.strictObject({
  id: ID,
  text: z.string(),
  x: COORDINATE,
  y: COORDINATE,
  w: z.number().positive(),
});

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const LAYOUT = z
  .strictObject({
    nodes: z.record(ID, NODE_LAYOUT),
    frames: z.array(LAYOUT_FRAME),
    comments: z.array(LAYOUT_COMMENT),
  })
  .superRefine((layout, context) => {
    if (hasDuplicates(layout.frames.map((frame) => frame.id))) {
      context.addIssue({ code: 'custom', path: ['frames'], message: 'frame ids must be unique' });
    }
    if (hasDuplicates(layout.comments.map((comment) => comment.id))) {
      context.addIssue({
        code: 'custom',
        path: ['comments'],
        message: 'comment ids must be unique',
      });
    }
    layout.frames.forEach((frame, index) => {
      if (hasDuplicates(frame.nodeIds)) {
        context.addIssue({
          code: 'custom',
          path: ['frames', index, 'nodeIds'],
          message: 'a frame lists each node once',
        });
      }
    });
  });

export type NodeLayout = z.infer<typeof NODE_LAYOUT>;
export type LayoutFrame = z.infer<typeof LAYOUT_FRAME>;
export type LayoutComment = z.infer<typeof LAYOUT_COMMENT>;
export type Layout = z.infer<typeof LAYOUT>;

export const EMPTY_LAYOUT: Layout = { nodes: {}, frames: [], comments: [] };
