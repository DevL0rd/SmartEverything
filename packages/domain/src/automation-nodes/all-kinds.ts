import { AI_MODEL_KINDS } from './ai-model';
import { AI_TOOLS_KINDS } from './ai-tools';
import { AUTOMATION_KINDS } from './automation';
import { CAMERA_SIGNAL_KINDS } from './cameras-signals';
import { COMPUTERS_PHONES_KINDS } from './computers-phones';
import { DATE_KINDS } from './dates';
import { DATE_MORE_KINDS } from './dates-more';
import { DEBUG_KINDS } from './debug';
import type { NodeKind } from './define';
import { DEVICE_NODE_KINDS } from './devices';
import { DEVICE_EXTRA_KINDS } from './devices-extra';
import { FLOW_KINDS } from './flow';
import { FLOW_MORE_KINDS } from './flow-more';
import { HTTP_KINDS } from './http';
import { LIST_KINDS } from './lists';
import { LIST_MORE_KINDS } from './lists-more';
import { LOGIC_KINDS } from './logic';
import { LOGIC_MORE_KINDS } from './logic-more';
import { MATH_KINDS } from './math';
import { MATH_MORE_KINDS } from './math-more';
import { NOTIFY_KINDS } from './notify';
import { OBJECT_KINDS } from './objects';
import { OBJECT_MORE_KINDS } from './objects-more';
import { HOME_STRUCTURE_NODE_KINDS, PEOPLE_NODE_KINDS } from './people';
import { RANDOM_KINDS } from './random';
import { RANDOM_MORE_KINDS } from './random-more';
import type { NodeRegistry } from './registry';
import { buildRegistry } from './registry';
import { STATE_NODE_KINDS } from './state';
import { STATE_EXTRA_KINDS } from './state-extra';
import { STATE_TIMING_KINDS } from './state-timing';
import { TEXT_KINDS } from './text';
import { TEXT_MORE_KINDS } from './text-more';
import { TRIGGER_KINDS } from './triggers';
import { TRIGGER_V11_KINDS } from './triggers-v11';
import { UTIL_KINDS } from './util';
import { VAR_KINDS } from './vars';
import { WEATHER_NODE_KINDS } from './weather';

export const ALL_NODE_KINDS: readonly NodeKind[] = [
  ...TRIGGER_KINDS,
  ...TRIGGER_V11_KINDS,
  ...FLOW_KINDS,
  ...FLOW_MORE_KINDS,
  ...LOGIC_KINDS,
  ...LOGIC_MORE_KINDS,
  ...MATH_KINDS,
  ...MATH_MORE_KINDS,
  ...TEXT_KINDS,
  ...TEXT_MORE_KINDS,
  ...LIST_KINDS,
  ...LIST_MORE_KINDS,
  ...OBJECT_KINDS,
  ...OBJECT_MORE_KINDS,
  ...DATE_KINDS,
  ...DATE_MORE_KINDS,
  ...RANDOM_KINDS,
  ...RANDOM_MORE_KINDS,
  ...VAR_KINDS,
  ...DEVICE_NODE_KINDS,
  ...DEVICE_EXTRA_KINDS,
  ...STATE_NODE_KINDS,
  ...STATE_TIMING_KINDS,
  ...STATE_EXTRA_KINDS,
  ...PEOPLE_NODE_KINDS,
  ...HOME_STRUCTURE_NODE_KINDS,
  ...NOTIFY_KINDS,
  ...COMPUTERS_PHONES_KINDS,
  ...WEATHER_NODE_KINDS,
  ...CAMERA_SIGNAL_KINDS,
  ...AI_TOOLS_KINDS,
  ...AI_MODEL_KINDS,
  ...HTTP_KINDS,
  ...AUTOMATION_KINDS,
  ...DEBUG_KINDS,
  ...UTIL_KINDS,
];

export const NODE_REGISTRY: NodeRegistry = buildRegistry(ALL_NODE_KINDS);
