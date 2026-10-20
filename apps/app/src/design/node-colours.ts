import type { ColourRole } from './tokens';

export const NODE_CATEGORIES = [
  'Triggers',
  'Flow',
  'Logic',
  'Math',
  'Text',
  'Lists',
  'Objects',
  'Time',
  'Random',
  'Variables',
  'State and timing',
  'Devices',
  'People',
  'Cameras and weather',
  'Computers and phones',
  'Notify',
  'AI and tools',
  'Web',
  'Automations',
  'Custom Nodes',
  'Debug',
  'Utilities',
] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export const NODE_CATEGORY_COLOUR: Readonly<Record<NodeCategory, ColourRole>> = {
  Triggers: 'primary',
  Flow: 'viz-violet',
  Logic: 'viz-blue',
  Math: 'viz-2',
  Text: 'viz-3',
  Lists: 'viz-5',
  Objects: 'viz-5',
  Time: 'viz-4',
  Random: 'viz-4',
  Variables: 'caution',
  'State and timing': 'caution',
  Devices: 'viz-1',
  People: 'viz-1',
  'Cameras and weather': 'viz-1',
  'Computers and phones': 'viz-1',
  Notify: 'viz-magenta',
  'AI and tools': 'primary',
  Web: 'viz-6',
  Automations: 'viz-6',
  'Custom Nodes': 'viz-6',
  Debug: 'viz-6',
  Utilities: 'viz-6',
};

export const ORB_SHINE_CATEGORIES: ReadonlySet<NodeCategory> = new Set(['AI and tools']);

export const FALLBACK_CATEGORY_COLOUR: ColourRole = 'viz-6';

export function isNodeCategory(name: string): name is NodeCategory {
  return Object.hasOwn(NODE_CATEGORY_COLOUR, name);
}

export function categoryColour(name: string): ColourRole {
  return isNodeCategory(name) ? NODE_CATEGORY_COLOUR[name] : FALLBACK_CATEGORY_COLOUR;
}

export const VALUE_TYPES = [
  'boolean',
  'number',
  'text',
  'duration',
  'instant',
  'timeOfDay',
  'date',
  'list',
  'record',
  'device',
  'room',
  'group',
  'scene',
  'person',
  'computer',
  'phone',
  'camera',
  'chat',
  'value',
  'automation',
  'function',
  'choice',
  'color',
  'error',
  'any',
] as const;

export type ValueType = (typeof VALUE_TYPES)[number];

export type TypeShape = 'circle' | 'diamond' | 'square' | 'hexagon' | 'triangle' | 'ring';

export const TYPE_COLOUR: Readonly<Record<ValueType, ColourRole>> = {
  boolean: 'viz-violet',
  number: 'viz-2',
  text: 'viz-3',
  duration: 'viz-4',
  instant: 'viz-4',
  timeOfDay: 'viz-4',
  date: 'viz-4',
  list: 'viz-5',
  record: 'viz-5',
  device: 'viz-1',
  room: 'viz-1',
  group: 'viz-1',
  scene: 'viz-1',
  person: 'viz-1',
  computer: 'viz-1',
  phone: 'viz-1',
  camera: 'viz-1',
  chat: 'viz-1',
  value: 'viz-1',
  automation: 'viz-1',
  function: 'viz-1',
  choice: 'viz-blue',
  color: 'viz-magenta',
  error: 'critical',
  any: 'outline',
};

export const TYPE_SHAPE: Readonly<Record<ValueType, TypeShape>> = {
  boolean: 'circle',
  number: 'circle',
  text: 'circle',
  duration: 'circle',
  instant: 'circle',
  timeOfDay: 'circle',
  date: 'circle',
  list: 'diamond',
  record: 'square',
  device: 'hexagon',
  room: 'hexagon',
  group: 'hexagon',
  scene: 'hexagon',
  person: 'hexagon',
  computer: 'hexagon',
  phone: 'hexagon',
  camera: 'hexagon',
  chat: 'hexagon',
  value: 'hexagon',
  automation: 'hexagon',
  function: 'hexagon',
  choice: 'circle',
  color: 'circle',
  error: 'triangle',
  any: 'ring',
};

const OPTIONAL = /^optional<(.+)>$/;

export interface ParsedType {
  readonly type: ValueType;
  readonly optional: boolean;
}

export function isValueType(name: string): name is ValueType {
  return Object.hasOwn(TYPE_COLOUR, name);
}

export function parseValueType(text: string): ParsedType {
  let rest = text.trim();
  let optional = false;
  for (let match = OPTIONAL.exec(rest); match?.[1] !== undefined; match = OPTIONAL.exec(rest)) {
    optional = true;
    rest = match[1].trim();
  }
  const head = /^[A-Za-z]+/.exec(rest)?.[0] ?? '';
  return { type: isValueType(head) ? head : 'any', optional };
}

export function typeColour(text: string): ColourRole {
  return TYPE_COLOUR[parseValueType(text).type];
}

export function typeShape(text: string): TypeShape {
  return TYPE_SHAPE[parseValueType(text).type];
}

export function colourVariable(role: ColourRole): string {
  return `--se-${role}`;
}
