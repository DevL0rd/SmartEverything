import type { StarterNode } from './ids';
import { LEAVE_HOME_CHECK, SWITCH_DEVICES } from './home';
import { FLASH_THE_LIGHTS, LIGHTS_OFF_AFTER, WAKE_UP_LIGHT } from './lights';
import { SPEAK_OR_PUSH } from './notify';

export { STARTER_NODE_IDS, type StarterNode } from './ids';
export {
  FLASH_THE_LIGHTS,
  LEAVE_HOME_CHECK,
  LIGHTS_OFF_AFTER,
  SPEAK_OR_PUSH,
  SWITCH_DEVICES,
  WAKE_UP_LIGHT,
};

export const STARTER_NODES: readonly StarterNode[] = [
  SPEAK_OR_PUSH,
  SWITCH_DEVICES,
  LIGHTS_OFF_AFTER,
  FLASH_THE_LIGHTS,
  WAKE_UP_LIGHT,
  LEAVE_HOME_CHECK,
];
