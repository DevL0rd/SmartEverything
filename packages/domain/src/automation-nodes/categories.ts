export const NODE_CATEGORY_IDS = [
  'triggers',
  'flow',
  'logic',
  'math',
  'text',
  'lists',
  'objects',
  'time',
  'random',
  'variables',
  'devices',
  'state',
  'people',
  'notify',
  'computers',
  'cameras',
  'ai',
  'web',
  'automations',
  'reusable',
  'debug',
  'utilities',
] as const;

export type NodeCategoryId = (typeof NODE_CATEGORY_IDS)[number];

const CATEGORY_NAMES: Readonly<Record<NodeCategoryId, string>> = {
  triggers: 'Triggers',
  flow: 'Flow',
  logic: 'Logic',
  math: 'Math',
  text: 'Text',
  lists: 'Lists',
  objects: 'Objects',
  time: 'Time',
  random: 'Random',
  variables: 'Variables',
  devices: 'Devices',
  state: 'State and timing',
  people: 'People',
  notify: 'Notify',
  computers: 'Computers and phones',
  cameras: 'Cameras and weather',
  ai: 'AI and tools',
  web: 'Web',
  automations: 'Automations',
  reusable: 'Custom Nodes',
  debug: 'Debug',
  utilities: 'Utilities',
};

export const NODE_CATEGORIES: readonly { readonly id: NodeCategoryId; readonly name: string }[] =
  NODE_CATEGORY_IDS.map((id) => ({ id, name: CATEGORY_NAMES[id] }));

export function categoryOrder(id: NodeCategoryId): number {
  return NODE_CATEGORY_IDS.indexOf(id);
}

export function categoryName(id: NodeCategoryId): string {
  return CATEGORY_NAMES[id];
}
