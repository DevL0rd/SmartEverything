import { z } from 'zod';

const ID = z.string().min(1);
const COORDINATE = z.number();
const SIZE = z.number().positive();

export const SCENE_ROLES = [
  'trigger',
  'triggerGroup',
  'admit',
  'step',
  'container',
  'value',
  'lane',
  'failure',
  'slot',
  'inputs',
  'exits',
] as const;

export const PORT_SHAPES = ['circle', 'diamond', 'square', 'hexagon', 'triangle'] as const;

export const PROBLEM_SEVERITIES = ['critical', 'warning'] as const;

export const RUN_STATES = ['running', 'done', 'failed', 'skipped', 'waiting'] as const;

export const SCENE_MODES = ['wide', 'compact'] as const;

export const INSERT_PLACEMENTS = ['edge', 'slot', 'tail'] as const;

export const SHORTCUTS = [
  'undo',
  'redo',
  'copy',
  'paste',
  'cut',
  'duplicate',
  'group',
  'selectAll',
] as const;

export const PROBLEM = z.strictObject({
  severity: z.enum(PROBLEM_SEVERITIES),
  message: z.string().min(1),
  port: z.string().min(1).nullable(),
});

export const PROBLEM_INPUT = z.strictObject({
  nodeId: ID,
  severity: z.enum(PROBLEM_SEVERITIES),
  message: z.string().min(1),
  port: z.string().min(1).optional(),
});

export const RUN_NODE = z.strictObject({
  state: z.enum(RUN_STATES),
  text: z.string().optional(),
  iteration: z.int().min(1).optional(),
});

export const RUN_OVERLAY = z.record(ID, RUN_NODE);

export const SCENE_PORT = z.strictObject({
  name: ID,
  label: z.string().min(1),
  shape: z.enum(PORT_SHAPES),
  type: z.string().min(1),
  direction: z.enum(['in', 'out']),
  value: z.string().nullable(),
  wired: z.boolean(),
  problem: z.boolean(),
});

export const SCENE_NODE = z.strictObject({
  id: ID,
  role: z.enum(SCENE_ROLES),
  kind: z.string().min(1).nullable(),
  title: z.string().min(1),
  subtitle: z.string(),
  overline: z.string().nullable(),
  icon: z.string().min(1),
  category: z.string().min(1),
  ariaLabel: z.string().min(1),
  ordinal: z.int().min(1).nullable(),
  parentId: ID.nullable(),
  depth: z.int().min(0),
  x: COORDINATE,
  y: COORDINATE,
  w: SIZE,
  h: SIZE,
  enabled: z.boolean(),
  collapsed: z.boolean(),
  opensBody: z.boolean(),
  unused: z.boolean(),
  feeds: z.string().nullable(),
  revision: z.int().min(1).nullable(),
  updateAvailable: z.boolean(),
  hiddenCount: z.int().min(0),
  chip: z.string().nullable(),
  pills: z.array(z.string()),
  ports: z.array(SCENE_PORT),
  outputs: z.array(SCENE_PORT),
  problems: z.array(PROBLEM),
  run: RUN_NODE.nullable(),
});

export const EDGE_END = z.strictObject({ nodeId: ID, port: ID });

export const SCENE_EDGE = z.strictObject({
  id: ID,
  kind: z.enum(['exec', 'value']),
  from: EDGE_END,
  to: EDGE_END,
  type: z.string().nullable(),
});

export const INSERT_POINT = z.strictObject({
  id: ID,
  scope: z.string().min(1),
  index: z.int().min(0),
  placement: z.enum(INSERT_PLACEMENTS),
  edgeId: ID.nullable(),
  slotId: ID.nullable(),
  after: ID.nullable(),
  before: ID.nullable(),
  x: COORDINATE,
  y: COORDINATE,
});

export const LOOP_RETURN = z.strictObject({
  id: ID,
  nodeId: ID,
  laneId: ID,
  label: z.string().min(1),
});

export const SCENE = z.strictObject({
  version: z.literal(1),
  mode: z.enum(SCENE_MODES),
  width: SIZE,
  height: SIZE,
  nodes: z.array(SCENE_NODE),
  edges: z.array(SCENE_EDGE),
  insertPoints: z.array(INSERT_POINT),
  loopReturns: z.array(LOOP_RETURN),
});

export const VIEWPORT = z.strictObject({
  x: COORDINATE,
  y: COORDINATE,
  zoom: z.number().positive(),
});

const COMMAND_SEQ = z.int().min(0);

export const VIEWPORT_COMMAND = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('fit'), seq: COMMAND_SEQ }),
  z.strictObject({ type: z.literal('fitSelection'), seq: COMMAND_SEQ }),
  z.strictObject({ type: z.literal('zoomIn'), seq: COMMAND_SEQ }),
  z.strictObject({ type: z.literal('zoomOut'), seq: COMMAND_SEQ }),
]);

export const CANVAS_PROPS = z.strictObject({
  scene: SCENE,
  theme: z.record(z.string().min(1), z.string()),
  run: RUN_OVERLAY.nullable(),
  selection: z.array(ID),
  focusNode: ID.nullable(),
  viewportCommand: VIEWPORT_COMMAND.nullable(),
  active: z.boolean(),
  idiom: z.enum(['touch', 'pointer']),
});

export const CONNECTION = z.strictObject({ from: EDGE_END, to: EDGE_END });

export const CANVAS_INTENT = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), ids: z.array(ID) }),
  z.strictObject({ type: z.literal('connect'), connection: CONNECTION }),
  z.strictObject({
    type: z.literal('move'),
    patches: z.array(z.strictObject({ id: ID, x: COORDINATE, y: COORDINATE })).min(1),
  }),
  z.strictObject({ type: z.literal('delete'), ids: z.array(ID).min(1) }),
  z.strictObject({ type: z.literal('openNode'), id: ID }),
  z.strictObject({ type: z.literal('insertOnEdge'), edgeId: ID }),
  z.strictObject({ type: z.literal('openSlot'), slotId: ID }),
  z.strictObject({
    type: z.literal('portDropEmpty'),
    from: EDGE_END,
    point: z.strictObject({ x: COORDINATE, y: COORDINATE }),
  }),
  z.strictObject({ type: z.literal('shortcut'), name: z.enum(SHORTCUTS) }),
  z.strictObject({ type: z.literal('viewportSettled'), viewport: VIEWPORT }),
  z.strictObject({
    type: z.literal('ready'),
    metrics: z.strictObject({ width: SIZE, height: SIZE }),
  }),
]);

export type Problem = z.infer<typeof PROBLEM>;
export type ProblemInput = z.infer<typeof PROBLEM_INPUT>;
export type RunNode = z.infer<typeof RUN_NODE>;
export type RunOverlay = z.infer<typeof RUN_OVERLAY>;
export type ScenePort = z.infer<typeof SCENE_PORT>;
export type SceneNode = z.infer<typeof SCENE_NODE>;
export type SceneEdge = z.infer<typeof SCENE_EDGE>;
export type EdgeEnd = z.infer<typeof EDGE_END>;
export type InsertPoint = z.infer<typeof INSERT_POINT>;
export type LoopReturn = z.infer<typeof LOOP_RETURN>;
export type Scene = z.infer<typeof SCENE>;
export type SceneRole = (typeof SCENE_ROLES)[number];
export type SceneMode = (typeof SCENE_MODES)[number];
export type PortShape = (typeof PORT_SHAPES)[number];
export type CanvasProps = z.infer<typeof CANVAS_PROPS>;
export type CanvasIntent = z.infer<typeof CANVAS_INTENT>;
export type Viewport = z.infer<typeof VIEWPORT>;
export type ViewportCommand = z.infer<typeof VIEWPORT_COMMAND>;
export type Shortcut = (typeof SHORTCUTS)[number];
