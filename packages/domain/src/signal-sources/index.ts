import { AUTOMATION_RUNTIME_SIGNAL_SOURCES } from './automation';
export { AUTOMATION_RUNTIME_SIGNAL_SOURCES } from './automation';
import { DEVICE_SIGNALS } from './device';
import { EVENT_SIGNALS } from './event';
import type { SignalSourceSpec } from './spec';
import { WEATHER_SIGNALS } from './weather';
import { HEALTH_SIGNALS } from './health';
import { ASSISTANT_SIGNALS } from './assistant';
import { SCHEDULE_SIGNALS } from './schedule';

export * from './spec';

export * from './health';

export const SIGNAL_SOURCES: readonly SignalSourceSpec[] = [
  ...AUTOMATION_RUNTIME_SIGNAL_SOURCES,
  DEVICE_SIGNALS,
  EVENT_SIGNALS,
  WEATHER_SIGNALS,
  HEALTH_SIGNALS,
  ASSISTANT_SIGNALS,
  SCHEDULE_SIGNALS,
];
