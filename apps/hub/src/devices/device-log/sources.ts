import { actionsSource } from './actions';
import { changesSource } from './changes';
import { eventsSource } from './events';
import { microwaveCyclesSource } from './microwave-cycles';
import { pressesSource } from './presses';
import type { DeviceLogSource } from './types';

const CLAIMING: readonly DeviceLogSource[] = [
  changesSource(),
  actionsSource(),
  pressesSource(),
  microwaveCyclesSource(),
];

export const DEVICE_LOG_SOURCES: readonly DeviceLogSource[] = [...CLAIMING, eventsSource(CLAIMING)];
