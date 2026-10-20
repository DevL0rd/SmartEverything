import type { FlowType, PortValue } from '@smarteverything/domain';

export type TitleOf = (key: string) => string;

const ROOT_WORDS: Readonly<Record<string, string>> = {
  vars: 'Variable',
  inputs: 'Input',
  trigger: 'Trigger',
  home: 'Home',
  run: 'Run',
};

const SEPARATOR = ' › ';

export function plainChain(root: string, port: string, titleOf: TitleOf): string {
  return `${ROOT_WORDS[root] ?? titleOf(root)}${SEPARATOR}${port}`;
}

export function plainReference(value: PortValue, titleOf: TitleOf): string {
  return 'wire' in value ? plainChain(value.wire.from, value.wire.port, titleOf) : 'a fixed value';
}

const LEAF_WORDS: Readonly<Record<string, string>> = {
  boolean: 'Yes or no',
  number: 'Number',
  text: 'Text',
  duration: 'Duration',
  instant: 'Moment',
  timeOfDay: 'Time of day',
  date: 'Date',
  choice: 'Choice',
  color: 'Colour',
  error: 'Error',
  any: 'Anything',
  param: 'Anything',
  record: 'Details',
};

export const REF_WORDS: Readonly<Record<string, string>> = {
  device: 'Device',
  room: 'Room',
  group: 'Group',
  scene: 'Scene',
  person: 'Person',
  computer: 'Computer',
  phone: 'Phone',
  camera: 'Camera',
  chat: 'Chat',
  value: 'Shared value',
  automation: 'Automation',
  function: 'Custom Node',
  target: 'Target',
  secret: 'Secret',
};

export function typeText(type: FlowType): string {
  if (type.t === 'list') return `List of ${typeText(type.of).toLowerCase()}`;
  if (type.t === 'optional') return `${typeText(type.of)}, may be empty`;
  if (type.t === 'ref') return REF_WORDS[type.of] ?? 'Reference';
  return LEAF_WORDS[type.t] ?? 'Anything';
}
