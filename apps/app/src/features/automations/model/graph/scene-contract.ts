import { z } from 'zod';

const ID = z.string().min(1);
const HANDLE = z.string().min(1);
const COORDINATE = z.number();
const SIZE = z.number().positive();

export const SCENE_FAMILIES = [
  'trigger',
  'start',
  'failure',
  'step',
  'decision',
  'fork',
  'try',
  'loop',
  'owner',
  'join',
  'terminal',
  'value',
] as const;

export const PORT_SHAPES = ['circle', 'diamond', 'square', 'hexagon', 'triangle'] as const;

export const PIN_GROUPS = ['input', 'output', 'inside', 'after'] as const;

export const EXEC_ROLES = ['next', 'branch', 'lane'] as const;

export const EDGE_KINDS = ['exec', 'value'] as const;

export const EDGE_STATES = ['normal', 'problem'] as const;

export const DIRECTIONS = ['ltr', 'ttb'] as const;

export const DENSITIES = ['pointer', 'touch'] as const;

export const SCENE_PIN = z.strictObject({
  handle: HANDLE,
  name: ID,
  label: z.string().min(1),
  shape: z.enum(PORT_SHAPES),
  type: z.string().min(1),
  group: z.enum(PIN_GROUPS),
  value: z.string().nullable(),
  wired: z.boolean(),
});

export const SCENE_CONDITION = z.strictObject({
  handle: HANDLE,
  text: z.string(),
  wired: z.boolean(),
});

export const SCENE_EXEC_ROW = z.strictObject({
  handle: HANDLE,
  port: ID,
  role: z.enum(EXEC_ROLES),
  label: z.string().min(1),
  wired: z.boolean(),
  endCap: z.string().min(1).nullable(),
  condition: SCENE_CONDITION.nullable(),
});

export const SCENE_PROBLEM = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
  fix: z.string().min(1),
});

export const SCENE_PROBLEM_ENTRY = SCENE_PROBLEM.extend({ nodeId: ID.nullable() });

export const SCENE_NODE = z.strictObject({
  id: ID,
  key: ID,
  kind: z.string().min(1),
  family: z.enum(SCENE_FAMILIES),
  title: z.string().min(1),
  kindName: z.string().min(1),
  summary: z.string(),
  icon: z.string().min(1),
  category: z.string().min(1),
  x: COORDINATE,
  y: COORDINATE,
  w: SIZE,
  h: SIZE,
  enabled: z.boolean(),
  execIn: HANDLE.nullable(),
  errorHandle: HANDLE.nullable(),
  mergeCount: z.int().min(2).nullable(),
  pairIndex: z.int().min(0).nullable(),
  rows: z.array(SCENE_EXEC_ROW),
  inputs: z.array(SCENE_PIN),
  outputs: z.array(SCENE_PIN),
  problems: z.array(SCENE_PROBLEM),
});

export const EDGE_END = z.strictObject({ nodeId: ID, handle: HANDLE });

export const SCENE_EDGE = z.strictObject({
  id: ID,
  kind: z.enum(EDGE_KINDS),
  source: EDGE_END,
  target: EDGE_END,
  state: z.enum(EDGE_STATES),
  fixed: z.boolean(),
  type: z.string().min(1).nullable(),
  message: z.string().min(1).nullable(),
  lane: z.string().min(1).nullable(),
});

export const GRAPH_SCENE = z.strictObject({
  version: z.literal(1),
  direction: z.enum(DIRECTIONS),
  density: z.enum(DENSITIES),
  width: SIZE,
  height: SIZE,
  nodes: z.array(SCENE_NODE),
  edges: z.array(SCENE_EDGE),
  unplaced: z.array(ID),
  problems: z.array(SCENE_PROBLEM_ENTRY),
});

export type SceneFamily = (typeof SCENE_FAMILIES)[number];
export type PortShape = (typeof PORT_SHAPES)[number];
export type PinGroup = (typeof PIN_GROUPS)[number];
export type ExecRole = (typeof EXEC_ROLES)[number];
export type SceneDirection = (typeof DIRECTIONS)[number];
export type ScenePin = z.infer<typeof SCENE_PIN>;
export type SceneCondition = z.infer<typeof SCENE_CONDITION>;
export type SceneExecRow = z.infer<typeof SCENE_EXEC_ROW>;
export type SceneProblem = z.infer<typeof SCENE_PROBLEM>;
export type SceneProblemEntry = z.infer<typeof SCENE_PROBLEM_ENTRY>;
export type GraphSceneNode = z.infer<typeof SCENE_NODE>;
export type EdgeEnd = z.infer<typeof EDGE_END>;
export type GraphSceneEdge = z.infer<typeof SCENE_EDGE>;
export type GraphScene = z.infer<typeof GRAPH_SCENE>;
