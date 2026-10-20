import { AUTOMATION_RUNTIME_SIGNAL_SOURCES } from './automation';
export {
  AUTOMATION_EVENT_SOURCE,
  AUTOMATION_RUNTIME_SIGNAL_SOURCES,
  AUTOMATION_TIMER_SOURCE,
  WEBHOOK_SOURCE,
} from './automation';
import { COMPUTER_SIGNALS } from './computer';
import { DEVICE_SIGNALS } from './device';
import { EVENT_SIGNALS } from './event';
import { HUB_SIGNALS } from './hub';
import type { SignalSourceSpec } from './spec';
import { WEATHER_SIGNALS } from './weather';
import { HEALTH_SIGNALS } from './health';
import { ASSISTANT_SIGNALS } from './assistant';
import { SCHEDULE_SIGNALS } from './schedule';
import { PROVIDER_SIGNALS } from './provider';
import { LISTENING_SIGNALS } from './listening';
import { CALL_SIGNALS } from './call';

export * from './spec';

export * from './health';

export * from './hub';

export * from './rates';

export * from './device';

export * from './device-command';

export * from './provider';

export * from './listening';

export * from './call';

export const SIGNAL_SOURCES: readonly SignalSourceSpec[] = [
  ...AUTOMATION_RUNTIME_SIGNAL_SOURCES,
  DEVICE_SIGNALS,
  COMPUTER_SIGNALS,
  EVENT_SIGNALS,
  WEATHER_SIGNALS,
  HEALTH_SIGNALS,
  ASSISTANT_SIGNALS,
  SCHEDULE_SIGNALS,
  HUB_SIGNALS,
  PROVIDER_SIGNALS,
  LISTENING_SIGNALS,
  CALL_SIGNALS,
];
